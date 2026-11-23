import { randomUUID, createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { mkdir, realpath, readFile, stat, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { KnowledgeError } from "./contracts";

// Runtime user-data directories are mounted separately, never bundled by NFT.
export const uploadRoot = () => path.resolve(/* turbopackIgnore: true */ process.env.DOCUMENT_UPLOAD_ROOT || "data/document-originals");
export function uploadLimit() {
  const n = Number(process.env.DOCUMENT_UPLOAD_MAX_BYTES);
  return Number.isSafeInteger(n) && n > 0 && n <= 100 * 1024 * 1024 ? n : 20 * 1024 * 1024;
}
function inside(root: string, target: string) {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}
export async function controlledFile(root: string, uri: string) {
  if (!uri || path.isAbsolute(uri) || /^[a-z]:|\\/i.test(uri)) throw new KnowledgeError("文件路径无效。", 422);
  const base = path.resolve(/* turbopackIgnore: true */ root);
  const target = path.resolve(/* turbopackIgnore: true */ base, uri);
  if (!inside(base, target)) throw new KnowledgeError("文件路径超出存储目录。", 422);
  try {
    const [actualRoot, actualFile] = await Promise.all([realpath(base), realpath(target)]);
    if (!inside(actualRoot, actualFile)) throw new KnowledgeError("文件链接超出存储目录。", 422);
    if (!(await stat(actualFile)).isFile()) throw new KnowledgeError("文件不可读取。", 422);
    return actualFile;
  } catch (error) {
    if (error instanceof KnowledgeError) throw error;
    throw new KnowledgeError("文件缺失或不可读，请重新上传。", 422);
  }
}
export function displayFilename(name: string) {
  const clean = name.normalize("NFKC").trim();
  if (!clean || clean.length > 200 || /[\\/\x00-\x1f]/.test(clean) || clean === "." || clean === "..") throw new KnowledgeError("文件名无效。");
  return clean;
}

// Inspect ZIP directory sizes before a DOCX parser can inflate any entries.
function checkDocxDirectory(buffer: Buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new KnowledgeError("DOCX ZIP 目录无效。");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16), total = 0, hasDocument = false;
  if (count > 5000 || count === 65535) throw new KnowledgeError("DOCX 条目过多或使用不支持的 ZIP64。");
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw new KnowledgeError("DOCX ZIP 目录损坏。");
    const size = buffer.readUInt32LE(offset + 24), compressed = buffer.readUInt32LE(offset + 20);
    const method = buffer.readUInt16LE(offset + 10);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const length = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 46, offset + 46 + length).toString("utf8");
    if (size > 30 * 1024 * 1024 || size / Math.max(compressed, 1) > 200 || name.includes("..") || name.startsWith("/")) throw new KnowledgeError("DOCX 解压内容超出安全限制。");
    if (total + size > 80 * 1024 * 1024) throw new KnowledgeError("DOCX 解压总量超过限制。");
    if (buffer.readUInt16LE(offset + 8) & 1 || ![0, 8].includes(method) || localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new KnowledgeError("不支持该 DOCX ZIP 编码。");
    const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    if (start + compressed > buffer.length) throw new KnowledgeError("DOCX ZIP 数据损坏。");
    try {
      const entry = buffer.subarray(start, start + compressed);
      const inflated = method === 8 ? inflateRawSync(entry, { maxOutputLength: 30 * 1024 * 1024 }) : entry;
      if (inflated.byteLength !== size) throw new Error("size mismatch");
    } catch { throw new KnowledgeError("DOCX 解压失败或内容超过限制。"); }
    total += size;
    hasDocument ||= name === "word/document.xml";
    offset += 46 + length + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
  if (!hasDocument || total > 80 * 1024 * 1024) throw new KnowledgeError("DOCX 内容无效或解压体积过大。");
}
export function validateUpload(name: string, buffer: Buffer) {
  const filename = displayFilename(name);
  if (buffer.length === 0) throw new KnowledgeError("文件不能为空。");
  if (buffer.length > uploadLimit()) throw new KnowledgeError("文件超过上传大小限制。", 413);
  const extension = path.extname(filename).toLowerCase();
  if (![".pdf", ".docx", ".doc", ".html", ".txt"].includes(extension)) throw new KnowledgeError("仅支持 PDF、DOCX、DOC、HTML 和 TXT。");
  const signature = buffer.subarray(0, 8).toString("hex");
  if (extension === ".pdf" && !buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new KnowledgeError("文件不是有效的 PDF。");
  if (extension === ".doc" && signature !== "d0cf11e0a1b11ae1") throw new KnowledgeError("文件不是有效的 DOC。");
  if (extension === ".docx") checkDocxDirectory(buffer);
  if ([".txt", ".html"].includes(extension)) {
    try { new TextDecoder("utf-8", { fatal: true }).decode(buffer); } catch { throw new KnowledgeError("文本文件须为 UTF-8 编码。"); }
    if (buffer.includes(0) || signature === "d0cf11e0a1b11ae1" || buffer.subarray(0, 4).toString() === "%PDF") throw new KnowledgeError("文件内容与文本格式不匹配。");
    if (extension === ".html" && !/<(?:!doctype\s+html|html|body|head|p|div|article|h[1-6]|table)\b/i.test(buffer.toString("utf8"))) throw new KnowledgeError("文件没有可识别的 HTML 结构。");
  }
  return { filename, extension, sourceType: extension.slice(1), hash: createHash("sha256").update(buffer).digest("hex") };
}
export async function storeOriginal(extension: string, buffer: Buffer) {
  const root = uploadRoot();
  await mkdir(root, { recursive: true });
  const uri = `${randomUUID()}${extension}`;
  await writeFile(path.join(await realpath(root), uri), buffer, { flag: "wx", mode: 0o600 });
  return uri;
}
export async function discardOriginal(uri: string) {
  const target = await controlledFile(uploadRoot(), uri);
  await unlink(target);
}
export async function readControlledJson(root: string, uri: string) {
  const file = await controlledFile(root, uri);
  if ((await stat(file)).size > 80 * 1024 * 1024) throw new KnowledgeError("规范化文件过大，无法预览。", 422);
  try { return JSON.parse(await readFile(file, "utf8")) as unknown; }
  catch { throw new KnowledgeError("规范化文件损坏，请重新解析。", 422); }
}
