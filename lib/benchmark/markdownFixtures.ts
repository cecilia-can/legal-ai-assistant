export type MarkdownProfile =
  | "default"
  | "legal-typical"
  | "legal-heavy"
  | "legal-table";

export type MarkdownBenchCase = {
  totalChars: number;
  profile?: MarkdownProfile;
  codeBlockCount?: number;
  tableCount?: number;
  label?: string;
};

export type GenerateMarkdownOptions = {
  profile?: MarkdownProfile;
  codeBlockCount?: number;
  tableCount?: number;
};

/** 通用压测：字数 × 代码块 */
export const DEFAULT_PARSE_MATRIX: MarkdownBenchCase[] = [
  { totalChars: 2_000, profile: "default", codeBlockCount: 0 },
  { totalChars: 5_000, profile: "default", codeBlockCount: 0 },
  { totalChars: 5_000, profile: "default", codeBlockCount: 5 },
  { totalChars: 10_000, profile: "default", codeBlockCount: 10 },
  { totalChars: 20_000, profile: "default", codeBlockCount: 20 },
];

/** 法律 AI 常见输出结构 */
export const LEGAL_BENCH_PRESETS: MarkdownBenchCase[] = [
  {
    totalChars: 1_500,
    profile: "legal-typical",
    label: "1500 · legal-typical",
  },
  {
    totalChars: 5_000,
    profile: "legal-typical",
    label: "5000 · legal-typical",
  },
  {
    totalChars: 5_000,
    profile: "legal-heavy",
    label: "5000 · legal-heavy",
  },
  {
    totalChars: 5_000,
    profile: "legal-table",
    tableCount: 2,
    label: "5000 · legal-table×2",
  },
  {
    totalChars: 5_000,
    profile: "legal-table",
    tableCount: 4,
    label: "5000 · legal-table×4",
  },
  {
    totalChars: 3_000,
    profile: "legal-typical",
    label: "3000 · legal-typical（长会话对照）",
  },
];

export const SINGLE_BENCH_PRESETS: MarkdownBenchCase[] = [
  ...LEGAL_BENCH_PRESETS,
  ...DEFAULT_PARSE_MATRIX,
];

export const DEFAULT_HISTORY_COUNTS = [0, 20, 50] as const;

const LANGUAGES = ["javascript", "typescript", "python", "json", "sql"] as const;

function normalizeOptions(
  codeBlockCountOrOptions: number | GenerateMarkdownOptions = 0,
): Required<Pick<GenerateMarkdownOptions, "profile" | "codeBlockCount">> &
  Pick<GenerateMarkdownOptions, "tableCount"> {
  if (typeof codeBlockCountOrOptions === "number") {
    return {
      profile: "default",
      codeBlockCount: codeBlockCountOrOptions,
    };
  }

  return {
    profile: codeBlockCountOrOptions.profile ?? "default",
    codeBlockCount: codeBlockCountOrOptions.codeBlockCount ?? 0,
    tableCount: codeBlockCountOrOptions.tableCount,
  };
}

function trimOrPad(content: string, target: number): string {
  let result = content;

  if (result.length > target) {
    result = result.slice(0, target);
  }

  while (result.length < target) {
    result += "补";
  }

  return result;
}

function codeBlock(index: number): string {
  const lang = LANGUAGES[index % LANGUAGES.length];
  const lines = Array.from(
    { length: 12 },
    (_, line) =>
      `  const item_${index}_${line} = ${index * 100 + line}; // benchmark sample`,
  ).join("\n");

  return `\n\`\`\`${lang}\n${lines}\n\`\`\`\n`;
}

function defaultParagraph(index: number): string {
  return (
    `第 ${index + 1} 段：法律咨询场景下的说明文字，用于填充 Markdown 基准测试内容。` +
    `本段包含列表项与引用，模拟 assistant 常见输出结构。\n\n` +
    `- 要点 A：合同条款审查\n` +
    `- 要点 B：风险等级评估\n` +
    `- 要点 C：适用法规引用\n\n` +
    `> 引用块：请结合具体案情咨询执业律师。\n\n`
  );
}

function buildDefaultContent(target: number, codeBlockCount: number): string {
  const parts: string[] = ["## Markdown 性能基准\n\n"];
  let index = 0;

  while (parts.join("").length < target) {
    if (codeBlockCount > 0 && index % 3 === 2) {
      parts.push(codeBlock(index % codeBlockCount));
    } else {
      parts.push(defaultParagraph(index));
    }
    index += 1;

    if (index > 500) {
      break;
    }
  }

  let content = parts.join("");

  if (codeBlockCount > 0 && !content.includes("```")) {
    content += codeBlock(0);
  }

  return content;
}

function legalTypicalSection(index: number): string {
  return (
    `## 第 ${index + 1} 节 法律分析\n\n` +
    `本节围绕常见咨询场景展开说明，便于对照适用法律与事实要件。\n\n` +
    `### 核心要点\n\n` +
    `- 要件 A：主体是否适格\n` +
    `- 要件 B：法律行为是否有效\n` +
    `- 要件 C：是否存在免责或抗辩事由\n\n` +
    `### 处理步骤\n\n` +
    `1. 梳理基本事实与争议焦点\n` +
    `2. 检索并引用相关法律条文\n` +
    `3. 结合个案给出风险提示与建议\n\n` +
    `> 提示：以下分析仅供参考，不构成正式法律意见。\n\n`
  );
}

