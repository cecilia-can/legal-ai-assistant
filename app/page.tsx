"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainPanel } from "@/components/layout/MainPanel";
import { ConversationList } from "@/components/chat/ConversationList";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import type { ChatMessage, Conversation } from "@/types/chat";

const initialConversations: Conversation[] = [
  {
    id: "conv-1",
    title: "劳动合同解除咨询",
    createdAt: new Date("2026-07-10T09:00:00"),
    updatedAt: new Date("2026-07-10T09:30:00"),
  },
  {
    id: "conv-2",
    title: "房屋租赁纠纷",
    createdAt: new Date("2026-07-11T14:00:00"),
    updatedAt: new Date("2026-07-11T15:10:00"),
  },
  {
    id: "conv-3",
    title: "知识产权保护",
    createdAt: new Date("2026-07-12T10:00:00"),
    updatedAt: new Date("2026-07-12T11:00:00"),
  },
];

const initialMessages: Record<string, ChatMessage[]> = {
  "conv-1": [
    {
      id: "msg-1",
      role: "user",
      content: "公司单方面解除劳动合同，我需要准备哪些材料？",
      createdAt: new Date("2026-07-10T09:05:00"),
    },
    {
      id: "msg-2",
      role: "assistant",
      content:
        "建议先收集劳动合同、解除通知、工资流水和考勤记录。若认为解除不合法，可在收到通知后及时申请劳动仲裁。",
      createdAt: new Date("2026-07-10T09:06:00"),
    },
  ],
  "conv-2": [
    {
      id: "msg-3",
      role: "user",
      content: "房东提前收房但不退押金，我该怎么办？",
      createdAt: new Date("2026-07-11T14:05:00"),
    },
    {
      id: "msg-4",
      role: "assistant",
      content:
        "请先核对租赁合同中的押金条款和提前解约约定，保留沟通记录与房屋交接证据，必要时可通过协商、调解或诉讼途径维权。",
      createdAt: new Date("2026-07-11T14:06:00"),
    },
  ],
  "conv-3": [],
};

export default function HomePage() {
  const [conversations, setConversations] =
    useState<Conversation[]>(initialConversations);
  const [activeId, setActiveId] = useState<string>("conv-1");
  const [messagesByConversation, setMessagesByConversation] =
    useState<Record<string, ChatMessage[]>>(initialMessages);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId),
    [conversations, activeId],
  );

  const activeMessages = messagesByConversation[activeId] ?? [];

  function handleNewChat() {
    const now = new Date();
    const newConversation: Conversation = {
      id: `conv-${now.getTime()}`,
      title: "新对话",
      createdAt: now,
      updatedAt: now,
    };

    setConversations((current) => [newConversation, ...current]);
    setMessagesByConversation((current) => ({
      ...current,
      [newConversation.id]: [],
    }));
    setActiveId(newConversation.id);
  }

  function handleSelectConversation(id: string) {
    setActiveId(id);
    setMobileSidebarOpen(false);
  }

  function handleSubmitMessage(content: string) {
    const now = new Date();
    const userMessage: ChatMessage = {
      id: `msg-${now.getTime()}`,
      role: "user",
      content,
      createdAt: now,
    };

    setMessagesByConversation((current) => ({
      ...current,
      [activeId]: [...(current[activeId] ?? []), userMessage],
    }));

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeId
          ? {
              ...conversation,
              updatedAt: now,
              title:
                conversation.title === "新对话" && content.length > 0
                  ? content.slice(0, 20)
                  : conversation.title,
            }
          : conversation,
      ),
    );
  }

  function renderSidebar({
    onClose,
    onCollapse,
  }: {
    onClose?: () => void;
    onCollapse?: () => void;
  }) {
    return (
      <Sidebar onNewChat={handleNewChat} onClose={onClose} onCollapse={onCollapse}>
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={handleSelectConversation}
        />
      </Sidebar>
    );
  }

  return (
    <AppShell
      mobileSidebarOpen={mobileSidebarOpen}
      onMobileSidebarClose={() => setMobileSidebarOpen(false)}
      desktopSidebarCollapsed={desktopSidebarCollapsed}
      onDesktopSidebarCollapse={() => setDesktopSidebarCollapsed(true)}
      renderSidebar={renderSidebar}
      main={
        <MainPanel
          title={activeConversation?.title ?? "法律 AI 助手"}
          subtitle="本界面为静态演示，尚未接入 AI 回复"
          messages={<MessageList messages={activeMessages} />}
          input={<ChatInput onSubmit={handleSubmitMessage} />}
          onOpenSidebar={() => setMobileSidebarOpen(true)}
          desktopSidebarCollapsed={desktopSidebarCollapsed}
          onExpandDesktopSidebar={() => setDesktopSidebarCollapsed(false)}
        />
      }
    />
  );
}
