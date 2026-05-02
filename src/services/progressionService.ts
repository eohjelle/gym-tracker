import { getDatabase } from '../db/database';
import { ProgramExerciseRow } from '../db/types';

export type ProgressionReasoning =
  | 'first_session'
  | 'large_increase'
  | 'small_increase'
  | 'no_change'
  | 'small_decrease'
  | 'large_decrease';

export interface ProgressionResult {
  suggestedWeight: number;
  reasoning: ProgressionReasoning;
  lastWeight: number | null;
  increment: number;
}

interface SessionSummary {
  weight: number;
  reps: number;
  estimated_rir: number | null;
}

/**
 * Compute the suggested weight for an exercise based on the effective-reps delta
 * on the last working set of the previous session.
 *
 *   r_eff = reps + estimated_rir   (last working set)
 *   r_tar = target_reps + target_rir
 *   Δ     = r_eff − r_tar
 *
 *   Δ ≥ 4    → +large_increment
 *   2 ≤ Δ ≤ 3 → +small_increment
 *   −1 ≤ Δ ≤ 1 → maintain
 *   −3 ≤ Δ ≤ −2 → −small_increment
 *   Δ ≤ −4   → −large_increment
 */
export function computeSuggestedWeight(
  exercise: ProgramExerciseRow,
  lastSession: SessionSummary | null
): ProgressionResult {
  if (!lastSession || lastSession.estimated_rir === null) {
    return {
      suggestedWeight: exercise.starting_weight,
      reasoning: 'first_session',
      lastWeight: null,
      increment: 0,
    };
  }

  const { target_rir, target_reps, small_increment, large_increment } = exercise;
  const { weight, reps, estimated_rir } = lastSession;
  const delta = (reps + estimated_rir) - (target_reps + target_rir);

  if (delta >= 4) {
    return {
      suggestedWeight: weight + large_increment,
      reasoning: 'large_increase',
      lastWeight: weight,
      increment: large_increment,
    };
  }
  if (delta >= 2) {
    return {
      suggestedWeight: weight + small_increment,
      reasoning: 'small_increase',
      lastWeight: weight,
      increment: small_increment,
    };
  }
  if (delta >= -1) {
    return {
      suggestedWeight: weight,
      reasoning: 'no_change',
      lastWeight: weight,
      increment: 0,
    };
  }
  if (delta >= -3) {
    return {
      suggestedWeight: Math.max(0, weight - small_increment),
      reasoning: 'small_decrease',
      lastWeight: weight,
      increment: -small_increment,
    };
  }
  return {
    suggestedWeight: Math.max(0, weight - large_increment),
    reasoning: 'large_decrease',
    lastWeight: weight,
    increment: -large_increment,
  };
}

/**
 * Get the last completed session's last-set data for an exercise. A session
 * only counts if the final planned working set (highest set_number among
 * non-warmup, non-extra sets) was completed. If the last planned set was
 * skipped, the whole workout is ignored.
 *
 * Relies on these invariants, maintained elsewhere:
 *   1. All planned sets (warmups + working) are inserted upfront at workout
 *      start with is_extra=0 and stable set_numbers — see
 *      setRepository.addPlannedSets. Working set_numbers never shift based on
 *      which warmups the user actually completes.
 *   2. Any set added mid-workout (+ Set / + Warmup) is inserted with
 *      is_extra=1 — see setRepository.addFreeSet.
 *   3. Skipping a set leaves completed_at NULL; the row is not deleted.
 * If any of these change, MAX(set_number) WHERE is_warmup=0 AND is_extra=0
 * may no longer identify the final planned working set and this query breaks.
 */
export async function getLastSessionForExercise(
  exerciseName: string
): Promise<SessionSummary | null> {
  const db = getDatabase();

  const rows = await db.getAllAsync<{
    weight: number;
    reps: number;
    estimated_rir: number | null;
  }>(
    `SELECT ws.weight, ws.reps, ws.estimated_rir
     FROM workout_sets ws
     JOIN workouts w ON w.id = ws.workout_id
     WHERE ws.exercise_name = ?
       AND ws.is_warmup = 0
       AND ws.is_extra = 0
       AND ws.completed_at IS NOT NULL
       AND ws.set_number = (
         SELECT MAX(set_number) FROM workout_sets
         WHERE workout_id = ws.workout_id
           AND exercise_name = ws.exercise_name
           AND is_warmup = 0
           AND is_extra = 0
       )
       AND w.status = 'completed'
       AND w.is_deload = 0
     ORDER BY w.start_time DESC
     LIMIT 1`,
    [exerciseName]
  );

  const row = rows[0];
  if (!row || row.weight === null || row.reps === null) return null;
  return { weight: row.weight, reps: row.reps, estimated_rir: row.estimated_rir };
}

/**
 * Get the full progression result for an exercise, querying history automatically.
 */
export async function getProgressionForExercise(
  exercise: ProgramExerciseRow
): Promise<ProgressionResult> {
  const lastSession = await getLastSessionForExercise(exercise.name);
  return computeSuggestedWeight(exercise, lastSession);
}

/**
 * Scale a suggested weight by a deload multiplier, rounded to the exercise's
 * warmup increment (or small_increment fallback) and floored at warmup_min_weight.
 */
export function applyDeload(
  exercise: ProgramExerciseRow,
  suggestedWeight: number,
  multiplier = 0.7
): number {
  const raw = suggestedWeight * multiplier;
  const inc = exercise.warmup_min_increment ?? exercise.small_increment;
  const minW = exercise.warmup_min_weight ?? 0;
  return Math.max(minW, Math.round(raw / inc) * inc);
}

export function formatProgressionReasoning(result: ProgressionResult, unit: string): string {
  switch (result.reasoning) {
    case 'first_session':
      return 'Starting weight';
    case 'large_increase':
      return `+${result.increment} ${unit} (felt easy)`;
    case 'small_increase':
      return `+${result.increment} ${unit} (good progress)`;
    case 'no_change':
      return 'Same weight (on target)';
    case 'small_decrease':
      return `${result.increment} ${unit} (backing off a bit)`;
    case 'large_decrease':
      return `${result.increment} ${unit} (backing off)`;
  }
}
