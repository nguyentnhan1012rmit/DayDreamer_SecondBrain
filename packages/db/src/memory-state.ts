export type MemoryStateDatabase = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  $queryRawUnsafe: (
    query: string,
    ...values: unknown[]
  ) => Promise<Array<Record<string, unknown>>>;
};

export type MemorySourceChange = {
  userId: string;
  occurredFrom?: Date | null;
  occurredTo?: Date | null;
};

export async function markMemorySourcesChanged(
  db: MemoryStateDatabase,
  input: MemorySourceChange,
): Promise<bigint> {
  const revision = await bumpUserMemoryRevision(db, input.userId);
  const from = input.occurredFrom ?? input.occurredTo ?? null;
  const to = input.occurredTo ?? input.occurredFrom ?? null;

  await db.$executeRawUnsafe(
    `WITH marked AS (
       UPDATE summaries
       SET dirty = TRUE, updated_at = now()
       WHERE user_id = $1::text
         AND ($2::timestamptz IS NULL OR period_end >= $2)
         AND ($3::timestamptz IS NULL OR period_start <= $3)
       RETURNING id
     )
     DELETE FROM memory_chunks
     WHERE user_id = $1::text
       AND source_type = 'summary'
       AND source_id IN (SELECT id FROM marked)`,
    input.userId,
    from,
    to,
  );
  await expireUserSearchHistory(db, input.userId);
  return revision;
}

export async function markDependentSummariesDirty(
  db: MemoryStateDatabase,
  input: {
    userId: string;
    summaryType: string;
    periodStart: Date;
    periodEnd: Date;
  },
): Promise<void> {
  const rank = summaryRank(input.summaryType);
  await db.$executeRawUnsafe(
    `WITH marked AS (
       UPDATE summaries
       SET dirty = TRUE, updated_at = now()
       WHERE user_id = $1::text
         AND CASE summary_type
               WHEN 'daily' THEN 1 WHEN 'weekly' THEN 2
               WHEN 'monthly' THEN 3 WHEN 'yearly' THEN 4 ELSE 0
             END > $2
         AND period_end >= $3
         AND period_start <= $4
       RETURNING id
     )
     DELETE FROM memory_chunks
     WHERE user_id = $1::text
       AND source_type = 'summary'
       AND source_id IN (SELECT id FROM marked)`,
    input.userId,
    rank,
    input.periodStart,
    input.periodEnd,
  );
}

export async function bumpUserMemoryRevision(
  db: MemoryStateDatabase,
  userId: string,
): Promise<bigint> {
  const rows = await db.$queryRawUnsafe(
    `UPDATE users
     SET memory_revision = memory_revision + 1, updated_at = now()
     WHERE id = $1::text
     RETURNING memory_revision`,
    userId,
  );
  const value = rows[0]?.memory_revision;
  if (typeof value === "bigint") return value;
  if (typeof value === "number" || typeof value === "string") {
    return BigInt(value);
  }
  throw new Error(`User ${userId} was not found while updating memory revision.`);
}

export async function getUserMemoryRevision(
  db: MemoryStateDatabase,
  userId: string,
): Promise<bigint> {
  const rows = await db.$queryRawUnsafe(
    `SELECT memory_revision FROM users WHERE id = $1::text`,
    userId,
  );
  const value = rows[0]?.memory_revision;
  if (typeof value === "bigint") return value;
  if (typeof value === "number" || typeof value === "string") {
    return BigInt(value);
  }
  throw new Error(`User ${userId} was not found while reading memory revision.`);
}

export async function expireUserSearchHistory(
  db: MemoryStateDatabase,
  userId: string,
): Promise<void> {
  await db.$executeRawUnsafe(
    `UPDATE search_history
     SET expires_at = now()
     WHERE user_id = $1::text AND expires_at > now()`,
    userId,
  );
}

function summaryRank(type: string) {
  return ({ daily: 1, weekly: 2, monthly: 3, yearly: 4 } as Record<string, number>)[type] ?? 0;
}
