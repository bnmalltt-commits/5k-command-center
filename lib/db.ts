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
    // We're on Supabase's session pooler, which hands out a real dedicated
    // backend per connection and caps the whole project at a small fixed
    // total (pool_size: 15 on this tier) — unlike the transaction pooler,
    // there's no multiplexing headroom here. `max: 5` per lambda instance
    // hit "max clients reached in session mode" with just 2-3 concurrent
    // instances. One connection per instance, held only while actually in
    // use (idle_timeout releases it quickly), is the only footprint that
    // stays safely under the cap as multiple serverless instances warm up.
    global.__pgSql = postgres(process.env.DATABASE_URL, {
      prepare: false,
      ssl: "require",
      max: 1,
      idle_timeout: 10,
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

// A client-side "give up and move on" timeout was tried here and made
// things worse: it abandons the in-flight query without canceling it on the
// server, so the connection sits around as a zombie (still "active", never
// read) instead of being returned to the pool — which starves the *next*
// request. The real fix is a server-enforced `statement_timeout` on the
// database role (set once via `ALTER ROLE ... SET statement_timeout`), which
// cancels a genuinely stuck query on the Postgres side and cleanly releases
// the connection back to the pool.
function bound(client: Client, text: string, params: unknown[]) {
  const exec = () => client.unsafe(toPositional(text), params as any[]);
  return {
    _text: text,
    _params: params,
    async first<T = Row>(): Promise<T | null> {
      const rows = await exec();
      return (rows[0] as T) ?? null;
    },
    async all<T = Row>(): Promise<{ results: T[] }> {
      const rows = await exec();
      return { results: rows as unknown as T[] };
    },
    async run(): Promise<{ meta: { changes: number; last_row_id: number | null } }> {
      const rows = await exec();
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
