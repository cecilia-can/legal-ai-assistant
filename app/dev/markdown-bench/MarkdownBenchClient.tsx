"use client";

import { createElement, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

import { MessageBubble } from "@/components/chat/MessageBubble";
import { MessageContent } from "@/components/chat/MessageContent";
import { MessageList } from "@/components/chat/MessageList";
import { LegacyMessageList } from "@/app/dev/markdown-bench/LegacyMessageList";
import {
  DEFAULT_PARSE_MATRIX,
  LEGAL_BENCH_PRESETS,
  SINGLE_BENCH_PRESETS,
  caseLabel,
  generateMarkdown,
  generateMarkdownFromCase,
  simulateStreamingLengths,
  type MarkdownBenchCase,
} from "@/lib/benchmark/markdownFixtures";
import { formatMs, summarizeMs } from "@/lib/benchmark/stats";
import type { ChatMessage } from "@/types/chat";

type BenchMode =
  | "content-only"
  | "full-list"
  | "incremental-update"
  | "incremental-update-legacy";
type CaseScope = "single" | "all-legal" | "all-default";

const CUSTOM_PRESET_INDEX = -1;

type BenchRow = {
  mode: BenchMode;
  label: string;
  totalChars: number;
  codeBlockCount: number;
  historyCount: number;
  chunkSize: number;
  steps: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  meanMs: number;
};

type BenchProgress = {
  percent: number;
  label: string;
  completedSteps: number;
  totalSteps: number;
};

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function buildHistoryMessages(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `history-${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    content:
      index % 2 === 0
        ? `历史用户消息 ${index + 1}`
        : generateMarkdown(400, { profile: "legal-typical" }),
    createdAt: new Date(Date.now() - (count - index) * 60_000),
  }));
}

function renderIntoMount(
  mount: HTMLElement,
  element: ReturnType<typeof createElement>,
): () => void {
  const container = document.createElement("div");
  mount.appendChild(container);
  const root = createRoot(container);

  flushSync(() => {
    root.render(element);
  });

  return () => {
    root.unmount();
    mount.removeChild(container);
  };
}

function countPlannedSteps(
  cases: MarkdownBenchCase[],
  chunkSize: number,
  maxSteps: number,
  historyCounts: number[],
): number {
  let total = 0;
  const modesPerHistory = 3; // full-list + incremental-update + incremental-update-legacy

  for (const testCase of cases) {
    const markdown = generateMarkdownFromCase(testCase);
    const steps = simulateStreamingLengths(markdown.length, chunkSize, maxSteps).length;
    total += steps * (1 + historyCounts.length * modesPerHistory);
  }

  return total;
}

async function measureContentOnly(
  mount: HTMLElement,
  markdown: string,
  chunkSize: number,
  maxSteps: number,
  onStep: () => void,
) {
  const lengths = simulateStreamingLengths(markdown.length, chunkSize, maxSteps);
  const samples: number[] = [];

  for (const length of lengths) {
    const partial = markdown.slice(0, length);
    const start = performance.now();
    const cleanup = renderIntoMount(
      mount,
      createElement(MessageContent, { content: partial }),
    );
    cleanup();
    samples.push(performance.now() - start);
    onStep();
    await yieldToMain();
  }

  return { chunkSize, steps: lengths.length, ...summarizeMs(samples) };
}

async function measureFullList(
  mount: HTMLElement,
  markdown: string,
  chunkSize: number,
  historyCount: number,
  maxSteps: number,
  onStep: () => void,
) {
  const lengths = simulateStreamingLengths(markdown.length, chunkSize, maxSteps);
  const samples: number[] = [];
  const history = buildHistoryMessages(historyCount);
  const streamingId = "streaming-assistant";

  for (const length of lengths) {
    const messages: ChatMessage[] = [
      ...history,
      {
        id: streamingId,
        role: "assistant",
        content: markdown.slice(0, length),
        createdAt: new Date(),
      },
    ];

    const start = performance.now();
    const cleanup = renderIntoMount(
      mount,
      createElement(MessageList, { messages, isStreaming: true }),
    );
    cleanup();
    samples.push(performance.now() - start);
    onStep();
    await yieldToMain();
  }

  return { chunkSize, steps: lengths.length, ...summarizeMs(samples) };
}

function buildStreamingMessages(
  history: ChatMessage[],
  streamingMessage: ChatMessage,
  markdown: string,
  length: number,
): ChatMessage[] {
  streamingMessage.content = markdown.slice(0, length);
  return [...history, streamingMessage];
}

async function measureIncrementalUpdate(
  mount: HTMLElement,
  markdown: string,
  chunkSize: number,
  historyCount: number,
  maxSteps: number,
  onStep: () => void,
  ListComponent: typeof MessageList | typeof LegacyMessageList,
) {
  const lengths = simulateStreamingLengths(markdown.length, chunkSize, maxSteps);
  const samples: number[] = [];
  const history = buildHistoryMessages(historyCount);
  const streamingMessage: ChatMessage = {
    id: "streaming-assistant",
    role: "assistant",
    content: "",
    createdAt: new Date(),
  };

  const container = document.createElement("div");
  mount.appendChild(container);
  const root = createRoot(container);

  flushSync(() => {
    root.render(
      createElement(ListComponent, {
        messages: buildStreamingMessages(
          history,
          streamingMessage,
          markdown,
          lengths[0]!,
        ),
        isStreaming: true,
      }),
    );
  });
  onStep();
  await yieldToMain();

  for (let index = 1; index < lengths.length; index += 1) {
    const length = lengths[index]!;
    const start = performance.now();
    flushSync(() => {
      root.render(
        createElement(ListComponent, {
          messages: buildStreamingMessages(
            history,
            streamingMessage,
            markdown,
            length,
          ),
          isStreaming: true,
        }),
      );
    });
    samples.push(performance.now() - start);
    onStep();
    await yieldToMain();
  }

  root.unmount();
  mount.removeChild(container);

  return { chunkSize, steps: samples.length, ...summarizeMs(samples) };
}

export function MarkdownBenchClient() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [caseScope, setCaseScope] = useState<CaseScope>("single");
  const [presetIndex, setPresetIndex] = useState(1);
  const [singleChars, setSingleChars] = useState(5000);
  const [singleBlocks, setSingleBlocks] = useState(5);
  const [chunkSize, setChunkSize] = useState(4);
  const [maxSteps, setMaxSteps] = useState(120);
  const [historyCount, setHistoryCount] = useState(20);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<BenchRow[]>([]);
  const [preview, setPreview] = useState("");
  const [progress, setProgress] = useState<BenchProgress | null>(null);

  const historyCounts = useMemo(
    () => Array.from(new Set([0, historyCount])).sort((a, b) => a - b),
    [historyCount],
  );

  const selectedCases = useMemo((): MarkdownBenchCase[] => {
    if (caseScope === "all-legal") {
      return LEGAL_BENCH_PRESETS;
    }

    if (caseScope === "all-default") {
      return DEFAULT_PARSE_MATRIX;
    }

    if (presetIndex >= 0) {
      const preset = SINGLE_BENCH_PRESETS[presetIndex];
      if (preset) {
        return [preset];
      }
    }

    return [
      {
        totalChars: singleChars,
        profile: "default",
        codeBlockCount: singleBlocks,
        label: `${singleChars} chars / ${singleBlocks} blocks（自定义）`,
      },
    ];
  }, [caseScope, presetIndex, singleChars, singleBlocks]);

  async function runBenchmark() {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const cases = selectedCases;
    const totalSteps = countPlannedSteps(
      cases,
      chunkSize,
      maxSteps,
      historyCounts,
    );
    let completedSteps = 0;

    setRunning(true);
    setRows([]);
    setProgress({
      percent: 0,
      label: "准备中…",
      completedSteps: 0,
      totalSteps,
    });

    const nextRows: BenchRow[] = [];

    for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
      const testCase = cases[caseIndex]!;
      const markdown = generateMarkdownFromCase(testCase);
      const label = caseLabel(testCase);
      setPreview(markdown.slice(0, 400));

      const bumpProgress = (phaseLabel: string) => {
        completedSteps += 1;
        setProgress({
          percent: Math.round((completedSteps / totalSteps) * 100),
          label: `用例 ${caseIndex + 1}/${cases.length} · ${label} · ${phaseLabel} · ${completedSteps}/${totalSteps}`,
          completedSteps,
          totalSteps,
        });
      };

      setProgress({
        percent: Math.round((completedSteps / totalSteps) * 100),
        label: `用例 ${caseIndex + 1}/${cases.length} · ${label} · content-only`,
        completedSteps,
        totalSteps,
      });

      const contentSummary = await measureContentOnly(
        mount,
        markdown,
        chunkSize,
        maxSteps,
        () => bumpProgress("content-only"),
      );

      nextRows.push({
        mode: "content-only",
        label,
        totalChars: markdown.length,
        codeBlockCount: testCase.codeBlockCount ?? 0,
        historyCount: 0,
        ...contentSummary,
      });
      setRows([...nextRows]);

      for (const count of historyCounts) {
        setProgress({
          percent: Math.round((completedSteps / totalSteps) * 100),
          label: `用例 ${caseIndex + 1}/${cases.length} · ${label} · full-list (${count})`,
          completedSteps,
          totalSteps,
        });

        const listSummary = await measureFullList(
          mount,
          markdown,
          chunkSize,
          count,
          maxSteps,
          () => bumpProgress(`full-list (${count})`),
        );

        nextRows.push({
          mode: "full-list",
          label,
          totalChars: markdown.length,
          codeBlockCount: testCase.codeBlockCount ?? 0,
          historyCount: count,
          ...listSummary,
        });
        setRows([...nextRows]);

        setProgress({
          percent: Math.round((completedSteps / totalSteps) * 100),
          label: `用例 ${caseIndex + 1}/${cases.length} · ${label} · incremental (${count})`,
          completedSteps,
          totalSteps,
        });

        const incrementalSummary = await measureIncrementalUpdate(
          mount,
          markdown,
          chunkSize,
          count,
          maxSteps,
          () => bumpProgress(`incremental (${count})`),
          MessageList,
        );

        nextRows.push({
          mode: "incremental-update",
          label,
          totalChars: markdown.length,
          codeBlockCount: testCase.codeBlockCount ?? 0,
          historyCount: count,
          ...incrementalSummary,
        });
        setRows([...nextRows]);

        setProgress({
          percent: Math.round((completedSteps / totalSteps) * 100),
          label: `用例 ${caseIndex + 1}/${cases.length} · ${label} · incremental-legacy (${count})`,
          completedSteps,
          totalSteps,
        });

        const incrementalLegacySummary = await measureIncrementalUpdate(
          mount,
          markdown,
          chunkSize,
          count,
          maxSteps,
          () => bumpProgress(`incremental-legacy (${count})`),
          LegacyMessageList,
        );

        nextRows.push({
          mode: "incremental-update-legacy",
          label,
          totalChars: markdown.length,
          codeBlockCount: testCase.codeBlockCount ?? 0,
          historyCount: count,
          ...incrementalLegacySummary,
        });
        setRows([...nextRows]);
      }
    }

    setRows(nextRows);
    setProgress({
      percent: 100,
      label: "完成",
      completedSteps: totalSteps,
      totalSteps,
    });
    setRunning(false);
  }

  const previewMarkdown =
    preview || generateMarkdown(800, { profile: "legal-typical" });
  const plannedSteps = countPlannedSteps(
    selectedCases,
    chunkSize,
    maxSteps,
    historyCounts,
  );

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Markdown 渲染性能基准</h1>
        <p className="text-sm text-muted">
          模拟 displayQueue 的 chunk 追加，测量 MessageContent、MessageList remount
          与同树 incremental-update（真实聊天路径）的 p50/p95。阈值参考：p95 &lt; 16ms ≈
          60fps；p95 &gt; 50ms 流式时可能感到卡。
        </p>
      </header>

      <section className="space-y-4 rounded-xl border border-border bg-surface p-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">运行范围</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="caseScope"
                checked={caseScope === "single"}
                onChange={() => setCaseScope("single")}
              />
              单个用例
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="caseScope"
                checked={caseScope === "all-legal"}
                onChange={() => setCaseScope("all-legal")}
              />
              全部法律向预设（6 个）
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="caseScope"
                checked={caseScope === "all-default"}
                onChange={() => setCaseScope("all-default")}
              />
              全部通用矩阵（5 个，偏代码块）
            </label>
          </div>
        </fieldset>

        {caseScope === "single" ? (
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span>预设用例</span>
              <select
                value={presetIndex}
                onChange={(event) =>
                  setPresetIndex(Number(event.target.value))
                }
                className="min-w-[240px] rounded-md border border-border px-3 py-2"
                disabled={running}
              >
                <optgroup label="法律向（推荐）">
                  {LEGAL_BENCH_PRESETS.map((item, index) => (
                    <option key={item.label ?? caseLabel(item)} value={index}>
                      {caseLabel(item)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="通用（字数 / 代码块）">
                  {DEFAULT_PARSE_MATRIX.map((item, index) => (
                    <option
                      key={`default-${caseLabel(item)}`}
                      value={LEGAL_BENCH_PRESETS.length + index}
                    >
                      {caseLabel(item)}
                    </option>
                  ))}
                </optgroup>
                <option value={CUSTOM_PRESET_INDEX}>自定义（字数 + 代码块）</option>
              </select>
            </label>
            {presetIndex === CUSTOM_PRESET_INDEX ? (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  <span>字数</span>
                  <input
                    type="number"
                    min={200}
                    max={50000}
                    value={singleChars}
                    onChange={(event) =>
                      setSingleChars(Number(event.target.value) || 5000)
                    }
                    className="rounded-md border border-border px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>代码块数</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={singleBlocks}
                    onChange={(event) =>
                      setSingleBlocks(Number(event.target.value) || 0)
                    }
                    className="rounded-md border border-border px-3 py-2"
                  />
                </label>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span>Chunk 大小（字符）</span>
            <input
              type="number"
              min={1}
              max={64}
              value={chunkSize}
              onChange={(event) => setChunkSize(Number(event.target.value) || 4)}
              className="rounded-md border border-border px-3 py-2"
              disabled={running}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>每模式最多步数</span>
            <input
              type="number"
              min={10}
              max={500}
              value={maxSteps}
              onChange={(event) => setMaxSteps(Number(event.target.value) || 120)}
              className="rounded-md border border-border px-3 py-2"
              disabled={running}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>历史消息数（full-list / incremental，含 0 对照）</span>
            <input
              type="number"
              min={0}
              max={200}
              value={historyCount}
              onChange={(event) =>
                setHistoryCount(Number(event.target.value) || 0)
              }
              className="rounded-md border border-border px-3 py-2"
              disabled={running}
            />
          </label>
          <button
            type="button"
            disabled={running}
            onClick={() => void runBenchmark()}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
          >
            {running ? "运行中…" : "运行浏览器基准"}
          </button>
        </div>

        <p className="text-xs text-muted">
          预计渲染次数：{plannedSteps}（{selectedCases.length} 用例 × 每模式最多{" "}
          {maxSteps} 步 × {1 + historyCounts.length * 3} 种模式：content-only + full-list
          + incremental + incremental-legacy）
        </p>

        {progress ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>{progress.label}</span>
              <span>{progress.percent}%</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-border/60"
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-150"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        ) : null}
      </section>

      <div ref={mountRef} className="hidden" aria-hidden />

      {rows.length > 0 ? (
        <section className="flex min-h-[min(520px,70vh)] flex-col rounded-xl border border-border bg-surface p-5 lg:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">结果</h2>
            <p className="text-sm text-muted">共 {rows.length} 行 · 可纵向滚动查看</p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border/70">
            <table className="w-full min-w-[1100px] text-left text-base">
              <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_var(--border)]">
                <tr className="border-b border-border text-muted">
                  <th className="px-4 py-3 pr-4 font-medium">模式</th>
                  <th className="px-4 py-3 pr-4 font-medium">用例</th>
                  <th className="px-4 py-3 pr-4 font-medium">chars</th>
                  <th className="px-4 py-3 pr-4 font-medium">blocks</th>
                  <th className="px-4 py-3 pr-4 font-medium">history</th>
                  <th className="px-4 py-3 pr-4 font-medium">steps</th>
                  <th className="px-4 py-3 pr-4 font-medium">p50 ms</th>
                  <th className="px-4 py-3 pr-4 font-medium">p95 ms</th>
                  <th className="px-4 py-3 pr-4 font-medium">max ms</th>
                  <th className="px-4 py-3 pr-4 font-medium">mean ms</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={`${row.mode}-${row.label}-${row.historyCount}-${index}`}
                    className={`border-b border-border/60 ${
                      row.p95Ms > 50
                        ? "bg-red-500/5"
                        : row.p95Ms > 16
                          ? "bg-amber-500/5"
                          : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 pr-4">{row.mode}</td>
                    <td className="whitespace-nowrap px-4 py-3 pr-4">{row.label}</td>
                    <td className="px-4 py-3 pr-4 tabular-nums">{row.totalChars}</td>
                    <td className="px-4 py-3 pr-4 tabular-nums">{row.codeBlockCount}</td>
                    <td className="px-4 py-3 pr-4 tabular-nums">{row.historyCount}</td>
                    <td className="px-4 py-3 pr-4 tabular-nums">{row.steps}</td>
                    <td className="px-4 py-3 pr-4 tabular-nums">{formatMs(row.p50Ms)}</td>
                    <td className="px-4 py-3 pr-4 tabular-nums font-medium">
                      {formatMs(row.p95Ms)}
                    </td>
                    <td className="px-4 py-3 pr-4 tabular-nums">{formatMs(row.maxMs)}</td>
                    <td className="px-4 py-3 pr-4 tabular-nums">{formatMs(row.meanMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        <p className="font-medium text-foreground">如何解读</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>content-only</strong>：仅 MessageContent（Markdown 解析 + 高亮）
          </li>
          <li>
            <strong>full-list</strong>：MessageList 每 step 整树 remount（冷挂载，偏保守）
          </li>
          <li>
            <strong>incremental-update</strong>：同树复用 root，仅更新流式 content（优化后：
            memo + 流式纯文本；首 step warmup 不计入）
          </li>
          <li>
            <strong>incremental-update-legacy</strong>：同上测法，组件为优化前行为（无 memo、流式也
            Markdown parse）——用于与 incremental-update 同路径 A/B 对比
          </li>
          <li>
            <strong>legal-typical</strong>：标题 + 列表 + 引用（常见法律回答）
          </li>
          <li>
            <strong>legal-heavy</strong>：多层标题 + 嵌套列表
          </li>
          <li>
            <strong>legal-table</strong>：典型结构 + GFM 表格
          </li>
          <li>
            通用矩阵里的 <code>const item_0_0</code> 仅用于代码块压测，法律场景请优先法律向预设
          </li>
          <li>Node 端：<code>npm run measure:markdown</code></li>
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-medium">预览</h2>
        <MessageBubble
          message={{
            id: "preview-bench",
            role: "assistant",
            content: previewMarkdown,
            createdAt: new Date(),
          }}
        />
      </section>
    </div>
  );
}
