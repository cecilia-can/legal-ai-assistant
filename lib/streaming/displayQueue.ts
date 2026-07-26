export type DisplayQueueOptions = {
  /** 每展示 1 个字符的目标间隔（ms） */
  msPerChar?: number;
  /** buffer 超过此长度时开始加速 */
  catchUpThreshold?: number;
};

type IdleCallback = () => void;

/**
 * 展示层打字机队列：网络 token 尽快 enqueue，UI 按固定节奏逐段 reveal。
 * 与网络 burst 解耦，减轻「顿一下蹦一段」观感。
 */
export function createDisplayQueue(
  append: (text: string) => void,
  onIdle?: IdleCallback,
  options: DisplayQueueOptions = {},
) {
  const msPerChar = options.msPerChar ?? 22;
  const catchUpThreshold = options.catchUpThreshold ?? 36;

  let buffer = "";
  let networkDone = false;
  let cancelled = false;
  let rafId: number | null = null;
  let lastTick = 0;
  let accumulatedMs = 0;
  let idleResolve: (() => void) | null = null;

  function resolveIdle() {
    idleResolve?.();
    idleResolve = null;
    onIdle?.();
  }

  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    lastTick = 0;
    accumulatedMs = 0;
  }

  function charsToReveal(): number {
    const len = buffer.length;
    if (len === 0) {
      return 0;
    }

    if (networkDone && len <= 12) {
      return len;
    }

    if (len > catchUpThreshold * 2) {
      return Math.min(len, 4);
    }

    if (len > catchUpThreshold) {
      return Math.min(len, 2);
    }

    return 1;
  }

  function tick(now: number) {
    rafId = null;

    if (cancelled) {
      return;
    }

    if (lastTick === 0) {
      lastTick = now;
    }

    accumulatedMs += now - lastTick;
    lastTick = now;

    while (buffer.length > 0 && accumulatedMs >= msPerChar) {
      const count = charsToReveal();
      if (count <= 0) {
        break;
      }

      const chunk = buffer.slice(0, count);
      buffer = buffer.slice(count);
      append(chunk);
      accumulatedMs -= msPerChar * chunk.length;
    }

    if (buffer.length === 0 && networkDone) {
      stopLoop();
      resolveIdle();
      return;
    }

    rafId = requestAnimationFrame(tick);
  }

  function ensureLoop() {
    if (cancelled || rafId !== null) {
      return;
    }

    rafId = requestAnimationFrame(tick);
  }

  function enqueue(text: string) {
    if (cancelled || !text) {
      return;
    }

    buffer += text;
    ensureLoop();
  }

  function markNetworkDone() {
    networkDone = true;
    ensureLoop();
  }

  /** 立即展示 buffer 中全部剩余文字（错误收尾等场景） */
  function flushSync() {
    stopLoop();

    if (buffer.length > 0) {
      const chunk = buffer;
      buffer = "";
      append(chunk);
    }

    if (!cancelled && networkDone) {
      resolveIdle();
    }
  }

  function cancel() {
    cancelled = true;
    stopLoop();
    buffer = "";
    resolveIdle();
  }

  function waitUntilIdle(): Promise<void> {
    if (cancelled || (buffer.length === 0 && networkDone)) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      idleResolve = resolve;
    });
  }

  return {
    enqueue,
    markNetworkDone,
    flushSync,
    cancel,
    waitUntilIdle,
  };
}
