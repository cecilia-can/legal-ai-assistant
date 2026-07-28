export function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) {
    return 0;
  }

  const index = Math.ceil((p / 100) * sortedMs.length) - 1;
  return sortedMs[Math.max(0, Math.min(sortedMs.length - 1, index))];
}

export function summarizeMs(samples: number[]) {
  if (samples.length === 0) {
    return { count: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, meanMs: 0 };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);

  return {
    count: sorted.length,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    maxMs: sorted[sorted.length - 1] ?? 0,
    meanMs: sum / sorted.length,
  };
}

export function formatMs(value: number): string {
  return value.toFixed(2);
}
