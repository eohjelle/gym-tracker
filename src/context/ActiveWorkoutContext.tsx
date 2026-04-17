import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { WorkoutRow, WorkoutSetRow, ProgramExerciseRow } from '../db/types';
import * as workoutRepo from '../db/repositories/workoutRepository';
import * as setRepo from '../db/repositories/setRepository';
import * as programRepo from '../db/repositories/programRepository';
import { checkAndUpdatePRs } from '../db/repositories/personalRecordRepository';
import { useSettings } from './SettingsContext';
import { ProgressionResult, getProgressionForExercise } from '../services/progressionService';

export interface ExerciseGroup {
  exerciseName: string;
  sets: WorkoutSetRow[];
  isExtra: boolean;
  groupTag: string | null;
  programExercise: ProgramExerciseRow | null;
  progression: ProgressionResult | null;
}

interface ActiveWorkoutContextValue {
  workout: WorkoutRow | null;
  sets: WorkoutSetRow[];
  exercises: ExerciseGroup[];
  currentExerciseIndex: number;
  setCurrentExerciseIndex: (index: number) => void;
  startWorkout: (params: {
    programName?: string;
    week?: number;
    day?: string;
    type: 'program' | 'free';
    programWorkoutId?: number;
    plannedSets?: setRepo.PlannedSet[];
    programExercises?: ProgramExerciseRow[];
    progressions?: Map<string, ProgressionResult>;
  }) => Promise<void>;
  completeSet: (
    setId: number,
    data: { reps: number; weight: number; notes?: string; estimatedRir?: number }
  ) => Promise<void>;
  addFreeExercise: (exerciseName: string) => void;
  addFreeSet: (
    exerciseName: string,
    data: { reps: number; weight: number; notes?: string }
  ) => Promise<void>;
  addWarmupSet: (
    exerciseName: string,
    data: { reps: number; weight: number }
  ) => Promise<void>;
  finishWorkout: () => Promise<number>;
  discardWorkout: () => Promise<void>;
  reloadSets: () => Promise<void>;
  pendingExercise: string | null;
  setPendingExercise: (name: string | null) => void;
  isLoading: boolean;
}

const ActiveWorkoutContext = createContext<ActiveWorkoutContextValue | null>(null);

