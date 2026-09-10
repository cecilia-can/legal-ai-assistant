"use client";

import { Check, Copy } from "lucide-react";
import {
  useCallback,
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

// 解析插件和组件映射不依赖单条消息内容。置于模块级可避免每次消息挂载时重建配置，
// 同时保留 MessageContent 的 memo，以跳过仍在可视窗口内的相同内容重渲染。
const markdownComponents = {
  a: MarkdownLink,
  pre: CodeBlockPre,
  code: MarkdownCode,
  table: MarkdownTable,
};
const markdownRemarkPlugins = [remarkGfm];
const markdownRehypePlugins = [rehypeHighlight];

export const MessageContent = memo(function MessageContent({
  content,
}: MessageContentProps) {
  if (!content) {
    return null;
  }

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={markdownRemarkPlugins}
        rehypePlugins={markdownRehypePlugins}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
