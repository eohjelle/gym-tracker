import { getDatabase } from '../database';
import { WorkoutRow, WorkoutSetRow } from '../types';

export async function createWorkout(params: {
  programName?: string;
  week?: number;
  day?: string;
  type: 'program' | 'free';
  programWorkoutId?: number;
}): Promise<WorkoutRow> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO workouts (start_time, program_name, week, day, type, status, program_workout_id)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    [now, params.programName ?? null, params.week ?? null, params.day ?? null, params.type, params.programWorkoutId ?? null]
  );
  return {
    id: result.lastInsertRowId,
    start_time: now,
    end_time: null,
    program_name: params.programName ?? null,
    week: params.week ?? null,
    day: params.day ?? null,
    type: params.type,
    status: 'active',
    program_workout_id: params.programWorkoutId ?? null,
  };
}

export async function finishWorkout(workoutId: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    'UPDATE workouts SET end_time = ?, status = ? WHERE id = ?',
    [new Date().toISOString(), 'completed', workoutId]
  );
}

export async function getActiveWorkout(): Promise<WorkoutRow | null> {
  const db = getDatabase();
  return db.getFirstAsync<WorkoutRow>(
    "SELECT * FROM workouts WHERE status = 'active' LIMIT 1"
  );
}

export async function getRecentWorkouts(limit: number = 7): Promise<WorkoutRow[]> {
  const db = getDatabase();
  return db.getAllAsync<WorkoutRow>(
    "SELECT * FROM workouts WHERE status = 'completed' ORDER BY start_time DESC LIMIT ?",
    [limit]
  );
}

export interface WorkoutWithSets extends WorkoutRow {
  sets: WorkoutSetRow[];
}

export async function getWorkoutWithSets(workoutId: number): Promise<WorkoutWithSets | null> {
  const db = getDatabase();
  const workout = await db.getFirstAsync<WorkoutRow>(
    'SELECT * FROM workouts WHERE id = ?',
    [workoutId]
  );
  if (!workout) return null;

  const sets = await db.getAllAsync<WorkoutSetRow>(
    'SELECT * FROM workout_sets WHERE workout_id = ? ORDER BY id',
    [workoutId]
  );

  return { ...workout, sets };
}

export async function getLastCompletedProgramWorkout(): Promise<WorkoutRow | null> {
  const db = getDatabase();
  return db.getFirstAsync<WorkoutRow>(
    "SELECT * FROM workouts WHERE status = 'completed' AND type = 'program' ORDER BY start_time DESC LIMIT 1"
  );
}

export async function updateWorkoutDate(
  workoutId: number,
  startTime: string,
  endTime: string | null
): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    'UPDATE workouts SET start_time = ?, end_time = ? WHERE id = ?',
    [startTime, endTime, workoutId]
  );
}

export async function deleteWorkout(workoutId: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM workout_sets WHERE workout_id = ?', [workoutId]);
  await db.runAsync('DELETE FROM workouts WHERE id = ?', [workoutId]);
}

export async function getWorkoutExerciseSummary(workoutId: number): Promise<{
  exerciseCount: number;
  setCount: number;
}> {
  const db = getDatabase();
  const result = await db.getFirstAsync<{ exercise_count: number; set_count: number }>(
    `SELECT COUNT(DISTINCT exercise_name) as exercise_count, COUNT(*) as set_count
     FROM workout_sets WHERE workout_id = ? AND completed_at IS NOT NULL`,
    [workoutId]
  );
  return {
    exerciseCount: result?.exercise_count ?? 0,
    setCount: result?.set_count ?? 0,
  };
}
