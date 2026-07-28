"use client";

import { Check, Copy } from "lucide-react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  memo,
  type ComponentPropsWithoutRef,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { IconButton } from "@/components/ui/IconButton";

interface MessageContentProps {
  content: string;
}

function CodeBlockPre({
  children,
  ...props
}: ComponentPropsWithoutRef<"pre">) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const codeEl = preRef.current?.querySelector("code");
    const text =
      codeEl?.textContent ?? preRef.current?.textContent ?? "";

    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      console.warn("Failed to copy code block");
    }
  }, []);

  return (
    <div className="code-block-wrapper group/code">
      <IconButton
        icon={copied ? Check : Copy}
        label={copied ? "已复制" : "复制代码"}
        iconSize={14}
        inset={4}
        className="code-block-copy border-border/60 bg-surface/90 shadow-sm backdrop-blur-sm"
        onClick={handleCopy}
      />
      <pre ref={preRef} {...props}>
        {children}
      </pre>
    </div>
  );
}

function MarkdownCode({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"code">) {
  const isBlock = Boolean(className?.includes("language-"));

  if (isBlock) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  return (
    <code className="markdown-inline-code" {...props}>
      {children}
    </code>
  );
}

function MarkdownLink({
  href,
  children,
  ...props
}: ComponentPropsWithoutRef<"a">) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
}

function MarkdownTable({
  children,
  ...props
}: ComponentPropsWithoutRef<"table">) {
  return (
    <div className="table-wrapper">
      <table {...props}>{children}</table>
    </div>
  );
}

export const MessageContent = memo(function MessageContent({
  content,
}: MessageContentProps) {
  const components = useMemo(
    () => ({
      a: MarkdownLink,
      pre: CodeBlockPre,
      code: MarkdownCode,
      table: MarkdownTable,
    }),
    [],
  );

  if (!content) {
    return null;
  }

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
