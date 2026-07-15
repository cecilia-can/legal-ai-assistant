import type { TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function Textarea({ label, className = "", id, ...props }: TextareaProps) {
  const textareaId = id ?? (label ? `textarea-${label}` : undefined);

  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={textareaId} className="sr-only">
          {label}
        </label>
      ) : null}
      <textarea
        id={textareaId}
        className={`w-full resize-none rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      />
    </div>
  );
}
