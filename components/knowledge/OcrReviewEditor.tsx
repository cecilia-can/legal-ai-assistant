"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { PageResult } from "@/lib/knowledge/contracts";
import { inputClass, knowledgeFetch, LoadState, Pager, panelClass, useKnowledge } from "./KnowledgeUi";

type NormalizedPage = { pageNumber: number | null; text: string };

export function OcrReviewEditor({ base, pageIndex, text, expectedHash, editable, onSaved, onDirtyChange }: {
  base: string; pageIndex: number; text: string; expectedHash: string;
  editable: boolean; onSaved: (hash: string) => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(text);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  async function save() {
    setBusy(true); setMessage(undefined);
    try {
      const result = await knowledgeFetch<{ normalizedContentHash: string }>(`${base}/normalized`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageIndex, text: draft, expectedHash }),
      });
      setMessage({ text: "本页修改已保存。全文审核状态已重置，请完成检查后重新确认。" });
      onDirtyChange(false);
      onSaved(result.normalizedContentHash);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "保存失败。", error: true });
    } finally { setBusy(false); }
  }
  return <div><label htmlFor={`ocr-text-${pageIndex}`} className="mb-2 block text-sm font-medium">识别文本 · 可直接修改</label><textarea id={`ocr-text-${pageIndex}`} className={`${inputClass} h-[620px] w-full resize-y whitespace-pre-wrap font-mono leading-6`} value={draft} readOnly={!editable} maxLength={30_000} onChange={(event) => { setDraft(event.target.value); onDirtyChange(event.target.value !== text); }} />
    {editable && <div className="mt-3 flex flex-wrap items-center gap-3"><Button disabled={busy || draft === text || !draft.trim()} onClick={save}>{busy ? "保存中…" : "保存本页修改"}</Button><span className="text-xs text-muted">修改会保留原始 OCR 结果，并停用旧切片与索引。</span></div>}
    {message && <p role={message.error ? "alert" : "status"} className={`mt-2 text-sm ${message.error ? "text-destructive" : "text-muted"}`}>{message.text}</p>}
  </div>;
}

type PdfDocument = { getPage(number: number): Promise<{ getViewport(options: { scale: number }): { width: number; height: number }; render(options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<void> } }> };

function PdfPageCanvas({ source, pageNumber }: { source: string; pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<PdfDocument | null>(null);
  const [state, setState] = useState<{ loading: boolean; error?: string }>({ loading: true });
  useEffect(() => {
    let cancelled = false;
    let task: { promise: Promise<PdfDocument>; destroy(): Promise<void> } | undefined;
    void import("pdfjs-dist/legacy/build/pdf.mjs").then(async (pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
      const loadingTask = pdfjs.getDocument({ url: source, withCredentials: true }) as NonNullable<typeof task>;
      task = loadingTask;
      const pdf = await loadingTask.promise;
      if (cancelled) return;
      pdfRef.current = pdf as PdfDocument;
      setState({ loading: false });
    }).catch(() => { if (!cancelled) setState({ loading: false, error: "PDF 原图加载失败，请刷新后重试。" }); });
    return () => { cancelled = true; pdfRef.current = null; void task?.destroy(); };
  }, [source]);
  useEffect(() => {
    let cancelled = false;
    const draw = async () => {
      const pdf = pdfRef.current;
      const canvas = canvasRef.current;
      if (!pdf || !canvas || state.loading) return;
      try {
        const pdfPage = await pdf.getPage(pageNumber);
        const scale = Math.min(1.7, Math.max(1, (canvas.parentElement?.clientWidth ?? 680) / 595));
        const viewport = pdfPage.getViewport({ scale });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * ratio); canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`; canvas.style.height = `${Math.floor(viewport.height)}px`;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        await pdfPage.render({ canvasContext: context, viewport }).promise;
      } catch { if (!cancelled) setState({ loading: false, error: "PDF 页面渲染失败，请刷新后重试。" }); }
    };
    void draw();
    return () => { cancelled = true; };
  }, [pageNumber, state.loading]);
  return <div><div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium"><span>PDF 原图 · 第 {pageNumber} 页</span><a href={`${source}#page=${pageNumber}`} target="_blank" rel="noreferrer" className="text-xs text-primary underline">新窗口打开</a></div><div className="flex h-[620px] items-start justify-center overflow-auto rounded-lg border border-border bg-background p-3">{state.loading && <p role="status" className="mt-8 text-sm text-muted">正在加载 PDF 原图…</p>}{state.error && <p role="alert" className="mt-8 text-sm text-destructive">{state.error}</p>}<canvas ref={canvasRef} aria-label={`PDF 原图第 ${pageNumber} 页`} className={state.loading || state.error ? "hidden" : "block max-w-none shadow-sm"} /></div></div>;
}

export function OcrReviewWorkspace({ base, expectedHash, editable, dirty, onDirtyChange, onSaved }: {
  base: string; expectedHash: string; editable: boolean; dirty: boolean;
  onDirtyChange: (dirty: boolean) => void; onSaved: (hash: string) => void;
}) {
  const [page, setPage] = useState(1);
  const { data, error, refresh } = useKnowledge<PageResult<NormalizedPage>>(`${base}/normalized?page=${page}&pageSize=1`);
  const movePage = (next: number) => {
    if (dirty && !window.confirm("本页有未保存的修改，确定离开？")) return;
    onDirtyChange(false); setPage(next);
  };
  if (!data) return <LoadState error={error} refresh={refresh} />;
  const current = data.items[0];
  if (!current) return <p className={panelClass}>暂无规范化正文。</p>;
  const pageNumber = current.pageNumber ?? page;
  return <section className={panelClass}><div className="mb-4"><p className="font-medium">OCR 人工审核</p></div><div className="grid gap-5 lg:grid-cols-2"><PdfPageCanvas key={`${base}/original`} source={`${base}/original`} pageNumber={pageNumber} /><OcrReviewEditor key={`${page}-${expectedHash}`} base={base} pageIndex={page - 1} text={current.text} expectedHash={expectedHash} editable={editable} onDirtyChange={onDirtyChange} onSaved={(hash) => { refresh(); onSaved(hash); }} /></div><Pager page={page} pageSize={data.pageSize} total={data.total} onPage={movePage} /></section>;
}
