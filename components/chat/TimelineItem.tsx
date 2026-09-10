"use client";

import { memo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Wrench, XCircle } from "lucide-react";
import type { ChatTimelineItem } from "@/types/chat";
import { MessageBubble } from "@/components/chat/MessageBubble";

const COLLAPSIBLE_CONTENT_THRESHOLD = 1_200;

interface TimelineItemProps {
  item: ChatTimelineItem;
  streamingMessageId: string | null;
  onDeleteMessage?: (messageId: string) => void;
  deleteDisabled?: boolean;
  deletingMessageId?: string | null;
  onRegenerateMessage?: (messageId: string) => void;
  regenerateDisabled?: boolean;
}

const statusPresentation = {
  pending: { label: "等待执行", icon: Circle, className: "text-muted" },
  running: { label: "执行中", icon: Circle, className: "text-primary animate-pulse" },
  completed: { label: "已完成", icon: CheckCircle2, className: "text-success" },
  failed: { label: "执行失败", icon: XCircle, className: "text-destructive" },
} as const;

function TimelineCard({
  title,
  summary,
  status,
  children,
}: {
  title: string;
  summary: string;
  status: keyof typeof statusPresentation;
  children?: React.ReactNode;
}) {
  const presentation = statusPresentation[status];
  const StatusIcon = presentation.icon;

  return (
    <article className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground">
      <div className="flex items-center gap-2">
        <Wrench className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate font-medium">{title}</p>
        <span className={`flex shrink-0 items-center gap-1 text-xs ${presentation.className}`}>
          <StatusIcon className="size-3.5" aria-hidden="true" />
          {presentation.label}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-muted">{summary}</p>
      {children}
    </article>
  );
}

function CollapsibleDetails({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > COLLAPSIBLE_CONTENT_THRESHOLD;
  const visibleContent = expanded || !isLong ? content : content.slice(0, COLLAPSIBLE_CONTENT_THRESHOLD);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-3 text-xs leading-relaxed text-foreground">
        {visibleContent}
        {!expanded && isLong ? "…" : ""}
      </pre>
      {isLong ? (
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          {expanded ? "收起详情" : "展开详情"}
        </button>
      ) : null}
    </div>
  );
}

function TimelineItemComponent({
  item,
  streamingMessageId,
  onDeleteMessage,
  deleteDisabled = false,
  deletingMessageId = null,
  onRegenerateMessage,
  regenerateDisabled = false,
}: TimelineItemProps) {
  if (item.type === "message") {
    const { message } = item;
    return (
      <MessageBubble
        message={message}
        useMarkdown={
          message.role !== "assistant" || message.id !== streamingMessageId
        }
        onDelete={onDeleteMessage}
        deleteDisabled={deleteDisabled}
        isDeleting={deletingMessageId === message.id}
        onRegenerate={onRegenerateMessage}
        regenerateDisabled={regenerateDisabled}
      />
    );
  }

  if (item.type === "tool-result") {
    return (
      <TimelineCard
        title={`${item.toolName} 结果`}
        summary={item.summary}
        status={item.status}
      >
        <CollapsibleDetails content={item.content} />
      </TimelineCard>
    );
  }

  if (item.type === "tool-call") {
    return (
      <TimelineCard
        title={`调用 ${item.toolName}`}
        summary={item.summary}
        status={item.status}
      />
    );
  }

  return (
    <TimelineCard
      title={item.label}
      summary={item.detail ?? "暂无补充说明"}
      status={item.status}
    />
  );
}

export const TimelineItem = memo(TimelineItemComponent);
