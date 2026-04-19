import { openDatabaseAsync, SQLiteDatabase } from 'expo-sqlite';
import { migrations } from './migrations';
import { ProgramDefinition } from '../utils/programParser';
import * as programRepo from './repositories/programRepository';
import { programs } from '../../programs';

let db: SQLiteDatabase | null = null;

export async function initDatabase(): Promise<SQLiteDatabase> {
  if (db) return db;

  db = await openDatabaseAsync('gym-tracker.db');

  // Enable WAL mode for better performance
  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync('PRAGMA foreign_keys = ON');

  await runMigrations(db);
  await syncPrograms(db);
  return db;
}

export function getDatabase(): SQLiteDatabase {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

async function runMigrations(database: SQLiteDatabase): Promise<void> {
  // Ensure migrations table exists
  await database.execAsync(
    `CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`
  );

  const result = await database.getFirstAsync<{ max_version: number | null }>(
    'SELECT MAX(version) as max_version FROM _migrations'
  );
  const currentVersion = result?.max_version ?? 0;

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      await database.withExclusiveTransactionAsync(async (txn) => {
        for (const sql of migration.up) {
          await txn.execAsync(sql);
        }
        await txn.runAsync(
          'INSERT INTO _migrations (version, applied_at) VALUES (?, ?)',
          [migration.version, new Date().toISOString()]
        );
      });
    }
  }
}

/**
 * Sync programs from the programs/ folder with the database.
 * - Inserts programs that don't exist yet.
 * - Updates programs whose definition has changed (preserves workout history).
 * The last program in the list becomes the active one on first install.
 */
async function syncPrograms(database: SQLiteDatabase): Promise<void> {
  for (const definition of programs) {
    const json = JSON.stringify(definition);

    const existing = await database.getFirstAsync<{
      id: number;
      json_definition: string;
    }>(
      'SELECT id, json_definition FROM programs WHERE name = ?',
      [definition.name]
    );

    if (!existing) {
      // New program — insert it
      await programRepo.saveProgram(definition);
    } else if (existing.json_definition !== json) {
      // Definition changed — update exercises while preserving history.
      // Unlink completed workouts from old program_workout IDs
      // (they still keep program_name and day for display).
      await database.runAsync(
        `UPDATE workouts SET program_workout_id = NULL
         WHERE program_workout_id IN (
           SELECT id FROM program_workouts WHERE program_id = ?
         )`,
        [existing.id]
      );

      // Delete old workout slots and exercises (CASCADE)
      await database.runAsync(
        'DELETE FROM program_workouts WHERE program_id = ?',
        [existing.id]
      );

      // Update the stored definition
      await database.runAsync(
        'UPDATE programs SET json_definition = ? WHERE id = ?',
        [json, existing.id]
      );

      // Re-insert workouts and exercises
      for (let wi = 0; wi < definition.workouts.length; wi++) {
        const w = definition.workouts[wi];
        const wResult = await database.runAsync(
          'INSERT INTO program_workouts (program_id, label, cycle_order) VALUES (?, ?, ?)',
          [existing.id, w.label, wi]
        );
        const workoutId = wResult.lastInsertRowId;

        for (let ei = 0; ei < w.exercises.length; ei++) {
          const e = w.exercises[ei];
          await database.runAsync(
            `INSERT INTO program_exercises
             (program_workout_id, name, exercise_order, sets, target_reps, target_rir, rest_seconds, superset_group, starting_weight, small_increment, large_increment, warmup_sets, warmup_min_weight, warmup_min_increment)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              workoutId, e.name, ei, e.sets, e.target_reps, e.target_rir,
              e.rest_seconds, e.superset_group, e.starting_weight,
              e.small_increment, e.large_increment,
              e.warmup?.sets ?? null, e.warmup?.min_weight ?? null,
              e.warmup?.min_increment ?? null,
            ]
          );
        }
      }
    }
    // If json matches, nothing to do.
  }
}
