import { getDatabase } from '../database';
import { WorkoutSetRow } from '../types';

export interface PlannedSet {
  exerciseName: string;
  setNumber: number;
  reps: number;
  weight: number;
  weightUnit: 'kg' | 'lbs';
  groupTag?: string;
  restSeconds?: number;
  isWarmup?: boolean;
  defaultRir?: number;
}

export async function addPlannedSets(
  workoutId: number,
  sets: PlannedSet[]
): Promise<void> {
  const db = getDatabase();
  for (const set of sets) {
    await db.runAsync(
      `INSERT INTO workout_sets (workout_id, exercise_name, set_number, reps, weight, weight_unit, is_extra, group_tag, rest_seconds, is_warmup, estimated_rir)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      [
        workoutId,
        set.exerciseName,
        set.setNumber,
        set.reps,
        set.weight,
        set.weightUnit,
        set.groupTag ?? null,
        set.restSeconds ?? null,
        set.isWarmup ? 1 : 0,
        set.defaultRir ?? null,
      ]
    );
  }
}

export async function completeSet(
  setId: number,
  data: { reps: number; weight: number; weightUnit: 'kg' | 'lbs'; notes?: string; estimatedRir?: number }
): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `UPDATE workout_sets SET reps = ?, weight = ?, weight_unit = ?, notes = ?, completed_at = ?, estimated_rir = ?
     WHERE id = ?`,
    [data.reps, data.weight, data.weightUnit, data.notes ?? null, new Date().toISOString(), data.estimatedRir ?? null, setId]
  );
}

export async function addFreeSet(
  workoutId: number,
  data: {
    exerciseName: string;
    setNumber: number;
    reps: number;
    weight: number;
    weightUnit: 'kg' | 'lbs';
    notes?: string;
  }
): Promise<WorkoutSetRow> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO workout_sets (workout_id, exercise_name, set_number, reps, weight, weight_unit, notes, completed_at, is_extra, group_tag, rest_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL)`,
    [
      workoutId,
      data.exerciseName,
      data.setNumber,
      data.reps,
      data.weight,
      data.weightUnit,
      data.notes ?? null,
      now,
    ]
  );
  return {
    id: result.lastInsertRowId,
    workout_id: workoutId,
    exercise_name: data.exerciseName,
    set_number: data.setNumber,
    reps: data.reps,
    weight: data.weight,
    weight_unit: data.weightUnit,
    notes: data.notes ?? null,
    completed_at: now,
    is_extra: 1,
    group_tag: null,
    rest_seconds: null,
    estimated_rir: null,
    is_warmup: 0,
  };
}

export async function updateSet(
  setId: number,
  data: { reps?: number; weight?: number; notes?: string; estimatedRir?: number | null }
): Promise<void> {
  const db = getDatabase();
  const fields: string[] = [];
  const values: any[] = [];

  if (data.reps !== undefined) { fields.push('reps = ?'); values.push(data.reps); }
  if (data.weight !== undefined) { fields.push('weight = ?'); values.push(data.weight); }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes || null); }
  if (data.estimatedRir !== undefined) { fields.push('estimated_rir = ?'); values.push(data.estimatedRir); }

  if (fields.length === 0) return;
  values.push(setId);
  await db.runAsync(`UPDATE workout_sets SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deleteSet(setId: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM workout_sets WHERE id = ?', [setId]);
}

export async function getSetsForWorkout(workoutId: number): Promise<WorkoutSetRow[]> {
  const db = getDatabase();
  return db.getAllAsync<WorkoutSetRow>(
    'SELECT * FROM workout_sets WHERE workout_id = ? ORDER BY id',
    [workoutId]
  );
}

export async function getExerciseHistory(
  exerciseName: string,
  limit: number = 5
): Promise<{ workout_id: number; sets: WorkoutSetRow[] }[]> {
  const db = getDatabase();
  // Get the last N distinct workouts that included this exercise
  const workoutIds = await db.getAllAsync<{ workout_id: number }>(
    `SELECT DISTINCT ws.workout_id FROM workout_sets ws
     JOIN workouts w ON w.id = ws.workout_id
     WHERE ws.exercise_name = ? AND ws.completed_at IS NOT NULL AND w.status = 'completed'
     ORDER BY w.start_time DESC LIMIT ?`,
    [exerciseName, limit]
  );

  const results: { workout_id: number; sets: WorkoutSetRow[] }[] = [];
  for (const { workout_id } of workoutIds) {
    const sets = await db.getAllAsync<WorkoutSetRow>(
      'SELECT * FROM workout_sets WHERE workout_id = ? AND exercise_name = ? AND completed_at IS NOT NULL ORDER BY set_number',
      [workout_id, exerciseName]
    );
    results.push({ workout_id, sets });
  }
  return results;
}

export async function getAllExerciseNames(): Promise<string[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{ exercise_name: string }>(
    'SELECT DISTINCT exercise_name FROM workout_sets ORDER BY exercise_name'
  );
  return rows.map((r) => r.exercise_name);
}

export async function getNextSetNumber(workoutId: number, exerciseName: string): Promise<number> {
  const db = getDatabase();
  const result = await db.getFirstAsync<{ max_set: number | null }>(
    'SELECT MAX(set_number) as max_set FROM workout_sets WHERE workout_id = ? AND exercise_name = ?',
    [workoutId, exerciseName]
  );
  return (result?.max_set ?? 0) + 1;
}
