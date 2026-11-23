import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { controlledFile, validateUpload } from "./storage";
import { pagination, parseAction } from "./contracts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function createTestJunction(target: string, link: string) {
  try {
    await symlink(target, link, "junction");
    return true;
  } catch (error) {
    if (process.platform === "win32" && (error as NodeJS.ErrnoException).code === "EPERM") return false;
    throw error;
  }
}

describe("知识库上传与预览边界", () => {
  it("接受 UTF-8 正文，拒绝伪装格式、非法文件名、空文件及未支持格式", () => {
    expect(validateUpload("测试.txt", Buffer.from("第一条 测试资料。"))).toMatchObject({ sourceType: "txt" });
    for (const [name, body] of [["fake.pdf", "not pdf"], ["fake.doc", "not doc"], ["fake.html", "plain text"], ["../x.txt", "body"], ["x.exe", "body"], ["empty.txt", ""]]) {
      expect(() => validateUpload(name, Buffer.from(body))).toThrow();
    }
    expect(() => validateUpload("binary.txt", Buffer.from([0xff, 0xfe, 0x00]))).toThrow();
  });
  it("按实际字节拒绝超限文件", () => {
    expect(() => validateUpload("large.txt", Buffer.alloc(20 * 1024 * 1024 + 1, 65))).toThrow(/大小限制/);
  });
  it("接受合法 DOCX，拒绝解压膨胀的 ZIP", async () => {
    const zip = new JSZip(); zip.file("word/document.xml", "<w:document>正文</w:document>");
    expect(validateUpload("valid.docx", await zip.generateAsync({ type: "nodebuffer" }))).toMatchObject({ sourceType: "docx" });
    zip.file("word/document.xml", "A".repeat(2_000_000));
    expect(() => validateUpload("bomb.docx", Buffer.from([]))).toThrow();
    const compressed = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    expect(() => validateUpload("bomb.docx", compressed)).toThrow(/安全限制/);
  });
  it("拒绝目录穿越、绝对路径、缺失产物与符号链接逃逸", async () => {
    const root = await mkdtemp(path.join(process.cwd(), ".knowledge-storage-test-")); roots.push(root);
    const outside = await mkdtemp(path.join(process.cwd(), ".knowledge-storage-outside-")); roots.push(outside);
    const base = path.join(root, "inside"); await mkdir(base); await writeFile(path.join(outside, "outside.txt"), "private");
    await writeFile(path.join(base, "valid.txt"), "safe");
    expect(await controlledFile(base, "valid.txt")).toBe(await import("node:fs/promises").then((fs) => fs.realpath(path.join(base, "valid.txt"))));
    for (const uri of ["../outside.txt", path.join(outside, "outside.txt"), "missing.txt"]) await expect(controlledFile(base, uri)).rejects.toThrow();
    if (!await createTestJunction(outside, path.join(base, "escape"))) return;
    await expect(controlledFile(base, "escape/outside.txt")).rejects.toThrow(/超出/);
  });
});
describe("管理请求输入", () => {
  it("限制分页与允许的处理动作", () => {
    expect(pagination(new URLSearchParams("page=2&pageSize=10"))).toMatchObject({ page: 2, pageSize: 10, skip: 10 });
    for (const query of ["page=0", "page=-1", "pageSize=101", "page=1.5", "pageSize=NaN"]) expect(() => pagination(new URLSearchParams(query))).toThrow();
    expect(parseAction("embed")).toBe("embed");
    expect(() => parseAction("delete-all")).toThrow();
  });
});
