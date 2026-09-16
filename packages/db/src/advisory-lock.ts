import { Client } from "pg";

export type AdvisoryLockResult<T> =
  | { acquired: true; value: T }
  | { acquired: false };

type AdvisoryLockClient = Pick<Client, "connect" | "query" | "end">;

export async function withPostgresAdvisoryLock<T>(
  lockKey: string,
  callback: () => Promise<T>,
  options: {
    connectionString?: string;
    createClient?: (connectionString: string) => AdvisoryLockClient;
  } = {},
): Promise<AdvisoryLockResult<T>> {
  const connectionString =
    options.connectionString ??
    process.env.DIRECT_URL ??
    process.env.DATABASE_URL;
  if (!connectionString || process.env.NODE_ENV === "test") {
    return { acquired: true, value: await callback() };
  }

  const client = options.createClient
    ? options.createClient(connectionString)
    : new Client({ connectionString, application_name: "second-brain-lock" });
  let acquired = false;

  try {
    await client.connect();
    const result = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1::text, 0)) AS acquired",
      [lockKey],
    );
    acquired = result.rows[0]?.acquired === true;
    if (!acquired) return { acquired: false };
    return { acquired: true, value: await callback() };
  } finally {
    if (acquired) {
      await client
        .query("SELECT pg_advisory_unlock(hashtextextended($1::text, 0))", [
          lockKey,
        ])
        .catch(() => undefined);
    }
    await client.end().catch(() => undefined);
  }
}
