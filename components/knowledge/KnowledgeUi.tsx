"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, BookOpen, ChevronRight, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { labels, type DocumentDto } from "@/lib/knowledge/contracts";

export async function knowledgeFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (response.status === 401) {
    window.location.assign(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
    throw new Error("登录已失效，请重新登录。");
  }
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) throw new Error("服务返回异常，请重试。");
  const body = await response.json();
  if (!response.ok || body.code !== 0) throw new Error(body.message || "操作失败，请重试。");
  return body.data as T;
}
export function useKnowledge<T>(url: string | null, pollWhen?: (value: T) => boolean) {
  const [state, setState] = useState<{ url: string; data?: T; error?: string }>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    // A deferred start lets React's development effect replay cancel the timer
    // before a redundant request reaches the network.
    const start = setTimeout(() => {
      knowledgeFetch<T>(url, { signal: controller.signal }).then((data) => {
        if (controller.signal.aborted) return;
        setState({ url, data });
        if (pollWhen?.(data)) timeout = setTimeout(() => setRevision((n) => n + 1), 2000);
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ url, error: error instanceof Error ? error.message : "加载失败。" });
      });
    }, 0);
    return () => { clearTimeout(start); controller.abort(); clearTimeout(timeout); };
  }, [url, revision, pollWhen]);
  const current = state?.url === url ? state : undefined;
  return { data: current?.data, error: current?.error, loading: Boolean(url && !current), refresh: () => setRevision((n) => n + 1) };
}
export function KnowledgeShell({ title, description, parent, children }: { title: string; description: string; parent?: { href: string; label: string }; children: ReactNode }) {
  return <div className="min-h-screen bg-background">
    <header className="border-b border-border bg-surface"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
      <Link href="/knowledge-bases" className="flex items-center gap-3 font-semibold"><span className="rounded-xl bg-primary/10 p-2 text-primary"><BookOpen size={22} /></span>法律知识库</Link>
      <Link href="/" className="flex items-center gap-2 text-sm text-muted hover:text-primary"><ArrowLeft size={16} />返回聊天</Link>
    </div></header>
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <nav aria-label="面包屑" className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted"><Link href="/knowledge-bases" className="hover:text-primary">知识库</Link>{parent && <><ChevronRight size={14} /><Link href={parent.href} className="hover:text-primary">{parent.label}</Link></>}<ChevronRight size={14} /><span className="break-all">{title}</span></nav>
      <div className="mb-8"><h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{description}</p></div>
      {children}
    </main>
  </div>;
}
export const panelClass = "rounded-2xl border border-border bg-surface p-5 sm:p-6";
export const inputClass = "min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50";
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div role={error ? "alert" : "status"} className={`mb-5 rounded-xl border px-4 py-3 text-sm leading-6 ${error ? "border-destructive/25 bg-destructive/5 text-destructive" : "border-primary/20 bg-primary/5 text-foreground"}`}>{children}</div>;
}
export function LoadState({ error, refresh }: { error?: string; refresh: () => void }) {
  return error ? <Notice error>{error}<Button className="ml-3" variant="secondary" onClick={refresh}>重试</Button></Notice> : <div role="status" className={`${panelClass} animate-pulse text-muted`}>正在加载知识库资料…</div>;
}
export function Empty({ title, text }: { title: string; text: string }) {
  return <div className={`${panelClass} py-14 text-center`}><FileText className="mx-auto mb-4 text-muted" size={32} /><h2 className="font-medium">{title}</h2><p className="mt-2 text-sm text-muted">{text}</p></div>;
}
export function Status({ value }: { value: string }) {
  const color = ["failed", "blocked", "ocr_failed", "manual_review"].includes(value) ? "bg-destructive/10 text-destructive" : ["succeeded", "active"].includes(value) ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-primary/10 text-primary";
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${color}`}>{labels[value] ?? value}</span>;
}
export function DocumentStages({ doc }: { doc: DocumentDto }) {
  return <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs leading-6 text-muted">
    <span className="flex items-center gap-2 whitespace-nowrap">解析 <Status value={doc.status} /></span>
    {doc.extractionMethod === "ocr" && <span className="flex items-center gap-2 whitespace-nowrap">OCR 审核 <span>{doc.reviewedNormalizedHash && doc.reviewedNormalizedHash === doc.normalizedContentHash ? "已确认" : "待确认"}</span></span>}
    <span className="flex items-center gap-2 whitespace-nowrap">切片 <span>{doc.chunkCount ? `${doc.chunkCount} 段` : doc.chunkState === "blocked" ? "质量待检查" : "未生成"}</span></span>
    <span className="flex items-center gap-2 whitespace-nowrap">索引 <span>{doc.chunkCount ? `${doc.indexedCount} / ${doc.chunkCount}` : "待切片"}</span></span>
  </div>;
}
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-muted"><span>共 {total} 项 · 第 {page} / {pageCount} 页</span><div className="flex flex-wrap items-center gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</Button><Button variant="secondary" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>下一页</Button><PageJump key={page} page={page} pageCount={pageCount} onPage={onPage} /></div></div>;
}
function PageJump({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (page: number) => void }) {
  const [target, setTarget] = useState(String(page));
  const targetPage = Number(target);
  const valid = target.trim() !== "" && Number.isSafeInteger(targetPage) && targetPage >= 1 && targetPage <= pageCount;
  return <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); if (valid) onPage(targetPage); }}>
    <label htmlFor="knowledge-page-jump">跳转到</label>
    <input id="knowledge-page-jump" aria-label="目标页码" className={`${inputClass} w-20`} type="number" min={1} max={pageCount} step={1} value={target} onChange={(event) => setTarget(event.target.value)} />
    <span>页</span><Button variant="secondary" type="submit" disabled={!valid || targetPage === page}>跳转</Button>
  </form>;
}
export function RefreshButton({ onClick }: { onClick: () => void }) { return <Button variant="secondary" onClick={onClick}><RefreshCw size={14} className="mr-2" />刷新</Button>; }
