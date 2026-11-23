import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageContent } from "./MessageContent";
import type { ChatSource } from "@/types/chat";

const source: ChatSource = {
  number: 1, chunkId: "chunk-1", knowledgeBaseId: "kb-1", documentId: "doc-1",
  documentTitle: "劳动合同法", sectionPath: "第九条", pageFrom: 2, pageTo: 2,
  text: "第九条 用人单位招用劳动者，不得扣押居民身份证。",
};

describe("聊天来源快照", () => {
  it("点击来源可展开、再次点击或使用收起按钮可关闭详情", () => {
    const { unmount } = render(<MessageContent content="不得扣押。[来源1] 未找到的[来源2]。" sources={[source]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "查看来源1原文" })[0]);
    expect(screen.getByRole("region", { name: "来源1原文" })).toHaveTextContent(source.text);
    expect(screen.getByRole("link", { name: "打开文档详情" })).toHaveAttribute("href", "/knowledge-bases/kb-1/documents/doc-1");
    expect(screen.getAllByRole("button", { name: "收起来源1原文" })[0]).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getAllByRole("button", { name: "收起来源1原文" })[0]);
    expect(screen.queryByRole("region", { name: "来源1原文" })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "查看来源1原文" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "收起来源1详情" }));
    expect(screen.queryByRole("region", { name: "来源1原文" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看来源2原文" })).not.toBeInTheDocument();
    unmount();
  });

  it("旧消息没有快照时不把来源标记伪装成可验证链接", () => {
    render(<MessageContent content="旧回复。[来源1]" />);
    expect(screen.getByText(/\[来源1\]/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看来源1原文" })).not.toBeInTheDocument();
  });
});
