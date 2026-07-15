"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

interface ChatInputProps {
  placeholder?: string;
  onSubmit?: (value: string) => void;
  disabled?: boolean;
}

export function ChatInput({
  placeholder = "输入您的法律问题…",
  onSubmit,
  disabled = false,
}: ChatInputProps) {
  const [value, setValue] = useState("");

  const trimmedValue = value.trim();
  const canSubmit = trimmedValue.length > 0 && !disabled;

  function submitMessage() {
    if (!canSubmit) {
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
        <p className="text-xs text-muted">Enter 发送，Shift+Enter 换行</p>
        <Button type="submit" disabled={!canSubmit}>
          发送
        </Button>
      </div>
    </form>
  );
}
