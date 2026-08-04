type RateLimitBucket = {
  minuteCount: number;
  minuteWindowStart: number;
  dailyTokens: number;
  dailyWindowStart: number;
};

const buckets = new Map<string, RateLimitBucket>();

function getNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getChatRateLimits() {
  return {
    requestsPerMinute: getNumberEnv("CHAT_RATE_LIMIT_PER_MINUTE", 10),
    tokensPerDay: getNumberEnv("CHAT_RATE_LIMIT_TOKENS_PER_DAY", 50000),
  };
}

function getBucket(userId: string): RateLimitBucket {
  const existing = buckets.get(userId);
  if (existing) {
    return existing;
  }

  const now = Date.now();
  const bucket: RateLimitBucket = {
    minuteCount: 0,
    minuteWindowStart: now,
    dailyTokens: 0,
    dailyWindowStart: now,
  };
  buckets.set(userId, bucket);
  return bucket;
}

function resetWindows(bucket: RateLimitBucket, now: number) {
  if (now - bucket.minuteWindowStart >= 60_000) {
    bucket.minuteCount = 0;
    bucket.minuteWindowStart = now;
  }

  if (now - bucket.dailyWindowStart >= 86_400_000) {
    bucket.dailyTokens = 0;
    bucket.dailyWindowStart = now;
  }
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: "requests" | "tokens"; retryAfterSeconds?: number };

export function checkChatRateLimit(userId: string): RateLimitResult {
  const limits = getChatRateLimits();
  const bucket = getBucket(userId);
  const now = Date.now();
  resetWindows(bucket, now);

  if (bucket.minuteCount >= limits.requestsPerMinute) {
    const retryAfterSeconds = Math.ceil(
      (bucket.minuteWindowStart + 60_000 - now) / 1000,
    );
    return { allowed: false, reason: "requests", retryAfterSeconds };
  }

  bucket.minuteCount += 1;
  return { allowed: true };
}

export function recordChatTokenUsage(
  userId: string,
  estimatedTokens: number,
): RateLimitResult {
  const limits = getChatRateLimits();
  const bucket = getBucket(userId);
  const now = Date.now();
  resetWindows(bucket, now);

  if (bucket.dailyTokens + estimatedTokens > limits.tokensPerDay) {
    return { allowed: false, reason: "tokens" };
  }

  bucket.dailyTokens += estimatedTokens;
  return { allowed: true };
}
