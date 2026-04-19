# Gym Tracker

A Progressive Web App for tracking gym workouts with RIR-based progression, program support, and cloud sync.

## Features

- **Program workouts** — load training programs from JSON files with auto-progression based on RIR (Reps In Reserve)
- **Free workouts** — log ad-hoc exercises and sets
- **Warmup generation** — automatic warmup sets based on working weight
- **Superset support** — group exercises with shared rest timers
- **Personal records** — automatic PR detection for weight, estimated 1RM, and volume
- **Progress graphs** — track weight, volume, and estimated 1RM over time
- **Cloud sync** — backup to Supabase with trigger-based change tracking
- **Offline support** — works without internet via service worker caching
- **Installable** — add to home screen on iOS Safari

## Tech Stack

- React + TypeScript + Vite
- sql.js (SQLite compiled to WASM) with IndexedDB persistence
- CSS custom properties with automatic dark mode
- vite-plugin-pwa for service worker and manifest

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Cloud Sync Setup

1. Create a free [Supabase](https://supabase.com) project
2. Run `supabase-setup.sql` against your database
3. Enter your project URL and anon key in Settings > Cloud Sync
