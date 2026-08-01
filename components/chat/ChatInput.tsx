"use client";

import { ArrowUp, Square } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/Textarea";

interface ChatInputProps {
  placeholder?: string;
  onSubmit?: (value: string) => void;
  /** 无会话或加载中时禁用输入 */
  disabled?: boolean;
  /** 当前会话正在流式生成 */
  isStreaming?: boolean;
  /** 停止当前流式生成（等同 ChatGPT Stop） */
  onStop?: () => void;
  /** 供快捷键聚焦输入框 */
  inputId?: string;
}

const actionButtonBase =
  "inline-flex shrink-0 items-center justify-center rounded-full transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40";

export function ChatInput({
  placeholder = "输入您的法律问题…",
  onSubmit,
  disabled = false,
  isStreaming = false,
  onStop,
  inputId = "chat-input-textarea",
}: ChatInputProps) {
  const [value, setValue] = useState("");

  const trimmedValue = value.trim();
  const canSend = trimmedValue.length > 0 && !disabled;
  const showStop = isStreaming && trimmedValue.length === 0;

  function submitMessage() {
    if (!canSend) {
      return;
    }

    onSubmit?.(trimmedValue);
    setValue("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitMessage();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitMessage();
    }
  }

  function handleStopClick() {
    onStop?.();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Textarea
            id={inputId}
            label="聊天输入"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={3}
            disabled={disabled}
            className="text-base md:text-sm"
          />
        </div>
        {showStop ? (
          <button
            type="button"
            aria-label="停止生成"
            onClick={handleStopClick}
            className={`${actionButtonBase} mb-1 h-8 w-8 border border-foreground bg-surface hover:bg-background`}
          >
            <Square
              className="h-2.5 w-2.5 fill-foreground text-foreground"
              aria-hidden
            />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="发送"
            disabled={!canSend}
            className={`${actionButtonBase} mb-1 h-8 w-8 bg-primary text-primary-foreground hover:opacity-90`}
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        {isStreaming
          ? "Enter 发送新问题（将停止当前回复），Shift+Enter 换行 · Ctrl+Shift+O 新建 · Shift+Esc 聚焦 · Ctrl+. 停止"
          : "Enter 发送，Shift+Enter 换行 · Ctrl+Shift+O 新建 · Shift+Esc 聚焦输入"}
      </p>
    </form>
  );
}
