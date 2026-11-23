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
import { citationRemarkPlugin } from "@/lib/rag/citation-markdown";
import type { ChatSource } from "@/types/chat";

interface MessageContentProps {
  content: string;
  sources?: ChatSource[];
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
  sources = [],
}: MessageContentProps) {
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const toggleSource = useCallback((number: number) => {
    setSelectedNumber((current) => current === number ? null : number);
  }, []);
  const sourceNumbers = useMemo(() => new Set(sources.map((source) => source.number)), [sources]);
  const remarkPlugins = useMemo(() => [...markdownRemarkPlugins, () => citationRemarkPlugin(sourceNumbers)], [sourceNumbers]);
  const components = useMemo(() => ({
    ...markdownComponents,
    a: ({ href, children, ...props }: ComponentPropsWithoutRef<"a">) => {
      const number = /^#rag-source-(\d+)$/.exec(href ?? "")?.[1];
      if (number && sourceNumbers.has(Number(number))) {
        return <button type="button" className="font-medium text-primary underline underline-offset-2 hover:opacity-80" onClick={() => toggleSource(Number(number))} aria-expanded={selectedNumber === Number(number)} aria-label={`${selectedNumber === Number(number) ? "收起" : "查看"}来源${number}原文`}>{children}</button>;
      }
      return <MarkdownLink href={href} {...props}>{children}</MarkdownLink>;
    },
  }), [selectedNumber, sourceNumbers, toggleSource]);
  const selectedSource = sources.find((source) => source.number === selectedNumber);
  if (!content) {
    return null;
  }

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={markdownRehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
      {sources.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3 text-sm">
          <p className="font-medium">本次检索来源</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sources.map((source) => <button key={source.number} type="button" className="rounded-lg border border-border px-2 py-1 text-left text-xs text-primary hover:bg-background" onClick={() => toggleSource(source.number)} aria-expanded={selectedNumber === source.number} aria-label={`${selectedNumber === source.number ? "收起" : "查看"}来源${source.number}原文`}>[来源{source.number}] {source.documentTitle}</button>)}
          </div>
          {selectedSource ? <section className="mt-3 rounded-lg border border-border bg-background p-3" aria-label={`来源${selectedSource.number}原文`}>
            <div className="flex items-start justify-between gap-3"><p className="font-medium">[来源{selectedSource.number}] {selectedSource.documentTitle}</p><button type="button" className="shrink-0 text-xs text-primary underline underline-offset-2" onClick={() => setSelectedNumber(null)} aria-label={`收起来源${selectedSource.number}详情`}>收起</button></div>
            <p className="mt-1 text-xs text-muted">{selectedSource.sectionPath || "未标注章节"} · {selectedSource.pageFrom ? `第 ${selectedSource.pageFrom}${selectedSource.pageTo && selectedSource.pageTo !== selectedSource.pageFrom ? `–${selectedSource.pageTo}` : ""} 页` : "无物理页码"}</p>
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-6">{selectedSource.text}</pre>
            <a className="mt-2 inline-block text-xs text-primary underline" href={`/knowledge-bases/${encodeURIComponent(selectedSource.knowledgeBaseId)}/documents/${encodeURIComponent(selectedSource.documentId)}`}>打开文档详情</a>
          </section> : null}
        </div>
      ) : null}
    </div>
  );
});
