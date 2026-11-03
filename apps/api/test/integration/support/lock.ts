import pg from 'pg';

/**
 * Runs `lock` in an open transaction, starts `contender`, and commits only once a statement
 * matching `waiter` (a LIKE pattern) waits on that transaction's lock; then returns the
 * contender's result. Throws when no such waiter appears, so a race test cannot pass without
 * exercising the blocked statement. Use it in every race test that holds a row lock.
 */
export async function whileRowLocked<T>(
  uri: string,
  lock: (holder: pg.Client) => Promise<unknown>,
  contender: () => PromiseLike<T>,
  waiter: string,
): Promise<T> {
  const holder = new pg.Client({ connectionString: uri });
  // A separate session: pg_stat_activity is a per-transaction snapshot inside the holder's.
  const observer = new pg.Client({ connectionString: uri });
  await Promise.all([holder.connect(), observer.connect()]);
  try {
    const { rows } = await holder.query<{ pid: number }>(
      'SELECT pg_backend_pid() AS pid',
    );
    await holder.query('BEGIN');
    await lock(holder);
    const pending = Promise.resolve(contender());
    pending.catch(() => undefined); // awaited below; no unhandled rejection while polling
    for (let i = 0; i < 100; i++) {
      const { rowCount } = await observer.query(
        `SELECT 1 FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query LIKE $1 AND $2 = ANY(pg_blocking_pids(pid))`,
        [waiter, rows[0]?.pid],
      );
      if (rowCount) {
        await holder.query('COMMIT');
        return await pending;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    await holder.query('ROLLBACK');
    await pending.catch(() => undefined);
    throw new Error(
      `no statement LIKE '${waiter}' waited on the held lock: the race was not exercised`,
    );
  } finally {
    await Promise.all([holder.end(), observer.end()]);
  }
}
