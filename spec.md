# Gym Tracker App — Specification

A mobile app used during workouts to track exercises, sets, repetitions, and weight. Includes a rest timer, support for custom periodized programs, data collection, and sync to a laptop for further analysis.

## Tech Stack

- **Framework**: React Native + Expo (TypeScript)
- **Local storage**: SQLite (via expo-sqlite)
- **Target platform**: iOS (iPhone), but cross-platform architecture for future Android portability
- **Offline-first**: All features work without an internet connection

---

## Screens & Navigation

### Home Screen (Dashboard)

The main screen shown on app launch:

- Current program name and next suggested workout (week + day), based on workout history
- "Start Workout" button (opens the suggested program workout)
- Option to pick a different week/day or start a free workout
- Recent workout history (last 5-7 workouts with date, name/day, and duration)
- Bottom navigation: **History** | **Graphs** | **Settings**

### Active Workout Screen

Two modes: **Program Workout** and **Free Workout**.

#### Exercise View (Detailed)

Shows one exercise at a time:

- Exercise name
- Current set number out of total (e.g. "Set 2 of 4")
- Target reps and weight (from program, or blank in free mode)
- Last time's performance for this exercise (reps @ weight)
- Editable **Reps** field (pre-filled with target, adjustable)
- Editable **Weight** field with stepper buttons (+/- in configurable increments: 2.5 kg or 5 lbs default) and free numeric input on tap
- Optional **Notes** field (free text per set, e.g. "grip slipped", "felt easy")
- **Done** button to complete the set and start the rest timer

#### Rest Timer

- Auto-starts a countdown after completing a set
- Default duration configurable in Settings (e.g. 90 seconds)
- Per-exercise override via the program CSV `rest` column
- Displays countdown prominently on screen
- Alerts with sound + vibration when timer reaches zero (configurable: sound+vibration, vibration only, or off)
- Can be paused, extended (+30s button), or skipped
- Works in background / when screen is off

#### Workout Overview

Accessible during a workout via an overview button:

- Scrollable vertical list of all exercises in the workout
- Each exercise shows: name, completion status (sets done / total), and completed set details (weight x reps)
- Completed exercises are checked off
- Current exercise is highlighted
- Tap any exercise to jump to it (exercises can be done in any order)
- Ability to skip sets or entire exercises

#### Adding Free Exercises to a Program Workout

- An "Add Exercise" button is available during program workouts
- Added exercises appear in an "Extra" section below the program exercises in the overview
- These extras use the same exercise picker as free workouts (history-based list + custom input)
- Sets are added one at a time with reps + weight + optional notes (no pre-defined set count)
- Extra exercises are recorded as part of the same workout in the data

#### Free Workout Additions

- "Add Exercise" button that shows a list of previously performed exercises
- Search/filter the list
- Option to type a custom exercise name if not in the list
- New custom exercises are automatically added to the history-based list for future use
- Add sets one at a time with reps + weight + optional notes

### Workout Summary Screen

Shown when ending a workout:

- Total workout duration
- Number of exercises performed
- Total sets completed
- Personal records hit during this workout (if any), e.g. "New PR: Bench Press 85kg x 8"

### History Screen

- Chronological list of past workouts
- Each entry: date, program day (or "Free Workout"), duration, number of exercises
- Tap to view full workout details (all exercises, sets, reps, weights, notes)

### Graphs Screen

- Select an exercise to view its progression
- Chart types:
  - **Weight over time**: heaviest weight used per session
  - **Volume over time**: total volume (sets x reps x weight) per session
  - **Estimated 1RM over time**: calculated from best set each session (e.g. Epley formula)
- Time range selector with preset buttons: **4 weeks** | **12 weeks** | **6 months** | **All time**

### Settings Screen

- **Default rest timer duration** (in seconds, default: 90)
- **Weight unit**: kg or lbs (affects display throughout the app and stepper increments)
- **Timer alert mode**: Sound + Vibration | Vibration only | Off
- **Theme**: Follows system setting (dark/light) automatically

---

## Workout Programs

Programs are defined externally as CSV files and loaded into the app. The app is for execution, not program creation.

