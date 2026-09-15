export interface RateLimitRedisClient {
  ping(): Promise<string>;
  quit(): Promise<unknown>;
}

/** Creates an ioredis client lazily so local/test can run without Redis. */
export async function createRateLimitRedisClient(
  redisUrl: string,
  authToken?: string,
): Promise<RateLimitRedisClient> {
  const { Redis } = await import("ioredis");
  return new Redis(redisUrl, {
    ...(authToken ? { password: authToken } : {}),
    enableOfflineQueue: false,
    connectTimeout: 5_000,
    maxRetriesPerRequest: 1,
    lazyConnect: false,
  });
}
