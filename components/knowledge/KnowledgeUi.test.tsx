import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QualityIssues } from "./KnowledgeDocumentDetail";
import { Pager, useKnowledge } from "./KnowledgeUi";

function Probe() {
  const { data } = useKnowledge<{ title: string }>("/api/knowledge-bases/kb/documents/doc/normalized");
  return <p>{data?.title ?? "加载中"}</p>;
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("knowledge preview requests", () => {
  it("StrictMode effect replay issues only one request", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ code: 0, data: { title: "正文" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<StrictMode><Probe /></StrictMode>);
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("正文")).toBeInTheDocument();
  });
});

describe("knowledge document navigation", () => {
  it("jumps to a valid page and rejects pages outside the range", () => {
    const onPage = vi.fn();
    render(<Pager page={1} pageSize={10} total={99} onPage={onPage} />);
    const input = screen.getByRole("spinbutton", { name: "目标页码" });
    fireEvent.change(input, { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "跳转" }));
    expect(onPage).toHaveBeenCalledWith(8);
    fireEvent.change(input, { target: { value: "11" } });
    expect(screen.getByRole("button", { name: "跳转" })).toBeDisabled();
  });

  it("groups repeated quality messages while keeping blocking issues visible", () => {
    render(<QualityIssues issues={[
      { severity: "warning", message: "切片边界需检查" },
      { severity: "warning", message: "切片边界需检查" },
      { severity: "blocking", message: "切片内容为空" },
    ]} />);
    expect(screen.getByText("共 3 条提示，合并为 2 类。")).toBeInTheDocument();
    expect(screen.getByText(/需复核：切片边界需检查/)).toHaveTextContent("（2 条）");
    expect(screen.getByText("无法启用：切片内容为空")).toBeInTheDocument();
  });
});
