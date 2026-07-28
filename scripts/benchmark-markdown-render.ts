/**
 * Markdown 解析性能基准（Node，与 MessageContent 相同插件链）。
 *
 * Usage:
 *   npm run measure:markdown
 *   npm run measure:markdown -- --chunk-size 4 --warmup 3
 *   npm run measure:markdown -- --legal
 *   npm run measure:markdown -- --chars 5000 --blocks 10
 */
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import {
  DEFAULT_PARSE_MATRIX,
  LEGAL_BENCH_PRESETS,
  caseLabel,
  generateMarkdownFromCase,
  simulateStreamingLengths,
  type MarkdownBenchCase,
} from "../lib/benchmark/markdownFixtures";
import { formatMs, summarizeMs } from "../lib/benchmark/stats";

type CliOptions = {
  chunkSize: number;
  warmup: number;
  maxSteps: number;
  cases: MarkdownBenchCase[];
};

function parseArgs(argv: string[]): CliOptions {
  let chunkSize = 4;
  let warmup = 2;
  let maxSteps = 120;
  let cases = DEFAULT_PARSE_MATRIX;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--chunk-size") {
      chunkSize = Number(argv[i + 1] ?? chunkSize);
      i += 1;
      continue;
    }

    if (arg === "--warmup") {
      warmup = Number(argv[i + 1] ?? warmup);
      i += 1;
      continue;
    }

    if (arg === "--max-steps") {
      maxSteps = Number(argv[i + 1] ?? maxSteps);
      i += 1;
      continue;
    }

    if (arg === "--legal") {
      cases = LEGAL_BENCH_PRESETS;
      continue;
    }

    if (arg === "--chars") {
      const totalChars = Number(argv[i + 1] ?? 5000);
      const codeBlockCount = Number(argv[i + 3] ?? 5);
      cases = [
        {
          totalChars,
          profile: "default",
          codeBlockCount,
        },
      ];
      i += arg.includes("--blocks") ? 0 : 1;
      continue;
    }

    if (arg === "--blocks") {
      continue;
    }
  }

  return {
    chunkSize: Math.max(1, chunkSize),
    warmup: Math.max(0, warmup),
    maxSteps: Math.max(10, maxSteps),
    cases,
  };
}

function renderMarkdown(content: string): string {
  return renderToString(
    createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [rehypeHighlight],
      },
      content,
    ),
  );
}

function benchCase(
  testCase: MarkdownBenchCase,
  chunkSize: number,
  warmup: number,
  maxSteps: number,
) {
  const markdown = generateMarkdownFromCase(testCase);
  const lengths = simulateStreamingLengths(markdown.length, chunkSize, maxSteps);
  const samples: number[] = [];

  for (let round = 0; round < warmup; round += 1) {
    renderMarkdown(markdown);
  }

  for (const length of lengths) {
    const partial = markdown.slice(0, length);
    const start = performance.now();
    renderMarkdown(partial);
    const end = performance.now();
    samples.push(end - start);
  }

  const summary = summarizeMs(samples);

  return {
    label: caseLabel(testCase),
    totalChars: markdown.length,
    codeBlockCount: testCase.codeBlockCount ?? 0,
    chunkSize,
    steps: lengths.length,
    ...summary,
  };
}

function printTable(
  rows: Array<{
    label: string;
    totalChars: number;
    codeBlockCount: number;
    chunkSize: number;
    steps: number;
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
    meanMs: number;
  }>,
) {
  console.log("");
  console.log("Markdown parse benchmark (react-markdown + remark-gfm + rehype-highlight)");
  console.log(
    "label".padEnd(24) +
      "chars".padStart(8) +
      "blocks".padStart(8) +
      "chunk".padStart(8) +
      "steps".padStart(8) +
      "p50ms".padStart(10) +
      "p95ms".padStart(10) +
      "maxms".padStart(10) +
      "meanms".padStart(10),
  );
  console.log("-".repeat(94));

  for (const row of rows) {
    console.log(
      row.label.padEnd(24) +
        String(row.totalChars).padStart(8) +
        String(row.codeBlockCount).padStart(8) +
        String(row.chunkSize).padStart(8) +
        String(row.steps).padStart(8) +
        formatMs(row.p50Ms).padStart(10) +
        formatMs(row.p95Ms).padStart(10) +
        formatMs(row.maxMs).padStart(10) +
        formatMs(row.meanMs).padStart(10),
    );
  }

  console.log("");
  console.log("Threshold hints: p95 < 16ms ≈ 60fps; p95 > 50ms likely feels janky during streaming.");
  console.log("Long docs sample up to 120 chunk steps (override with --max-steps).");
  console.log("Browser UI path (MessageList + memo + streaming plain-text): open http://localhost:3000/dev/markdown-bench");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const rows = options.cases.map((testCase) =>
    benchCase(testCase, options.chunkSize, options.warmup, options.maxSteps),
  );

  printTable(rows);
}

main();