### CSV Format

```csv
week,day,exercise,set,reps,weight,rest,group
1,A,Squat,1,8,80,120,
1,A,Squat,2,8,80,120,
1,A,Bench Press,1,8,70,90,1
1,A,Dumbbell Fly,1,12,15,90,1
1,A,Barbell Row,1,8,65,90,
1,A,Barbell Row,2,8,65,90,
2,A,Squat,1,6,90,150,
2,A,Squat,2,6,90,150,
```

#### Columns

| Column     | Required | Description |
|------------|----------|-------------|
| `week`     | Yes      | Week number in the program cycle (1, 2, 3, ...) |
| `day`      | Yes      | Day identifier within the week (A, B, C, ... or descriptive like "Push", "Pull") |
| `exercise` | Yes      | Exercise name (must be consistent for history tracking) |
| `set`      | Yes      | Set number for this exercise (1, 2, 3, ...) |
| `reps`     | Yes      | Target number of repetitions |
| `weight`   | Yes      | Target weight (in the user's configured unit) |
| `rest`     | No       | Rest duration in seconds after this set. Falls back to global default if empty. |
| `group`    | No       | Superset group identifier. Exercises with the same group value on the same day are performed as a superset (back-to-back, rest only after the last exercise in the group). |

### Program Navigation

- The app auto-suggests the next workout based on completed workout history (e.g. if you last did Week 2 Day A, it suggests Week 2 Day B next)
- The user can always manually select any week/day
- Programs can be cyclical (after the last week, loop back to week 1)

### Loading Programs

- Import CSV files into the app (mechanism TBD — file picker, iCloud Drive folder, or paste)
- Only one active program at a time
- Switching programs does not delete history

---

## Supersets

- Exercises with the same `group` value on the same day are treated as a superset
- During a superset, the app cycles through the grouped exercises in order (e.g. Bench Press set 1, then Dumbbell Fly set 1, then rest)
- Rest timer only starts after the last exercise in the superset group
- The overview screen visually groups superset exercises together

---

## Data Model

All workout data is stored in a local SQLite database.

### Core Entities

- **Workout**: id, start_time, end_time, program_name, week, day, type (program/free)
- **WorkoutSet**: id, workout_id, exercise_name, set_number, reps, weight, weight_unit, notes, completed_at (timestamp)
- **PersonalRecord**: id, exercise_name, record_type (weight, estimated_1rm, volume), value, workout_id, achieved_at

### Data Collection

- Every completed set is recorded with the exact timestamp (`completed_at`)
- Weight unit is stored per set to avoid ambiguity if the user switches units
- Workout start and end times are recorded
- All data is preserved indefinitely

### Personal Records

- Tracked silently during workouts (no mid-workout interruptions)
- PR types: heaviest weight for a given rep count, highest estimated 1RM, highest single-session volume
- New PRs are displayed on the workout summary screen at the end of the workout

---

## Data Sync

### Primary Method: iCloud Drive

- The app writes/updates the SQLite database file to iCloud Drive
- The file appears automatically on the user's Mac for analysis
- Sync happens in the background when connected to the internet

### Abstraction for Future Flexibility

- The sync mechanism is implemented behind an interface/abstraction layer
- This makes it straightforward to swap in alternative sync backends in the future (e.g. local network server, home server API, manual export)
- The abstraction should support at minimum: `push(database) -> void` and `getLastSyncTimestamp() -> Date`

---

## Persistence & State

- Workouts persist across app closures — the app always resumes an in-progress workout when reopened
- No automatic timeout: a workout remains active until the user explicitly ends it
- All state is saved to SQLite continuously (after each set completion)

---

## UI/UX Principles

- **Theme**: Follow system dark/light mode setting
- **Typography**: Large, readable text for mid-workout use (sweaty hands, gym lighting)
- **Interactions**: Large tap targets, minimal typing required
- **Weight input**: Stepper buttons for quick +/- adjustments (2.5 kg / 5 lbs increments), with tap-to-type for arbitrary values
- **Reps input**: Pre-filled with target, easily adjustable
