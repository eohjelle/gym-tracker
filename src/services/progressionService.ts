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
 * Get the last two sessions' last-set data for an exercise,
 * used to compute progression.
 */
export async function getLastTwoSessionsForExercise(
  exerciseName: string
): Promise<{ lastSession: SessionSummary | null; prevSession: SessionSummary | null }> {
  const db = getDatabase();

  // Get last 2 completed workouts containing planned working sets for this exercise
  const workouts = await db.getAllAsync<{ workout_id: number }>(
    `SELECT DISTINCT ws.workout_id
     FROM workout_sets ws
     JOIN workouts w ON w.id = ws.workout_id
     WHERE ws.exercise_name = ?
       AND ws.completed_at IS NOT NULL
       AND ws.is_warmup = 0
       AND ws.is_extra = 0
       AND w.status = 'completed'
     ORDER BY w.start_time DESC
     LIMIT 2`,
    [exerciseName]
  );

  const sessions: SessionSummary[] = [];

  for (const { workout_id } of workouts) {
    // Get the last completed planned working set for this exercise in this workout
    const lastSet = await db.getFirstAsync<{
      weight: number;
      reps: number;
      estimated_rir: number | null;
    }>(
      `SELECT weight, reps, estimated_rir
       FROM workout_sets
       WHERE workout_id = ? AND exercise_name = ? AND completed_at IS NOT NULL AND is_warmup = 0 AND is_extra = 0
       ORDER BY set_number DESC
       LIMIT 1`,
      [workout_id, exerciseName]
    );

    if (lastSet && lastSet.weight !== null && lastSet.reps !== null) {
      sessions.push({
        weight: lastSet.weight,
        reps: lastSet.reps,
        estimated_rir: lastSet.estimated_rir,
      });
    }
  }

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
