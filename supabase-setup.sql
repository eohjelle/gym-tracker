-- Run this in the Supabase SQL Editor to create the sync tables.
-- Go to: Project Dashboard > SQL Editor > New query

CREATE TABLE workouts (
  id INTEGER PRIMARY KEY,
  start_time TEXT NOT NULL,
  end_time TEXT,
  program_name TEXT,
  week INTEGER,
  day TEXT,
  type TEXT NOT NULL CHECK (type IN ('program', 'free')),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
  program_workout_id INTEGER,
  is_deload INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE workout_sets (
  id INTEGER PRIMARY KEY,
  workout_id INTEGER NOT NULL REFERENCES workouts(id),
  exercise_name TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  reps INTEGER,
  weight REAL,
  weight_unit TEXT NOT NULL CHECK (weight_unit IN ('kg', 'lbs')),
  notes TEXT,
  completed_at TEXT,
  is_extra INTEGER NOT NULL DEFAULT 0,
  group_tag TEXT,
  rest_seconds INTEGER,
  estimated_rir REAL,
  is_warmup INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE personal_records (
  id INTEGER PRIMARY KEY,
  exercise_name TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('weight', 'estimated_1rm', 'volume')),
  value REAL NOT NULL,
  reps INTEGER,
  workout_id INTEGER NOT NULL REFERENCES workouts(id),
  achieved_at TEXT NOT NULL
);

-- Index for common queries
CREATE INDEX idx_workout_sets_workout_id ON workout_sets(workout_id);
CREATE INDEX idx_workout_sets_exercise ON workout_sets(exercise_name);
CREATE INDEX idx_personal_records_exercise ON personal_records(exercise_name);
CREATE INDEX idx_workouts_start_time ON workouts(start_time);

-- Allow upserts from the anon key (RLS policy).
-- Since this is a personal app, we allow all operations with a valid API key.
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon" ON workouts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON workout_sets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON personal_records FOR ALL USING (true) WITH CHECK (true);
