import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __pgSql: ReturnType<typeof postgres> | undefined;
}

// Lazily created so a missing DATABASE_URL doesn't break `next build`
// (which loads route modules to collect page data) — it only throws once a
// request actually needs the database.
function getSql() {
  if (!global.__pgSql) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    // We're on Supabase's transaction pooler (pgbouncer), which hands out a
    // small, fixed number of backend connections. postgres.js defaults to
    // opening up to 10 connections per client — with several serverless
    // instances doing that at once, the pooler's slots run out and new
    // connections queue for tens of seconds (the exact "loading forever"
    // symptom this was fixed for). One connection per lambda instance,
    // reused across invocations via the global above, is the standard
    // serverless + pgbouncer pattern. The timeouts make a starved pool fail
    // fast with a clear error instead of hanging the request.
    global.__pgSql = postgres(process.env.DATABASE_URL, {
      prepare: false,
      ssl: "require",
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return global.__pgSql;
}

// Mimics the Cloudflare D1 prepare/bind/first/all/run/batch shape so the
// route code (originally written against `env.DB`) needs minimal changes.
// `?` placeholders are translated to Postgres `$1..$n` positional params.
// INSERTs whose result reads `.meta.last_row_id` must add `RETURNING id`
// to their SQL text (D1 returns it automatically; Postgres does not).
type Row = Record<string, any>;
type Client = ReturnType<typeof postgres>;

function toPositional(text: string) {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
}

function bound(client: Client, text: string, params: unknown[]) {
  return {
    _text: text,
    _params: params,
    async first<T = Row>(): Promise<T | null> {
      const rows = await client.unsafe(toPositional(text), params as any[]);
      return (rows[0] as T) ?? null;
    },
    async all<T = Row>(): Promise<{ results: T[] }> {
      const rows = await client.unsafe(toPositional(text), params as any[]);
      return { results: rows as unknown as T[] };
    },
    async run(): Promise<{ meta: { changes: number; last_row_id: number | null } }> {
      const rows = await client.unsafe(toPositional(text), params as any[]);
      return {
        meta: { changes: rows.count ?? rows.length, last_row_id: (rows[0] as any)?.id ?? null },
      };
    },
  };
}

type BoundStatement = ReturnType<typeof bound>;

function prepare(client: Client, text: string) {
  return { bind: (...params: unknown[]) => bound(client, text, params) };
}

export const db = {
  prepare: (text: string) => prepare(getSql(), text),
  // Accepts statements built with db.prepare(sql).bind(...params), same as
  // the call sites already write for D1, and runs them in one transaction.
  async batch(statements: BoundStatement[]) {
    return getSql().begin(async (tx) => {
      const results = [];
      for (const s of statements) {
        results.push(await bound(tx as unknown as Client, s._text, s._params).run());
      }
      return results;
    });
  },
};
