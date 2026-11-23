import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/auth/require-api-session", () => ({ requireApiSession: mocks.session }));
import { knowledgeApi, limitedBody, objectBody, uploadedFile } from "./api";

beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ userId: "owner", error: null }); });
describe("知识库 API 边界", () => {
  it("未登录先拒绝，不执行数据操作", async () => {
    mocks.session.mockResolvedValue({ userId: null, error: Response.json({ code: 401 }, { status: 401 }) });
    const operation = vi.fn();
    expect((await knowledgeApi(new Request("http://localhost/api/knowledge-bases"), operation)).status).toBe(401);
    expect(operation).not.toHaveBeenCalled();
  });
  it("跨来源写请求返回 403", async () => {
    const operation = vi.fn();
    const request = new Request("http://localhost/api/knowledge-bases", { method: "POST", headers: { origin: "https://untrusted.example" } });
    expect((await knowledgeApi(request, operation)).status).toBe(403);
    expect(operation).not.toHaveBeenCalled();
  });
  it("成功结果不缓存，未知服务错误不泄露凭证", async () => {
    const request = new Request("http://localhost/api/knowledge-bases");
    const response = await knowledgeApi(request, async (id) => ({ userId: id }));
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ code: 0, data: { userId: "owner" } });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await knowledgeApi(request, async () => { throw new Error("secret-password-123"); });
    expect(failed.status).toBe(500); expect(await failed.text()).not.toContain("secret-password");
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain("secret-password"); consoleSpy.mockRestore();
  });
  it("未提供 Content-Length 也按实际流量限制请求体", async () => {
    const request = new Request("http://localhost/upload", { method: "POST", body: "A".repeat(20) });
    await expect(limitedBody(request, 10)).rejects.toMatchObject({ status: 413 });
  });
  it("拒绝数组 JSON 和不合法上传表单", async () => {
    await expect(objectBody(new Request("http://localhost", { method: "POST", body: "[]" }))).rejects.toThrow(/JSON 对象/);
    await expect(uploadedFile(new Request("http://localhost", { method: "POST", body: "raw file" }))).rejects.toThrow(/上传表单/);
  });
});
