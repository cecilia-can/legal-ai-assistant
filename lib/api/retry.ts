/**
 * 对刚创建资源的请求进行有限重试。
 *
 * 仅重试 404：调用方已在同一用户会话中确认资源存在时，短暂的读写可见性
 * 延迟不应导致一次可安全重放的写入永久失败。
 */
export async function retryTransientNotFound<T>(
  operation: () => Promise<T>,
  shouldRetry: (result: T) => boolean,
  options: { retries?: number; delayMs?: number } = {},
): Promise<T> {
  const retries = options.retries ?? 2;
  const delayMs = options.delayMs ?? 200;

  let result = await operation();
  for (let attempt = 0; attempt < retries && shouldRetry(result); attempt += 1) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, delayMs * (attempt + 1));
    });
    result = await operation();
  }

  return result;
}