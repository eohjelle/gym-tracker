export interface Migration {
  version: number;
  up: string[];
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: [
      `CREATE TABLE IF NOT EXISTS _migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS workouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        start_time TEXT NOT NULL,
        end_time TEXT,
        program_name TEXT,
        week INTEGER,
        day TEXT,
        type TEXT NOT NULL CHECK(type IN ('program', 'free')),
        status TEXT NOT NULL CHECK(status IN ('active', 'completed')) DEFAULT 'active'
      )`,
      `CREATE TABLE IF NOT EXISTS workout_sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workout_id INTEGER NOT NULL,
        exercise_name TEXT NOT NULL,
        set_number INTEGER NOT NULL,
        reps INTEGER,
        weight REAL,
        weight_unit TEXT NOT NULL CHECK(weight_unit IN ('kg', 'lbs')),
        notes TEXT,
        completed_at TEXT,
        is_extra INTEGER NOT NULL DEFAULT 0,
        group_tag TEXT,
        rest_seconds INTEGER,
        FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sets_workout ON workout_sets(workout_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sets_exercise_time ON workout_sets(exercise_name, completed_at)`,
      `CREATE TABLE IF NOT EXISTS personal_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exercise_name TEXT NOT NULL,
        record_type TEXT NOT NULL CHECK(record_type IN ('weight', 'estimated_1rm', 'volume')),
        value REAL NOT NULL,
        reps INTEGER,
        workout_id INTEGER NOT NULL,
        achieved_at TEXT NOT NULL,
        FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_pr_exercise ON personal_records(exercise_name, record_type)`,
      `CREATE TABLE IF NOT EXISTS programs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        csv_content TEXT NOT NULL,
        loaded_at TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    up: [
      // Replace old programs table with normalized structure
      `DROP TABLE IF EXISTS programs`,
      `CREATE TABLE programs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        json_definition TEXT NOT NULL,
        loaded_at TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE program_workouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        program_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        cycle_order INTEGER NOT NULL,
        FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX idx_pw_program ON program_workouts(program_id, cycle_order)`,
      `CREATE TABLE program_exercises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        program_workout_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        exercise_order INTEGER NOT NULL,
        sets INTEGER NOT NULL DEFAULT 3,
        target_reps INTEGER NOT NULL,
        target_rir INTEGER NOT NULL DEFAULT 2,
        rest_seconds INTEGER NOT NULL DEFAULT 90,
        superset_group TEXT,
        starting_weight REAL NOT NULL,
        small_increment REAL NOT NULL,
        large_increment REAL NOT NULL,
        FOREIGN KEY (program_workout_id) REFERENCES program_workouts(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX idx_pe_workout ON program_exercises(program_workout_id, exercise_order)`,
      // Add RIR tracking to workout sets
      `ALTER TABLE workout_sets ADD COLUMN estimated_rir INTEGER`,
      // Link workouts to program workout slots
      `ALTER TABLE workouts ADD COLUMN program_workout_id INTEGER REFERENCES program_workouts(id)`,
    ],
  },
  {
    version: 3,
    up: [
      // Warmup config on program exercises
      `ALTER TABLE program_exercises ADD COLUMN warmup_sets INTEGER`,
      `ALTER TABLE program_exercises ADD COLUMN warmup_min_weight REAL`,
      `ALTER TABLE program_exercises ADD COLUMN warmup_min_increment REAL`,
      // Flag warmup sets in workout data
      `ALTER TABLE workout_sets ADD COLUMN is_warmup INTEGER NOT NULL DEFAULT 0`,
    ],
  },
];
