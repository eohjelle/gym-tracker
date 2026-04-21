import { useEffect, useState } from 'react';
import { useNavigation } from '../context/NavigationContext';
import { useSettings } from '../context/SettingsContext';
import { ProgramExerciseRow, ProgramWorkoutRow } from '../db/types';
import * as programRepo from '../db/repositories/programRepository';
import {
  getProgressionForExercise,
  applyDeload,
  formatProgressionReasoning,
  ProgressionResult,
} from '../services/progressionService';
import { generateWarmupSets, WarmupSet } from '../services/warmupService';
import { formatWeight } from '../utils/formatters';

interface ExercisePreview {
  exercise: ProgramExerciseRow;
  progression: ProgressionResult;
  workingWeight: number;
  warmups: WarmupSet[];
}

export default function WorkoutPreviewScreen({
  programWorkoutId,
  isDeload,
}: {
  programWorkoutId: number;
  isDeload: boolean;
}) {
  const { goBack } = useNavigation();
  const { weightUnit } = useSettings();

  const [workout, setWorkout] = useState<
    (ProgramWorkoutRow & { exercises: ProgramExerciseRow[] }) | null
  >(null);
  const [previews, setPreviews] = useState<ExercisePreview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fp = await programRepo.getFullActiveProgram();
      const pw = fp?.workouts.find((w) => w.id === programWorkoutId) ?? null;
      if (cancelled || !pw) {
        setLoading(false);
        return;
      }
      setWorkout(pw);

      const rows: ExercisePreview[] = [];
      for (const exercise of pw.exercises) {
        const progression = await getProgressionForExercise(exercise);
        const workingWeight = isDeload
          ? applyDeload(exercise, progression.suggestedWeight)
          : progression.suggestedWeight;
        const warmups =
          exercise.warmup_sets != null &&
          exercise.warmup_min_weight != null &&
          exercise.warmup_min_increment != null
            ? generateWarmupSets(workingWeight, {
                sets: exercise.warmup_sets,
                min_weight: exercise.warmup_min_weight,
                min_increment: exercise.warmup_min_increment,
              })
            : [];
        rows.push({ exercise, progression, workingWeight, warmups });
      }
      if (!cancelled) {
        setPreviews(rows);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [programWorkoutId, isDeload]);

  return (
    <div style={{ overflowY: 'auto', paddingBottom: 40 }}>
      <div style={{ padding: '12px 16px' }}>
        <button
          onClick={goBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          &larr; Back
        </button>
      </div>

      <div className="card">
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
          {workout ? `Workout ${workout.label} preview` : 'Workout preview'}
          {isDeload ? ' (deload)' : ''}
        </div>
        <div style={{ fontSize: 14, marginTop: 4, color: 'var(--text-secondary)' }}>
          Suggested working weights based on your last sessions.
        </div>
      </div>

      {loading && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading…
        </div>
      )}

      {!loading && workout && previews.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          No exercises in this workout.
        </div>
      )}

      {!loading && !workout && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          Workout not found.
        </div>
      )}

      {previews.map(({ exercise, progression, workingWeight, warmups }) => (
        <div key={exercise.id} className="card">
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
              {exercise.name}
            </div>
            {exercise.superset_group && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--accent)',
                  border: '1px solid var(--accent)',
                  borderRadius: 4,
                  padding: '1px 6px',
                }}
              >
                SS {exercise.superset_group}
              </span>
            )}
          </div>

          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
            {formatProgressionReasoning(progression, weightUnit)}
          </div>

          {warmups.map((wu, i) => (
            <div
              key={`w-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 0',
                borderTop: '0.5px solid var(--border)',
              }}
            >
              <span style={{ fontSize: 14, width: 50, color: 'var(--text-secondary)' }}>W</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}>
                {formatWeight(wu.weight, weightUnit)} x {wu.reps}
              </span>
            </div>
          ))}

          {Array.from({ length: exercise.sets }).map((_, i) => (
            <div
              key={`s-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 0',
                borderTop: '0.5px solid var(--border)',
              }}
            >
              <span style={{ fontSize: 14, width: 50, color: 'var(--text-secondary)' }}>
                Set {i + 1}
              </span>
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
                {formatWeight(workingWeight, weightUnit)} x {exercise.target_reps}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                RIR {exercise.target_rir}
              </span>
            </div>
          ))}

          <div
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginTop: 8,
              paddingTop: 8,
              borderTop: '0.5px solid var(--border)',
            }}
          >
            Rest {exercise.rest_seconds}s between sets
          </div>
        </div>
      ))}
    </div>
  );
}
