import { useState, useEffect, useCallback } from 'react';
import { useNavigation } from '../context/NavigationContext';
import { useActiveWorkout } from '../context/ActiveWorkoutContext';
import { useSettings } from '../context/SettingsContext';
import { WorkoutRow } from '../db/types';
import * as workoutRepo from '../db/repositories/workoutRepository';
import * as programRepo from '../db/repositories/programRepository';
import { FullProgram } from '../db/repositories/programRepository';
import { formatDuration, formatDate } from '../utils/formatters';
import { getNextWorkoutInCycle } from '../services/programService';
import { getProgressionForExercise, ProgressionResult } from '../services/progressionService';
import { generateWarmupSets } from '../services/warmupService';
import { PlannedSet } from '../db/repositories/setRepository';

export default function HomeScreen() {
  const { navigate } = useNavigation();
  const { workout, startWorkout } = useActiveWorkout();
  const { weightUnit } = useSettings();

  const [recentWorkouts, setRecentWorkouts] = useState<
    (WorkoutRow & { exerciseCount: number; setCount: number })[]
  >([]);
  const [fullProgram, setFullProgram] = useState<FullProgram | null>(null);
  const [nextWorkoutId, setNextWorkoutId] = useState<number | null>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<number | null>(null);
  const [deloadMode, setDeloadMode] = useState(false);

  const loadData = useCallback(async () => {
    const recent = await workoutRepo.getRecentWorkouts(7);
    const withSummary = await Promise.all(
      recent.map(async (w) => {
        const summary = await workoutRepo.getWorkoutExerciseSummary(w.id);
        return { ...w, ...summary };
      })
    );
    setRecentWorkouts(withSummary);

    const fp = await programRepo.getFullActiveProgram();
    setFullProgram(fp);

    if (fp) {
      const lastProgramWorkout = await workoutRepo.getLastCompletedProgramWorkout();
      const next = getNextWorkoutInCycle(
        lastProgramWorkout?.program_workout_id ?? null,
        fp.workouts
      );
      if (next) {
        setNextWorkoutId(next.id);
        setSelectedWorkoutId(next.id);
      } else {
        setNextWorkoutId(null);
        setSelectedWorkoutId(fp.workouts[0]?.id ?? null);
      }
    } else {
      setNextWorkoutId(null);
      setSelectedWorkoutId(null);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const DELOAD_MULTIPLIER = 0.7;

  const handleStartProgramWorkout = async (workoutId?: number) => {
    if (!fullProgram) return;
    const targetId = workoutId ?? selectedWorkoutId;
    const targetWorkout = fullProgram.workouts.find((w) => w.id === targetId);
    if (!targetWorkout) return;

    const progressions = new Map<string, ProgressionResult>();
    const plannedSets: PlannedSet[] = [];

    for (const exercise of targetWorkout.exercises) {
      const progression = await getProgressionForExercise(exercise);
      progressions.set(exercise.name, progression);

      let workingWeight = progression.suggestedWeight;
      if (deloadMode) {
        const rawDeload = progression.suggestedWeight * DELOAD_MULTIPLIER;
        const inc = exercise.warmup_min_increment ?? exercise.small_increment;
        const minW = exercise.warmup_min_weight ?? 0;
        workingWeight = Math.max(minW, Math.round(rawDeload / inc) * inc);
      }

      let setNum = 1;

      if (exercise.warmup_sets != null && exercise.warmup_min_weight != null && exercise.warmup_min_increment != null) {
        const warmups = generateWarmupSets(workingWeight, {
          sets: exercise.warmup_sets,
          min_weight: exercise.warmup_min_weight,
          min_increment: exercise.warmup_min_increment,
        });
        for (const wu of warmups) {
          plannedSets.push({
            exerciseName: exercise.name,
            setNumber: setNum++,
            reps: wu.reps,
            weight: wu.weight,
            weightUnit,
            restSeconds: 60,
            isWarmup: true,
          });
        }
      }

      for (let s = 0; s < exercise.sets; s++) {
        plannedSets.push({
          exerciseName: exercise.name,
          setNumber: setNum++,
          reps: exercise.target_reps,
          weight: workingWeight,
          weightUnit,
          groupTag: exercise.superset_group ?? undefined,
          restSeconds: exercise.rest_seconds,
          defaultRir: exercise.target_rir,
        });
      }
    }

    await startWorkout({
      programName: fullProgram.program.name,
      day: targetWorkout.label,
      type: 'program',
      programWorkoutId: targetWorkout.id,
      plannedSets,
      programExercises: targetWorkout.exercises,
      progressions,
      isDeload: deloadMode,
    });
    navigate({ screen: 'activeWorkout' });
  };

  const handleStartFreeWorkout = async () => {
    await startWorkout({ type: 'free' });
    navigate({ screen: 'activeWorkout' });
  };

  const handleResumeWorkout = () => {
    navigate({ screen: 'activeWorkout' });
  };

  return (
    <div>
      {/* Active workout banner */}
      {workout && (
        <button
          onClick={handleResumeWorkout}
          style={{
            display: 'block',
            width: '100%',
            padding: 16,
            background: 'var(--success)',
            border: 'none',
            color: '#FFF',
            fontSize: 17,
            fontWeight: 600,
            textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          Workout in progress - tap to resume
        </button>
      )}

      {/* Program info and workout picker */}
      {fullProgram && fullProgram.workouts.length > 0 && !workout && (
        <div className="card">
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
            {fullProgram.program.name}
          </div>

          {/* Workout selector */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {fullProgram.workouts.map((pw) => {
              const isSelected = pw.id === selectedWorkoutId;
              const isNext = pw.id === nextWorkoutId;
              return (
                <button
                  key={pw.id}
                  onClick={() => setSelectedWorkoutId(pw.id)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                    background: isSelected ? 'var(--accent)' : 'none',
                    color: isSelected ? '#FFF' : 'var(--text)',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {pw.label}
                  {isNext ? ' (next)' : ''}
                </button>
              );
            })}
          </div>

          {/* Deload toggle */}
          <button
            onClick={() => setDeloadMode(!deloadMode)}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 12,
              padding: '8px 14px',
              borderRadius: 8,
              border: `2px solid ${deloadMode ? '#FF9500' : 'var(--border)'}`,
              background: deloadMode ? '#FF9500' : 'none',
              color: deloadMode ? '#FFF' : 'var(--text-secondary)',
              fontSize: 14,
              fontWeight: 600,
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            Deload{deloadMode ? ' (70% weight)' : ''}
          </button>

          <button
            className="btn btn-accent"
            onClick={() => handleStartProgramWorkout()}
            style={{
              marginTop: 16,
              background: deloadMode ? '#FF9500' : undefined,
            }}
          >
            {deloadMode ? 'Start Deload Workout' : 'Start Workout'}
          </button>
        </div>
      )}

      {/* Free workout button */}
      {!workout && (
        <div className="card">
          <button
            onClick={handleStartFreeWorkout}
            style={{
              display: 'block',
              width: '100%',
              padding: 16,
              borderRadius: 12,
              border: '2px solid var(--accent)',
              background: 'none',
              color: 'var(--accent)',
              fontSize: 18,
              fontWeight: 700,
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            Free Workout
          </button>
        </div>
      )}

      {/* Recent workouts */}
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: '24px 16px 8px' }}>
        Recent Workouts
      </div>
      {recentWorkouts.length === 0 ? (
        <div className="card">
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 15 }}>
            No workouts yet. Start your first workout!
          </div>
        </div>
      ) : (
        recentWorkouts.map((item) => (
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
                  ? `Workout ${item.day}${item.is_deload ? ' (deload)' : ''}`
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
        ))
      )}
    </div>
  );
}