function legalHeavySection(index: number): string {
  return (
    `## 第 ${index + 1} 章 深度法律评述\n\n` +
    `### ${index + 1}.1 事实与争点\n\n` +
    `在综合现有材料的基础上，需要先锁定程序性问题与实体法适用顺序。\n\n` +
    `#### ${index + 1}.1.1 证据与举证\n\n` +
    `- 一级要点：证明责任分配\n` +
    `  - 二级细节：书证与电子数据\n` +
    `  - 二级细节：证人证言的可采性\n` +
    `- 一级要点：待证事实清单\n\n` +
    `### ${index + 1}.2 规范依据\n\n` +
    `1. 确认一般性适用规则\n` +
    `2. 检索特别法与司法解释\n` +
    `   1. 子步骤：比对请求权基础\n` +
    `   2. 子步骤：审查构成要件\n\n` +
    `> 引用：请结合具体证据材料进一步论证。\n\n`
  );
}

function legalTableBlock(tableIndex: number, rowCount = 6): string {
  const header =
    "| 要件 | 说明 | 本案倾向 | 风险等级 |\n" +
    "| --- | --- | --- | --- |\n";
  const rows = Array.from(
    { length: rowCount },
    (_, row) =>
      `| 要件 ${tableIndex + 1}-${row + 1} | 用于测试 GFM 表格渲染性能 | 待核实 | 中 |`,
  ).join("\n");

  return `\n### 对照表 ${tableIndex + 1}\n\n${header}${rows}\n\n`;
}

function buildProfileContent(
  target: number,
  sectionBuilder: (index: number) => string,
): string {
  const parts: string[] = [];
  let index = 0;

  while (parts.join("").length < target) {
    parts.push(sectionBuilder(index));
    index += 1;

    if (index > 200) {
      break;
    }
  }

  return parts.join("");
}

function buildLegalTableContent(target: number, tableCount: number): string {
  const tables = Math.max(1, tableCount);
  const parts: string[] = ["## 法律对照分析\n\n"];
  let index = 0;
  let tablesAdded = 0;

  while (parts.join("").length < target) {
    if (index % 2 === 1 && tablesAdded < tables) {
      parts.push(legalTableBlock(tablesAdded));
      tablesAdded += 1;
    } else {
      parts.push(legalTypicalSection(index));
    }
    index += 1;

    if (index > 200) {
      break;
    }
  }

  while (tablesAdded < tables) {
    parts.push(legalTableBlock(tablesAdded));
    tablesAdded += 1;
  }

  return parts.join("");
}

/** 生成可控字数与结构的 Markdown 文本。 */
export function generateMarkdown(
  totalChars: number,
  codeBlockCountOrOptions: number | GenerateMarkdownOptions = 0,
): string {
  const options = normalizeOptions(codeBlockCountOrOptions);
  const target = Math.max(200, totalChars);

  let content: string;

  switch (options.profile) {
    case "legal-typical":
      content = buildProfileContent(target, legalTypicalSection);
      break;
    case "legal-heavy":
      content = buildProfileContent(target, legalHeavySection);
      break;
    case "legal-table":
      content = buildLegalTableContent(target, options.tableCount ?? 2);
      break;
    default:
      content = buildDefaultContent(target, options.codeBlockCount);
      break;
  }

  return trimOrPad(content, target);
}

export function generateMarkdownFromCase(testCase: MarkdownBenchCase): string {
  return generateMarkdown(testCase.totalChars, {
    profile: testCase.profile ?? "default",
    codeBlockCount: testCase.codeBlockCount ?? 0,
    tableCount: testCase.tableCount,
  });
}

export function simulateStreamingLengths(
  fullLength: number,
  chunkSize: number,
  maxSteps = 120,
): number[] {
  const size = Math.max(1, chunkSize);
  const all: number[] = [];

  for (let length = size; length < fullLength; length += size) {
    all.push(length);
  }

  all.push(fullLength);

  if (all.length <= maxSteps) {
    return all;
  }

  const sampled: number[] = [];
  for (let index = 0; index < maxSteps; index += 1) {
    const pick = Math.round((index / (maxSteps - 1)) * (all.length - 1));
    sampled.push(all[pick] ?? fullLength);
  }

  return [...new Set(sampled)].sort((a, b) => a - b);
}

export function caseLabel(testCase: MarkdownBenchCase): string {
  if (testCase.label) {
    return testCase.label;
  }

  const profile = testCase.profile ?? "default";

  if (profile === "legal-table") {
    return `${testCase.totalChars} · legal-table×${testCase.tableCount ?? 2}`;
  }

  if (profile !== "default") {
    return `${testCase.totalChars} · ${profile}`;
  }

  return `${testCase.totalChars} chars / ${testCase.codeBlockCount ?? 0} blocks`;
}
