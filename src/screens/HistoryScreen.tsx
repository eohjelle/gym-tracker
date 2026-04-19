import { useState, useEffect } from 'react';
import { useNavigation } from '../context/NavigationContext';
import { WorkoutRow } from '../db/types';
import * as workoutRepo from '../db/repositories/workoutRepository';
import { formatDuration, formatDate } from '../utils/formatters';

export default function HistoryScreen() {
  const { navigate } = useNavigation();
  const [workouts, setWorkouts] = useState<
    (WorkoutRow & { exerciseCount: number; setCount: number })[]
  >([]);

  useEffect(() => {
    (async () => {
      const all = await workoutRepo.getRecentWorkouts(100);
      const withSummary = await Promise.all(
        all.map(async (w) => {
          const summary = await workoutRepo.getWorkoutExerciseSummary(w.id);
          return { ...w, ...summary };
        })
      );
      setWorkouts(withSummary);
    })();
  }, []);

  if (workouts.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
        No completed workouts yet.
      </div>
    );
  }

  return (
    <div>
      {workouts.map((item) => (
        <button
          key={item.id}
          onClick={() => navigate({ screen: 'workoutDetail', workoutId: item.id })}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            padding: 16,
            background: 'var(--card)',
            border: 'none',
            borderBottom: '0.5px solid var(--border)',
            textAlign: 'left',
            cursor: 'pointer',
            color: 'var(--text)',
          }}
        >
          <div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{formatDate(item.start_time)}</div>
            <div style={{ fontSize: 14, marginTop: 2, color: 'var(--text-secondary)' }}>
              {item.type === 'program' && item.day
                ? `${item.program_name} — Workout ${item.day}${item.is_deload ? ' (deload)' : ''}`
                : 'Free Workout'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
              {formatDuration(item.start_time, item.end_time)}
            </div>
            <div style={{ fontSize: 13, marginTop: 2, color: 'var(--text-secondary)' }}>
              {item.exerciseCount} exercises, {item.setCount} sets
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
