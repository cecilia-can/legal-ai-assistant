"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
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
}

export function ChatInput({
  placeholder = "输入您的法律问题…",
  onSubmit,
  disabled = false,
  isStreaming = false,
  onStop,
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Textarea
        label="聊天输入"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
        disabled={disabled}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {isStreaming
            ? "Enter 发送新问题（将停止当前回复），Shift+Enter 换行"
            : "Enter 发送，Shift+Enter 换行"}
        </p>
        {showStop ? (
          <Button type="button" variant="secondary" onClick={handleStopClick}>
            停止生成
          </Button>
        ) : (
          <Button type="submit" disabled={!canSend}>
            发送
          </Button>
        )}
      </div>
    </form>
  );
}
