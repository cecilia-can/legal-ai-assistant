"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { MessageList } from "@/components/chat/MessageList";
import { FullMessageList } from "./FullMessageList";
import {
  createMessageFixture,
  MESSAGE_BENCHMARK_KINDS,
  MESSAGE_BENCHMARK_SCENARIOS,
  type MessageBenchmarkKind,
  type MessageBenchmarkScenario,
} from "@/lib/benchmark/messageFixtures";
import { formatMs, summarizeMs } from "@/lib/benchmark/stats";

const DEFAULT_COUNT = 1_000;
const DEFAULT_SEED = 20_260_909;
const COUNT_OPTIONS = [100, 1_000, 10_000] as const;
const SCROLL_DURATIONS = [
  { value: 5_000, label: "正常：5 秒" },
  { value: 2_000, label: "压力：2 秒" },
] as const;

const scenarioLabels: Record<MessageBenchmarkScenario, string> = {
  "short-text": "短文本（80% 短文本）",
  mixed: "真实混合（推荐）",
  stress: "复杂内容压力",
  "dynamic-height": "动态高度",
};

const kindLabels: Record<MessageBenchmarkKind, string> = {
  "short-text": "短文本",
  "medium-text": "中等文本",
  "long-text": "长文本",
  markdown: "Markdown",
  code: "代码块",
  table: "表格",
  tall: "超高消息",
};

type BenchmarkConfig = {
  count: number;
  scenario: MessageBenchmarkScenario;
  seed: number;
};

type ListImplementation = "virtual" | "full";

const implementationLabels: Record<ListImplementation, string> = {
  virtual: "虚拟列表（当前实现）",
  full: "全量渲染（对照组）",
};

type RenderStats = {
  mountedMessages: number;
  listDomNodes: number;
};

type ScrollRun = {
  durationMs: number;
  refreshRate: number;
  frameBudgetMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  slowFrameRate: number;
  estimatedDroppedFrames: number;
  estimatedDroppedFrameRate: number;
  emptyVisibleFrameRate: number;
  minimumMountedMessages: number;
  maximumMountedMessages: number;
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function readRenderStats(root: HTMLElement): RenderStats {
  return {
    mountedMessages: root.querySelectorAll('[aria-label$="消息"]').length,
    listDomNodes: root.querySelectorAll("*").length,
  };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function getScrollContainer(root: HTMLElement): HTMLElement {
  const scrollContainer = root.querySelector<HTMLElement>(".overflow-y-auto");
  if (!scrollContainer) {
    throw new Error("未找到消息列表滚动容器。");
  }

  return scrollContainer;
}

async function resetScrollToTop(scroller: HTMLElement): Promise<void> {
  scroller.scrollTop = 0;
  await nextFrame();
  await nextFrame();
}

async function measureFrameTiming(
  scroller: HTMLElement,
  durationMs: number,
  frameBudgetMs: number,
) {
  await resetScrollToTop(scroller);
  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);

  return new Promise<{ samples: number[]; estimatedDroppedFrames: number }>(
    (resolve) => {
      const samples: number[] = [];
      let previousTime: number | undefined;
      let startTime: number | undefined;

      function step(now: number) {
        if (startTime === undefined) {
          startTime = now;
        }
        if (previousTime !== undefined) {
          samples.push(now - previousTime);
        }
        previousTime = now;

        const progress = Math.min((now - startTime) / durationMs, 1);
        scroller.scrollTop = maxScrollTop * progress;
        if (progress < 1) {
          requestAnimationFrame(step);
          return;
        }

        const estimatedDroppedFrames = samples.reduce(
          (total, sample) =>
            total + Math.max(0, Math.round(sample / frameBudgetMs) - 1),
          0,
        );
        resolve({ samples, estimatedDroppedFrames });
      }

      requestAnimationFrame(step);
    },
  );
}

/** 独立读取布局的可见内容检查，不纳入帧耗时结果。 */
async function measureVisibleCoverage(
  root: HTMLElement,
  scroller: HTMLElement,
  durationMs: number,
) {
  await resetScrollToTop(scroller);
  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);

  return new Promise<{
    emptyVisibleFrames: number;
    sampleCount: number;
    minimumMountedMessages: number;
    maximumMountedMessages: number;
  }>((resolve) => {
    let startTime: number | undefined;
    let emptyVisibleFrames = 0;
    let sampleCount = 0;
    let minimumMountedMessages = Number.POSITIVE_INFINITY;
    let maximumMountedMessages = 0;

    function step(now: number) {
      if (startTime === undefined) {
        startTime = now;
      }

      const viewport = scroller.getBoundingClientRect();
      const messages = Array.from(
        root.querySelectorAll<HTMLElement>('[aria-label$="消息"]'),
      );
      const hasVisibleMessage = messages.some((message) => {
        const bounds = message.getBoundingClientRect();
        return bounds.bottom > viewport.top && bounds.top < viewport.bottom;
      });

      sampleCount += 1;
      minimumMountedMessages = Math.min(minimumMountedMessages, messages.length);
      maximumMountedMessages = Math.max(maximumMountedMessages, messages.length);
      if (!hasVisibleMessage) {
        emptyVisibleFrames += 1;
      }

      const progress = Math.min((now - startTime) / durationMs, 1);
      scroller.scrollTop = maxScrollTop * progress;
      if (progress < 1) {
        requestAnimationFrame(step);
        return;
      }

      resolve({
        emptyVisibleFrames,
        sampleCount,
        minimumMountedMessages:
          minimumMountedMessages === Number.POSITIVE_INFINITY
            ? 0
            : minimumMountedMessages,
        maximumMountedMessages,
      });
    }

    requestAnimationFrame(step);
  });
}

