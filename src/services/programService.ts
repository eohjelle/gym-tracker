import { ProgramWorkoutRow } from '../db/types';

/**
 * Determine the next workout in a repeating cycle.
 * If lastProgramWorkoutId is null (no completed workouts), returns the first workout.
 * Otherwise, returns the next workout by cycle_order, wrapping around.
 */
export function getNextWorkoutInCycle(
  lastProgramWorkoutId: number | null,
  allWorkouts: ProgramWorkoutRow[]
): ProgramWorkoutRow | null {
  if (allWorkouts.length === 0) return null;

  if (lastProgramWorkoutId === null) {
    return allWorkouts[0];
  }

  const lastIndex = allWorkouts.findIndex((w) => w.id === lastProgramWorkoutId);
  if (lastIndex === -1) {
    return allWorkouts[0];
  }

  const nextIndex = (lastIndex + 1) % allWorkouts.length;
  return allWorkouts[nextIndex];
}
