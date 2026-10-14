import type { ChatMessage, MessageRole } from "@/types/chat";

export const MESSAGE_BENCHMARK_SCENARIOS = [
  "short-text",
  "mixed",
  "stress",
  "dynamic-height",
] as const;

export type MessageBenchmarkScenario =
  (typeof MESSAGE_BENCHMARK_SCENARIOS)[number];

export const MESSAGE_BENCHMARK_KINDS = [
  "short-text",
  "medium-text",
  "long-text",
  "markdown",
  "code",
  "table",
  "tall",
] as const;

export type MessageBenchmarkKind = (typeof MESSAGE_BENCHMARK_KINDS)[number];

export type BenchmarkChatMessage = ChatMessage & {
  /** 仅供基准测试结果统计使用；MessageList 可直接消费该类型。 */
  benchmarkKind: MessageBenchmarkKind;
};

export type CreateMessageFixtureOptions = {
  count: number;
  scenario?: MessageBenchmarkScenario;
  seed?: number;
  /** 默认为 2026-01-01 08:00:00 UTC；消息每 45 秒递增。 */
  startAt?: Date;
};

export type MessageFixtureSummary = {
  count: number;
  scenario: MessageBenchmarkScenario;
  seed: number;
  fingerprint: string;
  kindCounts: Record<MessageBenchmarkKind, number>;
};

export type MessageFixture = {
  messages: BenchmarkChatMessage[];
  summary: MessageFixtureSummary;
};

type ScenarioDefinition = {
  kinds: Record<MessageBenchmarkKind, number>;
};

const DEFAULT_SEED = 20_260_909;
const DEFAULT_START_AT_MS = Date.UTC(2026, 0, 1, 8, 0, 0);
const MESSAGE_INTERVAL_MS = 45_000;

const SCENARIOS: Record<MessageBenchmarkScenario, ScenarioDefinition> = {
  "short-text": {
    kinds: {
      "short-text": 80,
      "medium-text": 20,
      "long-text": 0,
      markdown: 0,
      code: 0,
      table: 0,
      tall: 0,
    },
  },
  mixed: {
    kinds: {
      "short-text": 50,
      "medium-text": 0,
      "long-text": 20,
      markdown: 15,
      code: 10,
      table: 5,
      tall: 0,
    },
  },
  stress: {
    kinds: {
      "short-text": 0,
      "medium-text": 0,
      "long-text": 35,
      markdown: 20,
      code: 20,
      table: 15,
      tall: 10,
    },
  },
  "dynamic-height": {
    kinds: {
      "short-text": 30,
      "medium-text": 20,
      "long-text": 20,
      markdown: 0,
      code: 15,
      table: 0,
      tall: 15,
    },
  },
};

const SHORT_TEXTS = [
  "请说明本案中合同解除通知的送达时间。",
  "我需要先核对证据材料与时间线。",
  "该项请求需要结合合同约定进一步判断。",
  "请补充双方是否存在书面补充协议。",
];

const MEDIUM_TEXTS = [
  "初步判断需要从合同效力、履行情况和违约责任三个层面分析。\n\n请优先整理合同正文、付款凭证与双方沟通记录。",
  "建议先固定电子证据，并按时间顺序梳理关键事实。\n\n后续可再比对约定条款与实际履行情况。",
];

const LONG_PARAGRAPH =
  "在现有材料范围内，需先区分事实争议与法律适用争议，并逐项核对合同约定、履行记录及相关证据的证明力。若关键事实尚未固定，应优先保存原始载体、沟通记录和能够反映时间节点的材料。";

function createEmptyKindCounts(): Record<MessageBenchmarkKind, number> {
  return {
    "short-text": 0,
    "medium-text": 0,
    "long-text": 0,
    markdown: 0,
    code: 0,
    table: 0,
    tall: 0,
  };
}

function normalizeSeed(seed: number | undefined): number {
  if (seed === undefined) {
    return DEFAULT_SEED;
  }

  if (!Number.isSafeInteger(seed)) {
    throw new RangeError("seed 必须是安全整数。");
  }

  return seed >>> 0;
}

