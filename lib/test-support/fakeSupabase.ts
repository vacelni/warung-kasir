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

  const client = {
    from(table: string) {
      const query: RecordedQuery = { table, steps: [] };
      queries.push(query);
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order']) {
        builder[method] = (...args: unknown[]) => {
          query.steps.push([method, ...args]);
          return builder;
        };
      }
      builder.then = (resolve: (value: FakeResult) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result(query)).then(resolve, reject);
      return builder;
    },
  };

  return { supabase: client as unknown as Supabase, queries };
}
