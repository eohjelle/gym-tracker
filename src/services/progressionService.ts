import { getDatabase } from '../db/database';
import { ProgramExerciseRow } from '../db/types';

export type ProgressionReasoning =
  | 'first_session'
  | 'large_increase'
  | 'small_increase'
  | 'no_change'
  | 'decrease';

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
 * Compute the suggested weight for an exercise based on its progression rules
 * and the last two sessions' performance.
 */
export function computeSuggestedWeight(
  exercise: ProgramExerciseRow,
  lastSession: SessionSummary | null,
  prevSession: SessionSummary | null,
  prevSessionReasoning: ProgressionReasoning | null
): ProgressionResult {
  // First session: use starting weight
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

  // Determine if last session was a "no change" outcome
  const lastWasNoChange = prevSessionReasoning === 'no_change';

  // Missed target reps => no change (or decrease if two in a row)
  if (reps < target_reps) {
    if (lastWasNoChange) {
      return {
        suggestedWeight: Math.max(0, weight - large_increment),
        reasoning: 'decrease',
        lastWeight: weight,
        increment: -large_increment,
      };
    }
    return {
      suggestedWeight: weight,
      reasoning: 'no_change',
      lastWeight: weight,
      increment: 0,
    };
  }

  // RIR-based progression
  if (estimated_rir > target_rir + 2) {
    return {
      suggestedWeight: weight + large_increment,
      reasoning: 'large_increase',
      lastWeight: weight,
      increment: large_increment,
    };
  }

  if (estimated_rir >= target_rir) {
    return {
      suggestedWeight: weight + small_increment,
      reasoning: 'small_increase',
      lastWeight: weight,
      increment: small_increment,
    };
  }

  // estimated_rir < target_rir => no change (or decrease if two in a row)
  if (lastWasNoChange) {
    return {
      suggestedWeight: Math.max(0, weight - large_increment),
      reasoning: 'decrease',
      lastWeight: weight,
      increment: -large_increment,
    };
  }

  return {
    suggestedWeight: weight,
    reasoning: 'no_change',
    lastWeight: weight,
    increment: 0,
  };
}

/**
 * Get the last two sessions' last-set data for an exercise, used to compute
 * progression. A session only counts if the final planned working set
 * (highest set_number among non-warmup, non-extra sets) was completed.
 * If the last planned set was skipped, the whole workout is ignored.
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
export async function getLastTwoSessionsForExercise(
  exerciseName: string
): Promise<{ lastSession: SessionSummary | null; prevSession: SessionSummary | null }> {
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
     LIMIT 2`,
    [exerciseName]
  );

  const sessions: SessionSummary[] = rows
    .filter((r) => r.weight !== null && r.reps !== null)
    .map((r) => ({ weight: r.weight, reps: r.reps, estimated_rir: r.estimated_rir }));

  return {
    lastSession: sessions[0] ?? null,
    prevSession: sessions[1] ?? null,
  };
}

/**
 * Compute the progression reasoning that would have been applied for a given session,
 * used to determine if the previous session was a "no change".
 */
export function computeReasoningForSession(
  exercise: ProgramExerciseRow,
  session: SessionSummary | null
): ProgressionReasoning | null {
  if (!session || session.estimated_rir === null) return null;

  const { target_rir, target_reps } = exercise;

  if (session.reps < target_reps) return 'no_change';
  if (session.estimated_rir > target_rir + 2) return 'large_increase';
  if (session.estimated_rir >= target_rir) return 'small_increase';
  return 'no_change';
}

/**
 * Get the full progression result for an exercise, querying history automatically.
 */
export async function getProgressionForExercise(
  exercise: ProgramExerciseRow
): Promise<ProgressionResult> {
  const { lastSession, prevSession } = await getLastTwoSessionsForExercise(exercise.name);
  const prevReasoning = computeReasoningForSession(exercise, prevSession);
  return computeSuggestedWeight(exercise, lastSession, prevSession, prevReasoning);
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
      return 'Same weight (needs more work)';
    case 'decrease':
      return `${result.increment} ${unit} (backing off)`;
  }
}
