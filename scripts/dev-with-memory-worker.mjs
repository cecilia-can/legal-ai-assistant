import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const next = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "dev", ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});
const worker = spawn(process.execPath, [
  resolve(root, "node_modules/tsx/dist/cli.mjs"),
  resolve(root, "scripts/run-memory-compaction.ts"),
  "--watch",
], { cwd: root, stdio: "inherit" });

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  next.kill();
  worker.kill();
  process.exitCode = code;
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
next.on("error", (error) => { console.error("Next.js 启动失败：", error); stop(1); });
worker.on("error", (error) => { console.error("压缩 worker 启动失败：", error); stop(1); });
next.on("exit", (code) => stop(code ?? 1));
worker.on("exit", (code) => stop(code ?? 1));
