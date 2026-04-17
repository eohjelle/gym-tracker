export interface ProgramDefinition {
  name: string;
  workouts: WorkoutDefinition[];
}

export interface WorkoutDefinition {
  label: string;
  exercises: ExerciseDefinition[];
}

export interface WarmupConfig {
  sets: number;
  min_weight: number;
  min_increment: number;
}

export interface ExerciseDefinition {
  name: string;
  sets: number;
  target_reps: number;
  target_rir: number;
  rest_seconds: number;
  superset_group: string | null;
  starting_weight: number;
  small_increment: number;
  large_increment: number;
  warmup: WarmupConfig | null;
}

export function parseProgramJSON(json: string): ProgramDefinition {
  const raw = JSON.parse(json);

  if (!raw.name || typeof raw.name !== 'string') {
    throw new Error('Program must have a "name" string');
  }
  if (!Array.isArray(raw.workouts) || raw.workouts.length === 0) {
    throw new Error('Program must have at least one workout');
  }

  const workouts: WorkoutDefinition[] = raw.workouts.map((w: any, wi: number) => {
    if (!w.label || typeof w.label !== 'string') {
      throw new Error(`Workout ${wi} must have a "label" string`);
    }
    if (!Array.isArray(w.exercises) || w.exercises.length === 0) {
      throw new Error(`Workout "${w.label}" must have at least one exercise`);
    }

    const exercises: ExerciseDefinition[] = w.exercises.map((e: any, ei: number) => {
      if (!e.name || typeof e.name !== 'string') {
        throw new Error(`Exercise ${ei} in workout "${w.label}" must have a "name" string`);
      }

      return {
        name: e.name,
        sets: typeof e.sets === 'number' ? e.sets : 3,
        target_reps: requireNumber(e, 'target_reps', `exercise "${e.name}"`),
        target_rir: typeof e.target_rir === 'number' ? e.target_rir : 2,
        rest_seconds: typeof e.rest_seconds === 'number' ? e.rest_seconds : 90,
        superset_group: e.superset_group ?? null,
        starting_weight: requireNumber(e, 'starting_weight', `exercise "${e.name}"`),
        small_increment: requireNumber(e, 'small_increment', `exercise "${e.name}"`),
        large_increment: requireNumber(e, 'large_increment', `exercise "${e.name}"`),
        warmup: e.warmup ? {
          sets: requireNumber(e.warmup, 'sets', `warmup for "${e.name}"`),
          min_weight: requireNumber(e.warmup, 'min_weight', `warmup for "${e.name}"`),
          min_increment: requireNumber(e.warmup, 'min_increment', `warmup for "${e.name}"`),
        } : null,
      };
    });

    return { label: w.label, exercises };
  });

  return { name: raw.name, workouts };
}

function requireNumber(obj: any, field: string, context: string): number {
  const val = obj[field];
  if (typeof val !== 'number' || isNaN(val)) {
    throw new Error(`${context} must have a numeric "${field}" field`);
  }
  return val;
}
