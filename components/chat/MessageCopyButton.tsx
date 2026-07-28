"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";

import { IconButton } from "@/components/ui/IconButton";

interface MessageCopyButtonProps {
  content: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}

export function MessageCopyButton({
  content,
  label = "复制整条消息",
  copiedLabel = "已复制整条消息",
  className = "text-muted opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100",
}: MessageCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!content) {
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      console.warn("Failed to copy message");
    }
  }, [content]);

  if (!content) {
    return null;
  }

  return (
    <IconButton
      icon={copied ? Check : Copy}
      label={copied ? copiedLabel : label}
      iconSize={14}
      inset={4}
      className={className}
      onClick={handleCopy}
    />
  );
}
