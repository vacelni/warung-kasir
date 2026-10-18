import type { Supabase } from '@/lib/supabase';

type FakeError = { code?: string; message: string };
export type FakeResult = { data: unknown; error: FakeError | null };

/** One query: the table and every builder call made on it, in order, e.g. ['update', {...}], ['eq', 'id', 'x']. */
export type RecordedQuery = { table: string; steps: Array<[string, ...unknown[]]> };

/**
 * Stands in for the Supabase client in unit tests. Each `from(table)` returns a chainable,
 * awaitable builder that records its calls and resolves to `result(table, steps)`. Tests then
 * assert which columns and filters the code sent, without a network or a database.
 */
export function fakeSupabase(result: (query: RecordedQuery) => FakeResult) {
  const queries: RecordedQuery[] = [];

  function chain(query: RecordedQuery) {
    queries.push(query);
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'order', 'gte', 'lt', 'ilike', 'or', 'limit', 'range', 'retry', 'single', 'maybeSingle', 'abortSignal']) {
      builder[method] = (...args: unknown[]) => {
        query.steps.push([method, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (value: FakeResult) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result(query)).then(resolve, reject);
    return builder;
  }

  const client = {
    from: (table: string) => chain({ table, steps: [] }),
    /** A database function call is recorded as table `rpc:<name>` whose first step is ['rpc', args]. */
    rpc: (name: string, args: unknown) => chain({ table: `rpc:${name}`, steps: [['rpc', args]] }),
    /** An Edge Function call is recorded as table `fn:<name>` whose first step is ['invoke', body]. */
    functions: {
      invoke: (name: string, options?: { body?: unknown }) =>
        chain({ table: `fn:${name}`, steps: [['invoke', options?.body]] }),
    },
  };

  return { supabase: client as unknown as Supabase, queries };
}
