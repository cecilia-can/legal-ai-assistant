import { Button } from "@/components/ui/Button";

interface InlineErrorProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  retrying?: boolean;
  className?: string;
}

export function InlineError({
  message,
  onRetry,
  onDismiss,
  retrying = false,
  className = "",
}: InlineErrorProps) {
  return (
    <div
      role="alert"
      className={`flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive ${className}`}
    >
      <p>{message}</p>
      {onRetry || onDismiss ? (
        <div className="flex flex-wrap gap-2">
          {onRetry ? (
            <Button
              type="button"
              variant="secondary"
              className="border-destructive/30 text-destructive hover:bg-destructive/10"
              disabled={retrying}
              onClick={onRetry}
            >
              {retrying ? "重试中…" : "重试"}
            </Button>
          ) : null}
          {onDismiss ? (
            <Button type="button" variant="secondary" onClick={onDismiss}>
              关闭
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
