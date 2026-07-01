import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfigService } from '@weevil/config';
import { PrismaClient } from '@weevil/prisma-client';

/**
 * Driver-level SQL logging.
 *
 * With `@prisma/adapter-pg`, queries are executed by a JS driver — they bypass
 * the Rust query engine, which is where Prisma's built-in `log: 'query'` events
 * fire. The official way to see SQL with a driver adapter is to wrap the
 * adapter and intercept its `queryRaw` / `executeRaw` calls.
 *
 * Enable via env (set in `apps/backend/.env`):
 *   PRISMA_LOG=true            → query + warn + error
 *   PRISMA_LOG=query           → just SQL
 *   PRISMA_LOG=verbose         → query + info + warn + error
 *   PRISMA_LOG=off / unset     → silent (default)
 */
function isLoggingEnabled(): boolean {
  const raw = (process.env.PRISMA_LOG ?? '').toLowerCase().trim();
  if (!raw || raw === 'off' || raw === 'false' || raw === '0') return false;
  return ['true', '1', 'on', 'query', 'verbose', 'all'].includes(raw) || raw.includes('query');
}

const logger = new Logger('Prisma');

/**
 * Wrap PrismaPg so every queryRaw / executeRaw call is logged. The factory
 * pattern (`SqlDriverAdapterFactory`) returns a *connection* per request;
 * we intercept methods on that connection.
 */
function createLoggingAdapter(connectionString: string) {
  const inner = new PrismaPg({ connectionString }) as unknown as {
    connect: () => Promise<Record<string, unknown>>;
  };

  if (!isLoggingEnabled()) return inner as unknown as PrismaPg;

  const wrappedConnect = inner.connect.bind(inner);
  inner.connect = async () => {
    const adapter = (await wrappedConnect()) as Record<string, unknown> & {
      queryRaw?: (query: { sql: string; args?: unknown[] }) => Promise<unknown>;
      executeRaw?: (query: { sql: string; args?: unknown[] }) => Promise<unknown>;
      startTransaction?: (...args: unknown[]) => Promise<unknown>;
    };

    function wrap(name: 'queryRaw' | 'executeRaw') {
      const original = adapter[name];
      if (typeof original !== 'function') return;
      adapter[name] = async (query: { sql: string; args?: unknown[] }) => {
        const start = performance.now();
        try {
          const result = await original.call(adapter, query);
          const ms = (performance.now() - start).toFixed(1);
          logger.debug(
            `(${ms}ms) ${query.sql}${query.args?.length ? ` ${JSON.stringify(query.args)}` : ''}`,
          );
          return result;
        } catch (error) {
          const ms = (performance.now() - start).toFixed(1);
          logger.error(
            `(${ms}ms FAILED) ${query.sql}\n  args=${JSON.stringify(query.args ?? [])}\n  err=${(error as Error).message}`,
          );
          throw error;
        }
      };
    }

    wrap('queryRaw');
    wrap('executeRaw');

    // Transactions hand out a fresh adapter; wrap that one too.
    const originalTx = adapter.startTransaction;
    if (typeof originalTx === 'function') {
      adapter.startTransaction = async (...args: unknown[]) => {
        const tx = (await originalTx.apply(adapter, args)) as Record<string, unknown> & {
          queryRaw?: typeof adapter.queryRaw;
          executeRaw?: typeof adapter.executeRaw;
        };
        if (typeof tx.queryRaw === 'function') {
          const txQuery = tx.queryRaw;
          tx.queryRaw = async (query: { sql: string; args?: unknown[] }) => {
            const start = performance.now();
            const result = await txQuery.call(tx, query);
            const ms = (performance.now() - start).toFixed(1);
            logger.debug(
              `[tx] (${ms}ms) ${query.sql}${query.args?.length ? ` ${JSON.stringify(query.args)}` : ''}`,
            );
            return result;
          };
        }
        if (typeof tx.executeRaw === 'function') {
          const txExec = tx.executeRaw;
          tx.executeRaw = async (query: { sql: string; args?: unknown[] }) => {
            const start = performance.now();
            const result = await txExec.call(tx, query);
            const ms = (performance.now() - start).toFixed(1);
            logger.debug(
              `[tx] (${ms}ms) ${query.sql}${query.args?.length ? ` ${JSON.stringify(query.args)}` : ''}`,
            );
            return result;
          };
        }
        return tx;
      };
    }

    return adapter;
  };

  return inner as unknown as PrismaPg;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: AppConfigService) {
    super({
      adapter: createLoggingAdapter(config.databaseUrl),
    });

    if (isLoggingEnabled()) {
      logger.log('SQL logging enabled (PRISMA_LOG). Restart with PRISMA_LOG=off to silence.');
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
