import { getDatabase, WebDatabase } from '../db/database';
import { WorkoutRow, WorkoutSetRow } from '../db/types';

interface SupabaseConfig {
  url: string;
  apiKey: string;
}

interface SyncQueueEntry {
  id: number;
  table_name: string;
  operation: 'upsert' | 'delete';
  row_id: number;
  snapshot: string | null;
  created_at: string;
}

const UPSERT_BATCH_SIZE = 50;

export async function getSupabaseConfig(): Promise<SupabaseConfig | null> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM settings WHERE key IN ('supabaseUrl', 'supabaseApiKey')"
  );
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const url = map.get('supabaseUrl');
  const apiKey = map.get('supabaseApiKey');
  if (!url || !apiKey) return null;
  return { url, apiKey };
}

export async function saveSupabaseConfig(url: string, apiKey: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['supabaseUrl', url]);
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['supabaseApiKey', apiKey]);
}

function headers(config: SupabaseConfig, extra?: Record<string, string>): Record<string, string> {
  return {
    'apikey': config.apiKey,
    'Authorization': `Bearer ${config.apiKey}`,
    ...extra,
  };
}

async function supabaseUpsert(config: SupabaseConfig, table: string, rows: object[]): Promise<void> {
  if (rows.length === 0) return;
  const response = await fetch(`${config.url}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(config, {
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    }),
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase upsert to ${table} failed (${response.status}): ${body}`);
  }
}

async function supabaseDeleteById(config: SupabaseConfig, table: string, id: number): Promise<void> {
  const response = await fetch(`${config.url}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE',
    headers: headers(config),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase delete from ${table} failed (${response.status}): ${body}`);
  }
}

async function deleteQueueEntries(db: WebDatabase, entryIds: number[]): Promise<void> {
  if (entryIds.length === 0) return;
  const placeholders = entryIds.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM sync_queue WHERE id IN (${placeholders})`, entryIds);
}

/**
 * Replay local writes to Supabase in the order they happened.
 * Consecutive upserts to the same table are batched; deletes run one-at-a-time.
 * A successful entry is removed from the queue individually so partial progress persists
 * across retries if a later entry fails.
 */
export async function syncAll(): Promise<{ synced: number }> {
  const config = await getSupabaseConfig();
  if (!config) throw new Error('Supabase not configured');

  const db = getDatabase();
  let processed = 0;

  while (true) {
    const entries = await db.getAllAsync<SyncQueueEntry>(
      'SELECT * FROM sync_queue ORDER BY id LIMIT 500'
    );
    if (entries.length === 0) break;

    let i = 0;
    while (i < entries.length) {
      const head = entries[i];
      if (head.operation === 'upsert') {
        const table = head.table_name;
        const entryIds: number[] = [];
        const rows: object[] = [];
        // Postgres rejects ON CONFLICT batches with a repeated conflict target,
        // so a duplicate row_id ends the current batch — the next entry starts a new one.
        const seenRowIds = new Set<number>();
        while (
          i < entries.length &&
          entries[i].operation === 'upsert' &&
          entries[i].table_name === table &&
          entryIds.length < UPSERT_BATCH_SIZE &&
          !seenRowIds.has(entries[i].row_id)
        ) {
          const e = entries[i];
          if (!e.snapshot) {
            throw new Error(`sync_queue entry ${e.id} is upsert but has no snapshot`);
          }
          entryIds.push(e.id);
          rows.push(JSON.parse(e.snapshot));
          seenRowIds.add(e.row_id);
          i++;
        }
        await supabaseUpsert(config, table, rows);
        await deleteQueueEntries(db, entryIds);
        processed += entryIds.length;
      } else {
        await supabaseDeleteById(config, head.table_name, head.row_id);
        await deleteQueueEntries(db, [head.id]);
        processed++;
        i++;
      }
    }
  }

  return { synced: processed };
}

/**
 * Pull all data from Supabase into the local database.
 * Use this to restore from cloud backup.
 */
export async function restoreFromCloud(): Promise<{ workouts: number }> {
  const config = await getSupabaseConfig();
  if (!config) throw new Error('Supabase not configured');

  const db = getDatabase();

  const fetchTable = async <T>(table: string): Promise<T[]> => {
    const response = await fetch(`${config.url}/rest/v1/${table}?select=*`, {
      headers: headers(config),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase fetch ${table} failed (${response.status}): ${body}`);
    }
    return response.json();
  };

  const remoteWorkouts = await fetchTable<WorkoutRow>('workouts');
  const remoteSets = await fetchTable<WorkoutSetRow>('workout_sets');

  for (const w of remoteWorkouts) {
    await db.runAsync(
      `INSERT OR REPLACE INTO workouts (id, start_time, end_time, program_name, week, day, type, status, program_workout_id, is_deload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [w.id, w.start_time, w.end_time, w.program_name, w.week, w.day, w.type, w.status, w.program_workout_id, w.is_deload]
    );
  }

  for (const s of remoteSets) {
    await db.runAsync(
      `INSERT OR REPLACE INTO workout_sets (id, workout_id, exercise_name, set_number, reps, weight, weight_unit, notes, completed_at, is_extra, group_tag, rest_seconds, estimated_rir, is_warmup)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.workout_id, s.exercise_name, s.set_number, s.reps, s.weight, s.weight_unit, s.notes, s.completed_at, s.is_extra, s.group_tag, s.rest_seconds, s.estimated_rir, s.is_warmup]
    );
  }

  // The INSERT OR REPLACE above fires triggers that enqueue sync entries.
  // Those are redundant — we just pulled this state from Supabase — so clear the queue.
  await db.runAsync('DELETE FROM sync_queue');

  return { workouts: remoteWorkouts.length };
}
