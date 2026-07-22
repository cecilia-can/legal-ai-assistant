"use client";

import { useEffect, useId } from "react";

import { Button } from "@/components/ui/Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确定",
  cancelLabel = "取消",
  isConfirming = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isConfirming) {
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, isConfirming, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="关闭对话框"
        disabled={isConfirming}
        className="absolute inset-0 bg-foreground/40"
        onClick={isConfirming ? undefined : onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg"
      >
        <h2 id={titleId} className="text-lg font-semibold text-foreground">
          {title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-muted">
          {description}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button
            autoFocus
            variant="secondary"
            disabled={isConfirming}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="secondary"
            disabled={isConfirming}
            className="border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={onConfirm}
          >
            {isConfirming ? "删除中…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
