import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

const animationFrameTimers = new Set<number>();

class ResizeObserverMock {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback(
      [
        {
          target,
          borderBoxSize: [
            {
              inlineSize: 800,
              blockSize: 600,
            },
          ],
          contentRect: {
            x: 0,
            y: 0,
            width: 800,
            height: 600,
            top: 0,
            right: 800,
            bottom: 600,
            left: 0,
            toJSON: () => ({}),
          },
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }

  unobserve() {}

  disconnect() {}
}

Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  get: () => 800,
});

Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get: () => 600,
});

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: ResizeObserverMock,
});

Object.defineProperty(globalThis, "ResizeObserver", {
  writable: true,
  value: ResizeObserverMock,
});

Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  writable: true,
  value: vi.fn(),
});

Object.defineProperty(window, "requestAnimationFrame", {
  writable: true,
  value: (callback: FrameRequestCallback) => {
    const id = window.setTimeout(() => {
      animationFrameTimers.delete(id);
      callback(performance.now());
    }, 0);
    animationFrameTimers.add(id);
    return id;
  },
});

Object.defineProperty(window, "cancelAnimationFrame", {
  writable: true,
  value: (id: number) => {
    animationFrameTimers.delete(id);
    window.clearTimeout(id);
  },
});

afterEach(() => {
  for (const id of animationFrameTimers) {
    window.clearTimeout(id);
  }
  animationFrameTimers.clear();
});
