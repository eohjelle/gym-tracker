# Gym Tracker

A personal gym tracking app built with Expo and React Native. Tracks workouts with RIR-based (Reps In Reserve) progressive overload, warmup sets, personal records, and structured program support.

## Features

- **Program-based workouts** with automatic exercise cycling and weight progression
- **Free-form workouts** for unstructured sessions
- **RIR-based progression** — weight increases are driven by how hard sets feel
- **Warmup set generation** based on working weight
- **Personal record tracking** (weight, estimated 1RM, volume)
- **Workout history** and graphs
- **Cloud sync** to Supabase for backup and analysis

## Getting Started

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go, or press `i` for iOS simulator.

## Project Structure

```
src/
  context/         # React Context providers (DB, settings, active workout)
  db/
    database.ts    # SQLite init and migrations
    types.ts       # TypeScript interfaces for DB rows
    migrations.ts  # Schema evolution
    repositories/  # Data access layer (workouts, sets, programs, PRs)
  screens/         # App screens (Home, ActiveWorkout, History, Graphs, Settings)
  services/        # Business logic (progression, warmup, sync)
  utils/           # Helpers (formulas, formatters, constants, program parser)
programs/          # Training program JSON definitions
```

## Programs

Training programs are defined as JSON files in `programs/`. They are automatically synced to the database on app startup. See `programs/` for examples.

## Cloud Sync (Supabase)

Workout data automatically syncs to a Supabase Postgres database after each completed workout. This serves as a backup and makes the data available for analysis from your computer.

### Setup

1. Create a free account at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to **SQL Editor** and run the contents of [`supabase-setup.sql`](supabase-setup.sql) to create the tables
4. Copy your **Project URL** and **anon/public API key** from **Settings > API**
5. In the app, go to **Settings > Cloud Sync** and paste the URL and key
6. Tap **Save Configuration**
7. Tap **Sync All Workouts** to backfill any existing workout data

After setup, every completed workout syncs automatically in the background.

### Querying Your Data

Connect to your Supabase database from your Mac for analysis. You can find the connection string in **Settings > Database** in the Supabase dashboard.

Example with `psql`:
```bash
psql "postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT].supabase.co:5432/postgres"
```

Example query — weekly volume per exercise:
```sql
SELECT
  date_trunc('week', w.start_time::timestamp) AS week,
  s.exercise_name,
  SUM(s.reps * s.weight) AS total_volume,
  COUNT(*) AS total_sets
FROM workout_sets s
JOIN workouts w ON w.id = s.workout_id
WHERE s.completed_at IS NOT NULL AND s.is_warmup = 0
GROUP BY week, s.exercise_name
ORDER BY week DESC, s.exercise_name;
```

## Tech Stack

- [Expo](https://expo.dev) / React Native
- [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) (local storage)
- [Supabase](https://supabase.com) (cloud sync)
- TypeScript
- React Navigation (bottom tabs + native stack)
