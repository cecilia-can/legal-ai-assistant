import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OcrReviewEditor } from "./OcrReviewEditor";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("./KnowledgeUi", () => ({ knowledgeFetch: fetchMock, inputClass: "" }));

beforeEach(() => fetchMock.mockReset().mockResolvedValue({ changed: true, normalizedContentHash: "b".repeat(64) }));
afterEach(cleanup);

describe("OCR page editor", () => {
  it("saves changed text against the current normalized version", async () => {
    const onSaved = vi.fn(), onDirtyChange = vi.fn();
    render(<OcrReviewEditor base="/api/knowledge-bases/kb/documents/doc" pageIndex={1} text="区动合同" expectedHash={"a".repeat(64)} editable onSaved={onSaved} onDirtyChange={onDirtyChange} />);
    fireEvent.change(screen.getByRole("textbox", { name: "识别文本 · 可直接修改" }), { target: { value: "劳动合同" } });
    expect(onDirtyChange).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "保存本页修改" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("b".repeat(64)));
    expect(fetchMock).toHaveBeenCalledWith("/api/knowledge-bases/kb/documents/doc/normalized", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ pageIndex: 1, text: "劳动合同", expectedHash: "a".repeat(64) }) }));
  });

  it("does not allow edits to a read-only document", () => {
    render(<OcrReviewEditor base="/api/knowledge-bases/kb/documents/doc" pageIndex={0} text="正文" expectedHash={"a".repeat(64)} editable={false} onSaved={vi.fn()} onDirtyChange={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "识别文本 · 可直接修改" })).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "保存本页修改" })).not.toBeInTheDocument();
  });
});