export function ActiveWorkoutProvider({ children }: { children: React.ReactNode }) {
  const { weightUnit } = useSettings();
  const [workout, setWorkout] = useState<WorkoutRow | null>(null);
  const [sets, setSets] = useState<WorkoutSetRow[]>([]);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [pendingExercise, setPendingExercise] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [programExerciseMap, setProgramExerciseMap] = useState<Map<string, ProgramExerciseRow>>(new Map());
  const [progressionMap, setProgressionMap] = useState<Map<string, ProgressionResult>>(new Map());

  // Resume active workout on mount
  useEffect(() => {
    (async () => {
      const active = await workoutRepo.getActiveWorkout();
      if (active) {
        setWorkout(active);
        const loadedSets = await setRepo.getSetsForWorkout(active.id);
        setSets(loadedSets);

        // Restore program exercise map if this is a program workout
        if (active.program_workout_id) {
          const exercises = await programRepo.getExercisesForWorkout(active.program_workout_id);
          const map = new Map<string, ProgramExerciseRow>();
          const progMap = new Map<string, ProgressionResult>();
          for (const pe of exercises) {
            map.set(pe.name, pe);
            const progression = await getProgressionForExercise(pe);
            progMap.set(pe.name, progression);
          }
          setProgramExerciseMap(map);
          setProgressionMap(progMap);
        }
      }
      setIsLoading(false);
    })();
  }, []);

  // Derive exercise groups from sets
  const exercises: ExerciseGroup[] = React.useMemo(() => {
    const groups: ExerciseGroup[] = [];
    const seen = new Set<string>();

    for (const set of sets) {
      if (!seen.has(set.exercise_name)) {
        seen.add(set.exercise_name);
        groups.push({
          exerciseName: set.exercise_name,
          sets: sets.filter((s) => s.exercise_name === set.exercise_name),
          isExtra: set.is_extra === 1,
          groupTag: set.group_tag,
          programExercise: programExerciseMap.get(set.exercise_name) ?? null,
          progression: progressionMap.get(set.exercise_name) ?? null,
        });
      }
    }
    return groups;
  }, [sets, programExerciseMap, progressionMap]);

  const startWorkout = useCallback(
    async (params: {
      programName?: string;
      week?: number;
      day?: string;
      type: 'program' | 'free';
      programWorkoutId?: number;
      plannedSets?: setRepo.PlannedSet[];
      programExercises?: ProgramExerciseRow[];
      progressions?: Map<string, ProgressionResult>;
    }) => {
      const newWorkout = await workoutRepo.createWorkout({
        programName: params.programName,
        week: params.week,
        day: params.day,
        type: params.type,
        programWorkoutId: params.programWorkoutId,
      });
      setWorkout(newWorkout);
      setCurrentExerciseIndex(0);

      // Store program exercise definitions and progressions
      if (params.programExercises) {
        const map = new Map<string, ProgramExerciseRow>();
        for (const pe of params.programExercises) {
          map.set(pe.name, pe);
        }
        setProgramExerciseMap(map);
      } else {
        setProgramExerciseMap(new Map());
      }

      if (params.progressions) {
        setProgressionMap(params.progressions);
      } else {
        setProgressionMap(new Map());
      }

      if (params.plannedSets && params.plannedSets.length > 0) {
        await setRepo.addPlannedSets(newWorkout.id, params.plannedSets);
        const loadedSets = await setRepo.getSetsForWorkout(newWorkout.id);
        setSets(loadedSets);
      } else {
        setSets([]);
      }
    },
    []
  );

  const completeSet = useCallback(
    async (setId: number, data: { reps: number; weight: number; notes?: string; estimatedRir?: number }) => {
      await setRepo.completeSet(setId, {
        reps: data.reps,
        weight: data.weight,
        weightUnit,
        notes: data.notes,
        estimatedRir: data.estimatedRir,
      });
      // Reload sets
      if (workout) {
        const updatedSets = await setRepo.getSetsForWorkout(workout.id);
        setSets(updatedSets);

        // Check PRs silently
        const exerciseName = updatedSets.find((s) => s.id === setId)?.exercise_name;
        if (exerciseName) {
          const exerciseSets = updatedSets.filter(
            (s) => s.exercise_name === exerciseName && s.completed_at != null
          );
          await checkAndUpdatePRs(workout.id, exerciseName, exerciseSets);
        }
      }
    },
    [workout, weightUnit]
  );

  const addFreeExercise = useCallback((exerciseName: string) => {
    setPendingExercise(exerciseName);
  }, []);

  const addFreeSet = useCallback(
    async (exerciseName: string, data: { reps: number; weight: number; notes?: string }) => {
      if (!workout) return;
      const setNumber = await setRepo.getNextSetNumber(workout.id, exerciseName);
      await setRepo.addFreeSet(workout.id, {
        exerciseName,
        setNumber,
        reps: data.reps,
        weight: data.weight,
        weightUnit,
        notes: data.notes,
      });
      const updatedSets = await setRepo.getSetsForWorkout(workout.id);
      setSets(updatedSets);

      // Check PRs
      const exerciseSets = updatedSets.filter(
        (s) => s.exercise_name === exerciseName && s.completed_at != null
      );
      await checkAndUpdatePRs(workout.id, exerciseName, exerciseSets);
    },
    [workout, weightUnit]
  );

  const addWarmupSet = useCallback(
    async (exerciseName: string, data: { reps: number; weight: number }) => {
      if (!workout) return;
      const db = (await import('../db/database')).getDatabase();
      const setNumber = await setRepo.getNextSetNumber(workout.id, exerciseName);
      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO workout_sets (workout_id, exercise_name, set_number, reps, weight, weight_unit, completed_at, is_extra, group_tag, rest_seconds, is_warmup)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, 60, 1)`,
        [workout.id, exerciseName, setNumber, data.reps, data.weight, weightUnit, now]
      );
      const updatedSets = await setRepo.getSetsForWorkout(workout.id);
      setSets(updatedSets);
    },
    [workout, weightUnit]
  );

  const finishWorkout = useCallback(async () => {
    if (!workout) throw new Error('No active workout');
    await workoutRepo.finishWorkout(workout.id);
    const workoutId = workout.id;
    setWorkout(null);
    setSets([]);
    setCurrentExerciseIndex(0);
    setPendingExercise(null);
    setProgramExerciseMap(new Map());
    setProgressionMap(new Map());
    return workoutId;
  }, [workout]);

  const reloadSets = useCallback(async () => {
    if (!workout) return;
    const updatedSets = await setRepo.getSetsForWorkout(workout.id);
    setSets(updatedSets);
  }, [workout]);

  const discardWorkout = useCallback(async () => {
    if (!workout) return;
    await workoutRepo.deleteWorkout(workout.id);
    setWorkout(null);
    setSets([]);
    setCurrentExerciseIndex(0);
    setPendingExercise(null);
    setProgramExerciseMap(new Map());
    setProgressionMap(new Map());
  }, [workout]);

  return (
    <ActiveWorkoutContext.Provider
      value={{
        workout,
        sets,
        exercises,
        currentExerciseIndex,
        setCurrentExerciseIndex,
        startWorkout,
        completeSet,
        addFreeExercise,
        addFreeSet,
        addWarmupSet,
        reloadSets,
        finishWorkout,
        discardWorkout,
        pendingExercise,
        setPendingExercise,
        isLoading,
      }}
    >
      {children}
    </ActiveWorkoutContext.Provider>
  );
}

export function useActiveWorkout(): ActiveWorkoutContextValue {
  const ctx = useContext(ActiveWorkoutContext);
  if (!ctx) throw new Error('useActiveWorkout must be used within ActiveWorkoutProvider');
  return ctx;
}
