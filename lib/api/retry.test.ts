import { describe, expect, it, vi } from "vitest";
import { retryTransientNotFound } from "@/lib/api/retry";

describe("retryTransientNotFound", () => {
  it("retries a transient not-found result and returns the successful retry", async () => {
    const operation = vi
      .fn<() => Promise<{ status: number }>>()
      .mockResolvedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ status: 201 });

    const resultPromise = retryTransientNotFound(
      operation,
      (result) => result.status === 404,
      { delayMs: 0 },
    );

    await expect(resultPromise).resolves.toEqual({ status: 201 });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry failures other than not-found", async () => {
    const operation = vi
      .fn<() => Promise<{ status: number }>>()
      .mockResolvedValue({ status: 500 });

    await expect(
      retryTransientNotFound(operation, (result) => result.status === 404),
    ).resolves.toEqual({ status: 500 });
    expect(operation).toHaveBeenCalledOnce();
  });
});