export function MessageListBenchClient() {
  const [config, setConfig] = useState<BenchmarkConfig>({
    count: DEFAULT_COUNT,
    scenario: "mixed",
    seed: DEFAULT_SEED,
  });
  const [draftCount, setDraftCount] = useState(String(DEFAULT_COUNT));
  const [draftScenario, setDraftScenario] =
    useState<MessageBenchmarkScenario>("mixed");
  const [draftSeed, setDraftSeed] = useState(String(DEFAULT_SEED));
  const [implementation, setImplementation] =
    useState<ListImplementation>("virtual");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [renderStats, setRenderStats] = useState<RenderStats>({
    mountedMessages: 0,
    listDomNodes: 0,
  });
  const [durationMs, setDurationMs] = useState<number>(5_000);
  const [refreshRate, setRefreshRate] = useState<number>(60);
  const [isRunning, setIsRunning] = useState(false);
  const [scrollRun, setScrollRun] = useState<ScrollRun | null>(null);
  const listRootRef = useRef<HTMLDivElement>(null);

  const fixture = useMemo(() => createMessageFixture(config), [config]);

  useEffect(() => {
    if (isRunning) {
      return;
    }

    const root = listRootRef.current;
    if (!root) {
      return;
    }

    let frameId: number | undefined;
    const updateStats = () => {
      frameId = undefined;
      setRenderStats(readRenderStats(root));
    };
    const scheduleStatsUpdate = () => {
      if (frameId === undefined) {
        frameId = requestAnimationFrame(updateStats);
      }
    };
    const observer = new MutationObserver(scheduleStatsUpdate);
    observer.observe(root, { childList: true, subtree: true });
    scheduleStatsUpdate();

    return () => {
      observer.disconnect();
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [fixture.summary.fingerprint, isRunning]);

  function applyConfig() {
    const count = Number(draftCount);
    const seed = Number(draftSeed);

    if (!Number.isSafeInteger(count) || count <= 0 || count > 100_000) {
      setValidationError("消息数量需为 1 到 100,000 之间的整数。");
      return;
    }
    if (!Number.isSafeInteger(seed)) {
      setValidationError("Seed 必须是安全整数。");
      return;
    }

    setValidationError(null);
    setScrollRun(null);
    setConfig({ count, scenario: draftScenario, seed });
  }

  function resetDefaults() {
    setDraftCount(String(DEFAULT_COUNT));
    setDraftScenario("mixed");
    setDraftSeed(String(DEFAULT_SEED));
    setValidationError(null);
    setScrollRun(null);
    setConfig({ count: DEFAULT_COUNT, scenario: "mixed", seed: DEFAULT_SEED });
  }

  async function runScrollBenchmark() {
    const root = listRootRef.current;
    if (!root || isRunning) {
      return;
    }

    setValidationError(null);
    setScrollRun(null);
    setIsRunning(true);

    try {
      // 等待实时 DOM 计数观察器卸载，避免它影响帧耗时。
      await nextFrame();
      const scroller = getScrollContainer(root);
      const frameBudgetMs = 1_000 / refreshRate;
      const timing = await measureFrameTiming(scroller, durationMs, frameBudgetMs);
      const coverage = await measureVisibleCoverage(root, scroller, durationMs);
      const summary = summarizeMs(timing.samples);
      const estimatedFrameCount =
        timing.samples.length + timing.estimatedDroppedFrames;

      setScrollRun({
        durationMs,
        refreshRate,
        frameBudgetMs,
        p50Ms: summary.p50Ms,
        p95Ms: summary.p95Ms,
        maxMs: summary.maxMs,
        slowFrameRate:
          timing.samples.length === 0
            ? 0
            : (timing.samples.filter((sample) => sample > frameBudgetMs).length /
                timing.samples.length) *
              100,
        estimatedDroppedFrames: timing.estimatedDroppedFrames,
        estimatedDroppedFrameRate:
          estimatedFrameCount === 0
            ? 0
            : (timing.estimatedDroppedFrames / estimatedFrameCount) * 100,
        emptyVisibleFrameRate:
          coverage.sampleCount === 0
            ? 0
            : (coverage.emptyVisibleFrames / coverage.sampleCount) * 100,
        minimumMountedMessages: coverage.minimumMountedMessages,
        maximumMountedMessages: coverage.maximumMountedMessages,
      });
    } catch (error) {
      setValidationError(
        error instanceof Error ? error.message : "自动滚动测试未能完成。",
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1600px] flex-col gap-5 p-4 md:p-6 lg:p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">消息虚拟列表基准</h1>
        <p className="max-w-4xl text-sm leading-6 text-muted">
          此页面使用真实的 MessageList 与消息渲染组件，仅替换数据来源。生产环境不可访问；请在相同场景、数量和数据指纹下比较不同实现。
        </p>
      </header>

      <section className="space-y-4 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span>测试场景</span>
            <select value={draftScenario} onChange={(event) => setDraftScenario(event.target.value as MessageBenchmarkScenario)} className="min-w-52 rounded-md border border-border bg-background px-3 py-2">
              {MESSAGE_BENCHMARK_SCENARIOS.map((scenario) => (
                <option key={scenario} value={scenario}>{scenarioLabels[scenario]}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>消息数量</span>
            <input type="number" min={1} max={100_000} step={1} list="message-benchmark-counts" value={draftCount} onChange={(event) => setDraftCount(event.target.value)} className="w-40 rounded-md border border-border bg-background px-3 py-2" />
            <datalist id="message-benchmark-counts">
              {COUNT_OPTIONS.map((count) => <option key={count} value={count} />)}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Seed</span>
            <input type="number" step={1} value={draftSeed} onChange={(event) => setDraftSeed(event.target.value)} className="w-40 rounded-md border border-border bg-background px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>列表实现</span>
            <select
              value={implementation}
              onChange={(event) =>
                setImplementation(event.target.value as ListImplementation)
              }
              disabled={isRunning}
              className="min-w-52 rounded-md border border-border bg-background px-3 py-2"
            >
              {(Object.keys(implementationLabels) as ListImplementation[]).map(
                (option) => (
                  <option key={option} value={option}>
                    {implementationLabels[option]}
                  </option>
                ),
              )}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={applyConfig} disabled={isRunning} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">生成数据集</button>
            <button type="button" onClick={resetDefaults} disabled={isRunning} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-background disabled:opacity-60">重置</button>
          </div>
        </div>
        {validationError ? <p className="text-sm text-destructive" role="alert">{validationError}</p> : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="内存中消息数" value={formatNumber(fixture.summary.count)} />
        <MetricCard
          label="当前挂载消息项"
          value={formatNumber(renderStats.mountedMessages)}
          hint={implementation === "virtual" ? "随滚动更新" : "应接近消息总数"}
        />
        <MetricCard label="列表内部 DOM 节点" value={formatNumber(renderStats.listDomNodes)} hint="不包含控制面板" />
        <MetricCard label="数据指纹" value={fixture.summary.fingerprint} />
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <h2 className="text-sm font-medium">自动滚动测量</h2>
            <p className="mt-1 text-xs text-muted">会连续执行帧耗时采样与可见内容验证两次滚动；运行时请勿操作页面。</p>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span>滚动速度</span>
            <select value={durationMs} onChange={(event) => setDurationMs(Number(event.target.value))} disabled={isRunning} className="rounded-md border border-border bg-background px-3 py-2">
              {SCROLL_DURATIONS.map((duration) => <option key={duration.value} value={duration.value}>{duration.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>屏幕刷新率</span>
            <select value={refreshRate} onChange={(event) => setRefreshRate(Number(event.target.value))} disabled={isRunning} className="rounded-md border border-border bg-background px-3 py-2">
              <option value={60}>60Hz（16.67ms/帧）</option>
              <option value={120}>120Hz（8.33ms/帧）</option>
            </select>
          </label>
          <button type="button" onClick={() => void runScrollBenchmark()} disabled={isRunning} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">
            {isRunning ? "测量中…" : "运行自动滚动测量"}
          </button>
        </div>
        {scrollRun ? <ScrollRunResults result={scrollRun} /> : <p className="text-sm text-muted">建议以 10,000 条 mixed 数据运行正常与压力两档，并分别重复 5～10 次后比较中位数和 p95。</p>}
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-medium">当前数据集</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-muted">场景</dt><dd>{scenarioLabels[fixture.summary.scenario]}</dd></div>
          <div><dt className="text-muted">Seed</dt><dd className="font-mono">{fixture.summary.seed}</dd></div>
          {MESSAGE_BENCHMARK_KINDS.filter((kind) => fixture.summary.kindCounts[kind] > 0).map((kind) => (
            <div key={kind}><dt className="text-muted">{kindLabels[kind]}</dt><dd>{formatNumber(fixture.summary.kindCounts[kind])} 条</dd></div>
          ))}
        </dl>
      </section>

      <section className="flex min-h-[620px] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">{implementationLabels[implementation]}</h2>
          <p className="mt-1 text-xs text-muted">两种实现共用同一份数据与 MessageBubble。全量渲染仅移除虚拟窗口化，便于比较 DOM 规模与滚动指标。</p>
        </div>
        <div ref={listRootRef} className="min-h-0 flex-1">
          {implementation === "virtual" ? (
            <MessageList
              key={`${implementation}-${fixture.summary.fingerprint}`}
              messages={fixture.messages}
            />
          ) : (
            <FullMessageList
              key={`${implementation}-${fixture.summary.fingerprint}`}
              messages={fixture.messages}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 break-all font-mono text-xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function ScrollRunResults({ result }: { result: ScrollRun }) {
  const rows = [
    ["帧预算", `${formatMs(result.frameBudgetMs)}ms（${result.refreshRate}Hz）`],
    ["p50 帧耗时", `${formatMs(result.p50Ms)}ms`],
    ["p95 帧耗时", `${formatMs(result.p95Ms)}ms`],
    ["最大帧耗时", `${formatMs(result.maxMs)}ms`],
    ["超过帧预算的比例", `${result.slowFrameRate.toFixed(2)}%`],
    ["估算掉帧", `${result.estimatedDroppedFrames}（${result.estimatedDroppedFrameRate.toFixed(2)}%）`],
    ["无可见消息帧率", `${result.emptyVisibleFrameRate.toFixed(2)}%`],
    ["挂载消息项范围", `${result.minimumMountedMessages} ～ ${result.maximumMountedMessages}`],
  ] as const;

  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-background p-3">
      <p className="text-xs text-muted">总时长 {formatNumber(result.durationMs)}ms。p95 与掉帧为主线程 requestAnimationFrame 近似值；“无可见消息帧率”在独立的布局读取轮次中测得，不计入帧耗时。</p>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
        {rows.map(([label, value]) => <div key={label}><dt className="text-muted">{label}</dt><dd className="font-mono">{value}</dd></div>)}
      </dl>
    </div>
  );
}