/** 固定种子的伪随机数，避免使用 Math.random()。 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffledKindCycle(
  definition: ScenarioDefinition,
  seed: number,
): MessageBenchmarkKind[] {
  const cycle = MESSAGE_BENCHMARK_KINDS.flatMap((kind) =>
    Array.from({ length: definition.kinds[kind] }, () => kind),
  );
  const random = seededRandom(seed);

  for (let index = cycle.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [cycle[index], cycle[target]] = [cycle[target]!, cycle[index]!];
  }

  return cycle;
}

function mixSeed(seed: number, index: number, salt: number): number {
  let value = seed ^ Math.imul(index + 1, 0x9e3779b1) ^ salt;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

function pick<T>(values: readonly T[], seed: number, index: number, salt: number): T {
  return values[mixSeed(seed, index, salt) % values.length]!;
}

function createContent(
  kind: MessageBenchmarkKind,
  index: number,
  seed: number,
): string {
  switch (kind) {
    case "short-text":
      return `第 ${index + 1} 条基准消息：${pick(SHORT_TEXTS, seed, index, 1)}`;
    case "medium-text":
      return `第 ${index + 1} 条基准消息\n\n${pick(MEDIUM_TEXTS, seed, index, 2)}`;
    case "long-text": {
      const paragraphs = 3 + (mixSeed(seed, index, 3) % 3);
      return Array.from(
        { length: paragraphs },
        (_, paragraphIndex) =>
          `第 ${paragraphIndex + 1} 段：${LONG_PARAGRAPH}`,
      ).join("\n\n");
    }
    case "markdown":
      return [
        `## 第 ${index + 1} 项法律分析`,
        "",
        "### 核心要点",
        "",
        "- 主体是否适格",
        "- 合同约定是否明确",
        "- 是否存在违约或抗辩事由",
        "",
        "> 提示：以下内容仅用于性能基准，不构成法律意见。",
      ].join("\n");
    case "code": {
      const lineCount = 8 + (mixSeed(seed, index, 4) % 16);
      const lines = Array.from(
        { length: lineCount },
        (_, lineIndex) =>
          `const evidence_${index}_${lineIndex} = { verified: ${lineIndex % 2 === 0} };`,
      );
      return `第 ${index + 1} 条基准代码消息\n\n\`\`\`typescript\n${lines.join("\n")}\n\`\`\``;
    }
    case "table":
      return [
        `### 第 ${index + 1} 项要件对照`,
        "",
        "| 要件 | 说明 | 风险等级 |",
        "| --- | --- | --- |",
        "| 主体资格 | 核对签约主体与授权文件 | 中 |",
        "| 履行记录 | 核对付款及交付凭证 | 高 |",
        "| 证据完整性 | 核对原始文件与时间戳 | 中 |",
      ].join("\n");
    case "tall": {
      const paragraphs = 10 + (mixSeed(seed, index, 5) % 8);
      return Array.from(
        { length: paragraphs },
        (_, paragraphIndex) =>
          `第 ${paragraphIndex + 1} 段高度测试内容：${LONG_PARAGRAPH}`,
      ).join("\n\n");
    }
  }
}

function createFingerprint(
  messages: readonly BenchmarkChatMessage[],
  scenario: MessageBenchmarkScenario,
  seed: number,
): string {
  let hash = 0x811c9dc5;
  const input = `${scenario}:${seed}:${messages
    .map((message) =>
      [
        message.id,
        message.role,
        message.benchmarkKind,
        message.createdAt.toISOString(),
        message.content,
      ].join("\u001f"),
    )
    .join("\u001e")}`;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * 创建可复现的消息列表基准数据。
 *
 * 同一 scenario 与 seed 下，较小 count 的结果始终是较大 count 的前缀，
 * 因而可直接比较 100、1,000 和 10,000 条消息的性能。
 */
export function createMessageFixture({
  count,
  scenario = "mixed",
  seed: providedSeed,
  startAt,
}: CreateMessageFixtureOptions): MessageFixture {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError("count 必须是非负安全整数。");
  }

  const seed = normalizeSeed(providedSeed);
  const startAtMs = startAt?.getTime() ?? DEFAULT_START_AT_MS;
  if (!Number.isFinite(startAtMs)) {
    throw new RangeError("startAt 必须是有效日期。");
  }

  const cycle = shuffledKindCycle(SCENARIOS[scenario], seed);
  const kindCounts = createEmptyKindCounts();
  const messages = Array.from({ length: count }, (_, index) => {
    const benchmarkKind = cycle[index % cycle.length]!;
    kindCounts[benchmarkKind] += 1;
    const role: MessageRole = index % 20 < 9 ? "user" : "assistant";

    return {
      id: `benchmark-${scenario}-${seed}-${String(index).padStart(6, "0")}`,
      role,
      benchmarkKind,
      content: createContent(benchmarkKind, index, seed),
      createdAt: new Date(startAtMs + index * MESSAGE_INTERVAL_MS),
    };
  });

  return {
    messages,
    summary: {
      count,
      scenario,
      seed,
      kindCounts,
      fingerprint: createFingerprint(messages, scenario, seed),
    },
  };
}

/** 仅需要列表数据时使用；返回值可直接传入 MessageList 的 messages 属性。 */
export function createBenchmarkMessages(
  options: CreateMessageFixtureOptions,
): BenchmarkChatMessage[] {
  return createMessageFixture(options).messages;
}
