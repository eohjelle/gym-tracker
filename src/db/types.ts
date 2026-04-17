export interface WorkoutRow {
  id: number;
  start_time: string;
  end_time: string | null;
  program_name: string | null;
  week: number | null;
  day: string | null;
  type: 'program' | 'free';
  status: 'active' | 'completed';
  program_workout_id: number | null;
}

export interface WorkoutSetRow {
  id: number;
  workout_id: number;
  exercise_name: string;
  set_number: number;
  reps: number | null;
  weight: number | null;
  weight_unit: 'kg' | 'lbs';
  notes: string | null;
  completed_at: string | null;
  is_extra: number; // 0 or 1
  group_tag: string | null;
  rest_seconds: number | null;
  estimated_rir: number | null;
  is_warmup: number; // 0 or 1
}

export interface PersonalRecordRow {
  id: number;
  exercise_name: string;
  record_type: 'weight' | 'estimated_1rm' | 'volume';
  value: number;
  reps: number | null;
  workout_id: number;
  achieved_at: string;
}

export interface ProgramRow {
  id: number;
  name: string;
  json_definition: string;
  loaded_at: string;
  is_active: number; // 0 or 1
}

export interface ProgramWorkoutRow {
  id: number;
  program_id: number;
  label: string;
  cycle_order: number;
}

export interface ProgramExerciseRow {
  id: number;
  program_workout_id: number;
  name: string;
  exercise_order: number;
  sets: number;
  target_reps: number;
  target_rir: number;
  rest_seconds: number;
  superset_group: string | null;
  starting_weight: number;
  small_increment: number;
  large_increment: number;
  warmup_sets: number | null;
  warmup_min_weight: number | null;
  warmup_min_increment: number | null;
}

export interface SettingsRow {
  key: string;
  value: string;
}
