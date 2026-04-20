import { getDatabase } from '../db/database';
import { WorkoutRow, WorkoutSetRow, PersonalRecordRow } from '../db/types';

interface SupabaseConfig {
  url: string;
  apiKey: string;
}

interface SyncQueueEntry {
  id: number;
  table_name: string;
  operation: string;
  row_id: number;
  created_at: string;
}

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

async function supabaseDelete(config: SupabaseConfig, table: string, column: string, value: number): Promise<void> {
  const response = await fetch(`${config.url}/rest/v1/${table}?${column}=eq.${value}`, {
    method: 'DELETE',
    headers: headers(config),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase delete from ${table} failed (${response.status}): ${body}`);
  }
}

/**
 * Process the sync queue — push local changes to Supabase.
 * Called automatically after workout completion.
 */
export async function syncAll(): Promise<{ synced: number }> {
  const config = await getSupabaseConfig();
  if (!config) throw new Error('Supabase not configured');

  const db = getDatabase();
  const queue = await db.getAllAsync<SyncQueueEntry>(
    'SELECT * FROM sync_queue ORDER BY id'
  );

  if (queue.length === 0) return { synced: 0 };

  // Deduplicate: for each (table, row_id), keep only the last operation.
  // If any operation is DELETE, the final result is DELETE regardless of earlier inserts/updates.
  const lastOp = new Map<string, SyncQueueEntry>();
  for (const entry of queue) {
    const key = `${entry.table_name}:${entry.row_id}`;
    lastOp.set(key, entry);
  }

  // Group by operation type
  const upserts = new Map<string, number[]>(); // table -> row_ids
  const deletes = new Map<string, number[]>(); // table -> row_ids

  for (const entry of lastOp.values()) {
    if (entry.operation === 'DELETE') {
      const ids = deletes.get(entry.table_name) ?? [];
      ids.push(entry.row_id);
      deletes.set(entry.table_name, ids);
    } else {
      const ids = upserts.get(entry.table_name) ?? [];
      ids.push(entry.row_id);
      upserts.set(entry.table_name, ids);
    }
  }

  // Process deletes (cascade children before deleting parent)
  // For workout deletes, explicitly delete children by foreign key first
  const workoutDeletes = deletes.get('workouts') ?? [];
  for (const id of workoutDeletes) {
    await supabaseDelete(config, 'personal_records', 'workout_id', id);
    await supabaseDelete(config, 'workout_sets', 'workout_id', id);
    await supabaseDelete(config, 'workouts', 'id', id);
  }
  // Handle standalone child deletes (not part of a workout delete)
  for (const id of deletes.get('personal_records') ?? []) {
    await supabaseDelete(config, 'personal_records', 'id', id);
  }
  for (const id of deletes.get('workout_sets') ?? []) {
    await supabaseDelete(config, 'workout_sets', 'id', id);
  }

  // Process upserts (parent tables first for foreign keys)
  const upsertOrder = ['workouts', 'workout_sets', 'personal_records'];
  for (const table of upsertOrder) {
    const ids = upserts.get(table);
    if (!ids) continue;
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.getAllAsync<WorkoutRow | WorkoutSetRow | PersonalRecordRow>(
      `SELECT * FROM ${table} WHERE id IN (${placeholders})`,
      ids
    );
    await supabaseUpsert(config, table, rows);
  }

  // Clear processed queue entries
  const maxId = queue[queue.length - 1].id;
  await db.runAsync('DELETE FROM sync_queue WHERE id <= ?', [maxId]);

  return { synced: lastOp.size };
}

/**
 * Pull all data from Supabase into the local database.
 * Use this to restore from cloud backup.
 */
export async function restoreFromCloud(): Promise<{ workouts: number }> {
  const config = await getSupabaseConfig();
  if (!config) throw new Error('Supabase not configured');

  const db = getDatabase();

  // Fetch all remote data
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
  const remotePRs = await fetchTable<PersonalRecordRow>('personal_records');

  // Disable sync triggers during restore by clearing the queue after
  // Insert remote data with upsert (INSERT OR REPLACE)
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

  for (const p of remotePRs) {
    await db.runAsync(
      `INSERT OR REPLACE INTO personal_records (id, exercise_name, record_type, value, reps, workout_id, achieved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [p.id, p.exercise_name, p.record_type, p.value, p.reps, p.workout_id, p.achieved_at]
    );
  }

  // Clear queue entries generated by the restore inserts
  await db.runAsync('DELETE FROM sync_queue');

  return { workouts: remoteWorkouts.length };
}
