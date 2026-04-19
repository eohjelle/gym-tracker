import { getDatabase } from '../database';
import { ProgramRow, ProgramWorkoutRow, ProgramExerciseRow } from '../types';
import { ProgramDefinition } from '../../utils/programParser';

export async function saveProgram(definition: ProgramDefinition): Promise<ProgramRow> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const json = JSON.stringify(definition);

  // Deactivate all existing programs
  await db.runAsync('UPDATE programs SET is_active = 0');

  const result = await db.runAsync(
    'INSERT INTO programs (name, json_definition, loaded_at, is_active) VALUES (?, ?, ?, 1)',
    [definition.name, json, now]
  );

  const programId = result.lastInsertRowId;

  // Insert workouts and exercises
  for (let wi = 0; wi < definition.workouts.length; wi++) {
    const w = definition.workouts[wi];
    const wResult = await db.runAsync(
      'INSERT INTO program_workouts (program_id, label, cycle_order) VALUES (?, ?, ?)',
      [programId, w.label, wi]
    );
    const workoutId = wResult.lastInsertRowId;

    for (let ei = 0; ei < w.exercises.length; ei++) {
      const e = w.exercises[ei];
      await db.runAsync(
        `INSERT INTO program_exercises
         (program_workout_id, name, exercise_order, sets, target_reps, target_rir, rest_seconds, superset_group, starting_weight, small_increment, large_increment, warmup_sets, warmup_min_weight, warmup_min_increment)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          workoutId,
          e.name,
          ei,
          e.sets,
          e.target_reps,
          e.target_rir,
          e.rest_seconds,
          e.superset_group,
          e.starting_weight,
          e.small_increment,
          e.large_increment,
          e.warmup?.sets ?? null,
          e.warmup?.min_weight ?? null,
          e.warmup?.min_increment ?? null,
        ]
      );
    }
  }

  return {
    id: programId,
    name: definition.name,
    json_definition: json,
    loaded_at: now,
    is_active: 1,
  };
}

export async function getActiveProgram(): Promise<ProgramRow | null> {
  const db = getDatabase();
  return db.getFirstAsync<ProgramRow>('SELECT * FROM programs WHERE is_active = 1 LIMIT 1');
}

export async function getWorkoutsForProgram(programId: number): Promise<ProgramWorkoutRow[]> {
  const db = getDatabase();
  return db.getAllAsync<ProgramWorkoutRow>(
    'SELECT * FROM program_workouts WHERE program_id = ? ORDER BY cycle_order',
    [programId]
  );
}

export async function getExercisesForWorkout(programWorkoutId: number): Promise<ProgramExerciseRow[]> {
  const db = getDatabase();
  return db.getAllAsync<ProgramExerciseRow>(
    'SELECT * FROM program_exercises WHERE program_workout_id = ? ORDER BY exercise_order',
    [programWorkoutId]
  );
}

export interface FullProgram {
  program: ProgramRow;
  workouts: (ProgramWorkoutRow & { exercises: ProgramExerciseRow[] })[];
}

export async function getFullActiveProgram(): Promise<FullProgram | null> {
  const program = await getActiveProgram();
  if (!program) return null;

  const workouts = await getWorkoutsForProgram(program.id);
  const fullWorkouts = await Promise.all(
    workouts.map(async (w) => {
      const exercises = await getExercisesForWorkout(w.id);
      return { ...w, exercises };
    })
  );

  return { program, workouts: fullWorkouts };
}

export async function getAllPrograms(): Promise<ProgramRow[]> {
  const db = getDatabase();
  return db.getAllAsync<ProgramRow>('SELECT * FROM programs ORDER BY loaded_at DESC');
}

export async function deleteProgram(id: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM programs WHERE id = ?', [id]);
}

export async function setActiveProgram(id: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync('UPDATE programs SET is_active = 0');
  await db.runAsync('UPDATE programs SET is_active = 1 WHERE id = ?', [id]);
}
