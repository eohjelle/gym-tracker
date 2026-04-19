import { getDatabase } from '../database';
import { PersonalRecordRow, WorkoutSetRow } from '../types';
import { estimatedOneRepMax } from '../../utils/formulas';

export interface NewPR {
  exerciseName: string;
  recordType: 'weight' | 'estimated_1rm' | 'volume';
  value: number;
  reps: number | null;
}

export async function checkAndUpdatePRs(
  workoutId: number,
  exerciseName: string,
  completedSets: WorkoutSetRow[]
): Promise<NewPR[]> {
  const db = getDatabase();
  const newPRs: NewPR[] = [];
  const now = new Date().toISOString();

  for (const set of completedSets) {
    if (set.reps == null || set.weight == null) continue;

    // Check weight PR for this rep count
    const existingWeightPR = await db.getFirstAsync<PersonalRecordRow>(
      "SELECT * FROM personal_records WHERE exercise_name = ? AND record_type = 'weight' AND reps = ?",
      [exerciseName, set.reps]
    );

    if (!existingWeightPR || set.weight > existingWeightPR.value) {
      if (existingWeightPR) {
        await db.runAsync(
          'UPDATE personal_records SET value = ?, workout_id = ?, achieved_at = ? WHERE id = ?',
          [set.weight, workoutId, now, existingWeightPR.id]
        );
      } else {
        await db.runAsync(
          'INSERT INTO personal_records (exercise_name, record_type, value, reps, workout_id, achieved_at) VALUES (?, ?, ?, ?, ?, ?)',
          [exerciseName, 'weight', set.weight, set.reps, workoutId, now]
        );
      }
      newPRs.push({
        exerciseName,
        recordType: 'weight',
        value: set.weight,
        reps: set.reps,
      });
    }

    // Check estimated 1RM PR
    if (set.reps > 0) {
      const e1rm = estimatedOneRepMax(set.weight, set.reps);
      const existing1RMPR = await db.getFirstAsync<PersonalRecordRow>(
        "SELECT * FROM personal_records WHERE exercise_name = ? AND record_type = 'estimated_1rm'",
        [exerciseName]
      );

      if (!existing1RMPR || e1rm > existing1RMPR.value) {
        if (existing1RMPR) {
          await db.runAsync(
            'UPDATE personal_records SET value = ?, reps = ?, workout_id = ?, achieved_at = ? WHERE id = ?',
            [e1rm, set.reps, workoutId, now, existing1RMPR.id]
          );
        } else {
          await db.runAsync(
            'INSERT INTO personal_records (exercise_name, record_type, value, reps, workout_id, achieved_at) VALUES (?, ?, ?, ?, ?, ?)',
            [exerciseName, 'estimated_1rm', e1rm, set.reps, workoutId, now]
          );
        }
        newPRs.push({
          exerciseName,
          recordType: 'estimated_1rm',
          value: e1rm,
          reps: set.reps,
        });
      }
    }
  }

  // Check volume PR (total volume for this exercise in this workout)
  const totalVolume = completedSets.reduce((sum, s) => {
    if (s.reps != null && s.weight != null) {
      return sum + s.reps * s.weight;
    }
    return sum;
  }, 0);

  if (totalVolume > 0) {
    const existingVolumePR = await db.getFirstAsync<PersonalRecordRow>(
      "SELECT * FROM personal_records WHERE exercise_name = ? AND record_type = 'volume'",
      [exerciseName]
    );

    if (!existingVolumePR || totalVolume > existingVolumePR.value) {
      if (existingVolumePR) {
        await db.runAsync(
          'UPDATE personal_records SET value = ?, workout_id = ?, achieved_at = ? WHERE id = ?',
          [totalVolume, workoutId, now, existingVolumePR.id]
        );
      } else {
        await db.runAsync(
          'INSERT INTO personal_records (exercise_name, record_type, value, reps, workout_id, achieved_at) VALUES (?, ?, ?, ?, ?, ?)',
          [exerciseName, 'volume', totalVolume, null, workoutId, now]
        );
      }
      newPRs.push({
        exerciseName,
        recordType: 'volume',
        value: totalVolume,
        reps: null,
      });
    }
  }

  return newPRs;
}

export async function getPRsForWorkout(workoutId: number): Promise<PersonalRecordRow[]> {
  const db = getDatabase();
  return db.getAllAsync<PersonalRecordRow>(
    'SELECT * FROM personal_records WHERE workout_id = ?',
    [workoutId]
  );
}

export async function getRecordsForExercise(exerciseName: string): Promise<PersonalRecordRow[]> {
  const db = getDatabase();
  return db.getAllAsync<PersonalRecordRow>(
    'SELECT * FROM personal_records WHERE exercise_name = ? ORDER BY record_type',
    [exerciseName]
  );
}
