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
  {
    version: 4,
    up: [
      // Deload flag on workouts
      `ALTER TABLE workouts ADD COLUMN is_deload INTEGER NOT NULL DEFAULT 0`,
    ],
  },
  {
    version: 5,
    up: [
      // Queue of local changes to sync to cloud
      `CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        operation TEXT NOT NULL,
        row_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      // Seed queue with all existing data so first sync pushes everything
      `INSERT INTO sync_queue (table_name, operation, row_id)
        SELECT 'workouts', 'INSERT', id FROM workouts WHERE status = 'completed'`,
      `INSERT INTO sync_queue (table_name, operation, row_id)
        SELECT 'workout_sets', 'INSERT', ws.id FROM workout_sets ws
        JOIN workouts w ON w.id = ws.workout_id WHERE w.status = 'completed'`,
      `INSERT INTO sync_queue (table_name, operation, row_id)
        SELECT 'personal_records', 'INSERT', id FROM personal_records`,
      // Triggers to auto-capture all writes on synced tables
      // -- workouts
      `CREATE TRIGGER sync_workouts_insert AFTER INSERT ON workouts BEGIN
        INSERT INTO sync_queue (table_name, operation, row_id) VALUES ('workouts', 'INSERT', NEW.id);
      END`,
      `CREATE TRIGGER sync_workouts_update AFTER UPDATE ON workouts BEGIN
        INSERT INTO sync_queue (table_name, operation, row_id) VALUES ('workouts', 'UPDATE', NEW.id);
      END`,
      `CREATE TRIGGER sync_workouts_delete AFTER DELETE ON workouts BEGIN
        INSERT INTO sync_queue (table_name, operation, row_id) VALUES ('workouts', 'DELETE', OLD.id);
      END`,
      // -- workout_sets
      `CREATE TRIGGER sync_sets_insert AFTER INSERT ON workout_sets BEGIN
        INSERT INTO sync_queue (table_name, operation, row_id) VALUES ('workout_sets', 'INSERT', NEW.id);
      END`,
      `CREATE TRIGGER sync_sets_update AFTER UPDATE ON workout_sets BEGIN
        INSERT INTO sync_queue (table_name, operation, row_id) VALUES ('workout_sets', 'UPDATE', NEW.id);
      END`,
      `CREATE TRIGGER sync_sets_delete AFTER DELETE ON workout_sets BEGIN
        INSERT INTO sync_queue (table_name, operation, row_id) VALUES ('workout_sets', 'DELETE', OLD.id);
      END`,
      // -- personal_records
      `CREATE TRIGGER sync_prs_insert AFTER INSERT ON personal_records BEGIN
        INSERT INTO sync_queue (table_name, operation, row_id) VALUES ('personal_records', 'INSERT', NEW.id);
      END`,
      `CREATE TRIGGER sync_prs_update AFTER UPDATE ON personal_records BEGIN
        INSERT INTO sync_queue (table_name, operation, row_id) VALUES ('personal_records', 'UPDATE', NEW.id);
      END`,
      `CREATE TRIGGER sync_prs_delete AFTER DELETE ON personal_records BEGIN
        INSERT INTO sync_queue (table_name, operation, row_id) VALUES ('personal_records', 'DELETE', OLD.id);
      END`,
    ],
  },
  {
    version: 6,
    up: [
      // Switch sync to in-order replay with row snapshots.
      // Drop the personal_records table — PRs are now computed on demand from workout_sets.
      `DROP TRIGGER IF EXISTS sync_workouts_insert`,
      `DROP TRIGGER IF EXISTS sync_workouts_update`,
      `DROP TRIGGER IF EXISTS sync_workouts_delete`,
      `DROP TRIGGER IF EXISTS sync_sets_insert`,
      `DROP TRIGGER IF EXISTS sync_sets_update`,
      `DROP TRIGGER IF EXISTS sync_sets_delete`,
      `DROP TRIGGER IF EXISTS sync_prs_insert`,
      `DROP TRIGGER IF EXISTS sync_prs_update`,
      `DROP TRIGGER IF EXISTS sync_prs_delete`,
      `DROP INDEX IF EXISTS idx_pr_exercise`,
      `DROP TABLE IF EXISTS personal_records`,
      `DROP TABLE IF EXISTS sync_queue`,
      `CREATE TABLE sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        operation TEXT NOT NULL CHECK(operation IN ('upsert', 'delete')),
        row_id INTEGER NOT NULL,
        snapshot TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      // Seed: re-push all local workouts and sets so Supabase converges with local.
      // Workouts first so FKs are satisfied on replay.
      `INSERT INTO sync_queue (table_name, operation, row_id, snapshot)
        SELECT 'workouts', 'upsert', id, json_object(
          'id', id,
          'start_time', start_time,
          'end_time', end_time,
          'program_name', program_name,
          'week', week,
          'day', day,
          'type', type,
          'status', status,
          'program_workout_id', program_workout_id,
          'is_deload', is_deload
        ) FROM workouts ORDER BY id`,
      `INSERT INTO sync_queue (table_name, operation, row_id, snapshot)
        SELECT 'workout_sets', 'upsert', id, json_object(
          'id', id,
          'workout_id', workout_id,
          'exercise_name', exercise_name,
          'set_number', set_number,
          'reps', reps,
          'weight', weight,
          'weight_unit', weight_unit,
          'notes', notes,
          'completed_at', completed_at,
          'is_extra', is_extra,
          'group_tag', group_tag,
          'rest_seconds', rest_seconds,
          'estimated_rir', estimated_rir,
          'is_warmup', is_warmup
        ) FROM workout_sets ORDER BY id`,
      // Triggers log each write as an upsert-with-snapshot or delete-by-id, in order.
      `CREATE TRIGGER sync_workouts_insert AFTER INSERT ON workouts BEGIN
        INSERT INTO sync_queue (table_name, operation, row_id, snapshot) VALUES (
          'workouts', 'upsert', NEW.id,
          json_object(
            'id', NEW.id,
            'start_time', NEW.start_time,
            'end_time', NEW.end_time,
            'program_name', NEW.program_name,
            'week', NEW.week,
            'day', NEW.day,
            'type', NEW.type,
            'status', NEW.status,
            'program_workout_id', NEW.program_workout_id,
            'is_deload', NEW.is_deload
          )
        );
      END`,
      `CREATE TRIGGER sync_workouts_update AFTER UPDATE ON workouts BEGIN
        INSERT INTO sync_queue (table_name, operation, row_id, snapshot) VALUES (
          'workouts', 'upsert', NEW.id,
          json_object(
            'id', NEW.id,
            'start_time', NEW.start_time,
            'end_time', NEW.end_time,
            'program_name', NEW.program_name,
            'week', NEW.week,
            'day', NEW.day,
            'type', NEW.type,
            'status', NEW.status,
            'program_workout_id', NEW.program_workout_id,
            'is_deload', NEW.is_deload
          )
        );
      END`,
      `CREATE TRIGGER sync_workouts_delete AFTER DELETE ON workouts BEGIN
        INSERT INTO sync_queue (table_name, operation, row_id) VALUES ('workouts', 'delete', OLD.id);
      END`,
      `CREATE TRIGGER sync_sets_insert AFTER INSERT ON workout_sets BEGIN
        INSERT INTO sync_queue (table_name, operation, row_id, snapshot) VALUES (
          'workout_sets', 'upsert', NEW.id,
          json_object(
            'id', NEW.id,
            'workout_id', NEW.workout_id,
            'exercise_name', NEW.exercise_name,
            'set_number', NEW.set_number,
            'reps', NEW.reps,
            'weight', NEW.weight,
            'weight_unit', NEW.weight_unit,
            'notes', NEW.notes,
            'completed_at', NEW.completed_at,
            'is_extra', NEW.is_extra,
            'group_tag', NEW.group_tag,
            'rest_seconds', NEW.rest_seconds,
            'estimated_rir', NEW.estimated_rir,
            'is_warmup', NEW.is_warmup
          )
        );
      END`,
      `CREATE TRIGGER sync_sets_update AFTER UPDATE ON workout_sets BEGIN
        INSERT INTO sync_queue (table_name, operation, row_id, snapshot) VALUES (
          'workout_sets', 'upsert', NEW.id,
          json_object(
            'id', NEW.id,
            'workout_id', NEW.workout_id,
            'exercise_name', NEW.exercise_name,
            'set_number', NEW.set_number,
            'reps', NEW.reps,
            'weight', NEW.weight,
            'weight_unit', NEW.weight_unit,
            'notes', NEW.notes,
            'completed_at', NEW.completed_at,
            'is_extra', NEW.is_extra,
            'group_tag', NEW.group_tag,
            'rest_seconds', NEW.rest_seconds,
            'estimated_rir', NEW.estimated_rir,
            'is_warmup', NEW.is_warmup
          )
        );
      END`,
      `CREATE TRIGGER sync_sets_delete AFTER DELETE ON workout_sets BEGIN
        INSERT INTO sync_queue (table_name, operation, row_id) VALUES ('workout_sets', 'delete', OLD.id);
      END`,
    ],
  },
];
