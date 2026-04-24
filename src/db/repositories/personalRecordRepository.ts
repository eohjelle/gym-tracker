import { getDatabase } from '../database';

export interface PR {
  exerciseName: string;
  recordType: 'weight' | 'estimated_1rm' | 'volume';
  value: number;
  reps: number | null;
}

/**
 * PRs currently held by the given workout.
 * A workout holds a PR when a set (weight / estimated-1RM) or its total
 * per-exercise volume is the maximum across all completed sets. Ties go
 * to the earliest achiever, matching the old strictly-greater comparison.
 */
export async function getPRsForWorkout(workoutId: number): Promise<PR[]> {
  const db = getDatabase();
  const results: PR[] = [];

  const weightRows = await db.getAllAsync<{ exercise_name: string; reps: number; value: number }>(
    `WITH sets_valid AS (
       SELECT ws.id, ws.exercise_name, ws.reps, ws.weight, ws.workout_id, ws.completed_at
       FROM workout_sets ws
       WHERE ws.completed_at IS NOT NULL AND ws.weight IS NOT NULL AND ws.reps IS NOT NULL
     ),
     max_by_reps AS (
       SELECT exercise_name, reps, MAX(weight) AS max_weight
       FROM sets_valid GROUP BY exercise_name, reps
     ),
     holders AS (
       SELECT s.exercise_name, s.reps, s.weight AS value, s.workout_id,
              ROW_NUMBER() OVER (PARTITION BY s.exercise_name, s.reps
                                 ORDER BY s.completed_at ASC, s.id ASC) AS rn
       FROM sets_valid s
       JOIN max_by_reps m
         ON m.exercise_name = s.exercise_name AND m.reps = s.reps AND m.max_weight = s.weight
     )
     SELECT exercise_name, reps, value FROM holders WHERE rn = 1 AND workout_id = ?`,
    [workoutId]
  );
  for (const r of weightRows) {
    results.push({ exerciseName: r.exercise_name, recordType: 'weight', value: r.value, reps: r.reps });
  }

  const e1rmRows = await db.getAllAsync<{ exercise_name: string; reps: number; value: number }>(
    `WITH sets_valid AS (
       SELECT ws.id, ws.exercise_name, ws.reps, ws.weight, ws.workout_id, ws.completed_at,
              CASE WHEN ws.reps = 1 THEN ws.weight
                   ELSE ws.weight * (1.0 + ws.reps / 30.0) END AS e1rm
       FROM workout_sets ws
       WHERE ws.completed_at IS NOT NULL AND ws.weight IS NOT NULL
             AND ws.reps IS NOT NULL AND ws.reps >= 1
     ),
     max_e1rm AS (
       SELECT exercise_name, MAX(e1rm) AS max_val FROM sets_valid GROUP BY exercise_name
     ),
     holders AS (
       SELECT s.exercise_name, s.reps, s.e1rm AS value, s.workout_id,
              ROW_NUMBER() OVER (PARTITION BY s.exercise_name
                                 ORDER BY s.completed_at ASC, s.id ASC) AS rn
       FROM sets_valid s
       JOIN max_e1rm m ON m.exercise_name = s.exercise_name AND m.max_val = s.e1rm
     )
     SELECT exercise_name, reps, value FROM holders WHERE rn = 1 AND workout_id = ?`,
    [workoutId]
  );
  for (const r of e1rmRows) {
    results.push({ exerciseName: r.exercise_name, recordType: 'estimated_1rm', value: r.value, reps: r.reps });
  }

  const volumeRows = await db.getAllAsync<{ exercise_name: string; value: number }>(
    `WITH workout_volumes AS (
       SELECT ws.exercise_name, ws.workout_id,
              SUM(ws.reps * ws.weight) AS volume,
              MIN(ws.completed_at) AS first_completed
       FROM workout_sets ws
       WHERE ws.completed_at IS NOT NULL AND ws.weight IS NOT NULL AND ws.reps IS NOT NULL
       GROUP BY ws.exercise_name, ws.workout_id
     ),
     max_vol AS (
       SELECT exercise_name, MAX(volume) AS max_val FROM workout_volumes GROUP BY exercise_name
     ),
     holders AS (
       SELECT v.exercise_name, v.volume AS value, v.workout_id,
              ROW_NUMBER() OVER (PARTITION BY v.exercise_name
                                 ORDER BY v.first_completed ASC, v.workout_id ASC) AS rn
       FROM workout_volumes v
       JOIN max_vol m ON m.exercise_name = v.exercise_name AND m.max_val = v.volume
     )
     SELECT exercise_name, value FROM holders WHERE rn = 1 AND workout_id = ?`,
    [workoutId]
  );
  for (const r of volumeRows) {
    results.push({ exerciseName: r.exercise_name, recordType: 'volume', value: r.value, reps: null });
  }

  return results;
}
