import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { AppConfigService } from '@weevil/config';
import Redis from 'ioredis';

const CACHE_KEY_SEPARATOR = ':';

interface CacheSetOptions {
  ttlSeconds?: number;
}

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(private readonly config: AppConfigService) {
    this.redis = new Redis(this.config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  async getJson<T>(namespace: string, key: string): Promise<T | null> {
    const value = await this.redis.get(this.buildKey(namespace, key));

    if (!value) {
      return null;
    }

    return JSON.parse(value) as T;
  }

  async setJson(
    namespace: string,
    key: string,
    value: Record<string, unknown>,
    options?: CacheSetOptions,
  ): Promise<void> {
    const cacheKey = this.buildKey(namespace, key);
    const serializedValue = JSON.stringify(value);

    if (options?.ttlSeconds) {
      await this.redis.set(cacheKey, serializedValue, 'EX', options.ttlSeconds);
      return;
    }

    await this.redis.set(cacheKey, serializedValue);
  }

  async delete(namespace: string, key: string): Promise<void> {
    await this.redis.del(this.buildKey(namespace, key));
  }

  private buildKey(namespace: string, key: string): string {
    return [namespace, key].join(CACHE_KEY_SEPARATOR);
  }
}
