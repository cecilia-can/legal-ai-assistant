import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageList } from "@/components/chat/MessageList";
import { TimelineItem } from "@/components/chat/TimelineItem";
import type { ChatMessage, ChatTimelineItem } from "@/types/chat";

function createMessages(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `message-${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    content: `第 ${index} 条消息`,
    createdAt: new Date(2026, 0, 1, 0, 0, index),
  }));
}

describe("MessageList", () => {
  it("长消息列表只挂载视口附近的消息项", async () => {
    render(<MessageList messages={createMessages(100)} />);

    await waitFor(() => {
      const renderedMessages = screen.getAllByLabelText(/消息$/);
      expect(renderedMessages.length).toBeGreaterThan(0);
      expect(renderedMessages.length).toBeLessThan(100);
    });
  });

  it("scrolling to the top requests the next page of older messages once", async () => {
    const onLoadOlder = vi.fn();
    const { container } = render(
      <MessageList
        messages={createMessages(10)}
        hasOlderMessages
        onLoadOlder={onLoadOlder}
      />,
    );
    const scrollContainer = container.querySelector(".overflow-y-auto");

    expect(scrollContainer).not.toBeNull();
    fireEvent.scroll(scrollContainer!, { target: { scrollTop: 0 } });
    fireEvent.scroll(scrollContainer!, { target: { scrollTop: 0 } });

    await waitFor(() => {
      expect(onLoadOlder).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps a streaming message as plain text, then renders Markdown after completion", async () => {
    const message: ChatMessage = {
      id: "streaming-message",
      role: "assistant",
      content: "Draft **analysis**",
      createdAt: new Date(2026, 0, 1),
    };
    const { rerender } = render(
      <MessageList messages={[message]} isStreaming />,
    );

    expect(screen.getByText("Draft **analysis**")).toBeInTheDocument();

    rerender(<MessageList messages={[message]} isStreaming={false} />);

    await waitFor(() => {
      expect(screen.getByText("analysis").tagName).toBe("STRONG");
    });
  });
});

describe("TimelineItem", () => {
  it("长工具结果默认折叠，点击后展示完整内容", () => {
    const content = `${"a".repeat(1_200)}完整结果结尾`;
    const item: ChatTimelineItem = {
      type: "tool-result",
      id: "tool-result-1",
      toolName: "法规检索",
      summary: "找到 1 条法规",
      content,
      status: "completed",
    };

    render(<TimelineItem item={item} streamingMessageId={null} />);

    expect(screen.getByRole("button", { name: "展开详情" })).toBeInTheDocument();
    expect(screen.queryByText("完整结果结尾")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展开详情" }));

    expect(screen.getByText(/完整结果结尾/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起详情" })).toBeInTheDocument();
  });
});
