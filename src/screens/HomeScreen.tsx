import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  useColorScheme,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useActiveWorkout } from '../context/ActiveWorkoutContext';
import { useSettings } from '../context/SettingsContext';
import { WorkoutRow, ProgramWorkoutRow, ProgramExerciseRow } from '../db/types';
import * as workoutRepo from '../db/repositories/workoutRepository';
import * as programRepo from '../db/repositories/programRepository';
import { FullProgram } from '../db/repositories/programRepository';
import { formatDuration, formatDate } from '../utils/formatters';
import { getNextWorkoutInCycle } from '../services/programService';
import { getProgressionForExercise, ProgressionResult } from '../services/progressionService';
import { generateWarmupSets } from '../services/warmupService';
import { PlannedSet } from '../db/repositories/setRepository';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { workout, startWorkout } = useActiveWorkout();
  const { weightUnit } = useSettings();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [recentWorkouts, setRecentWorkouts] = useState<
    (WorkoutRow & { exerciseCount: number; setCount: number })[]
  >([]);
  const [fullProgram, setFullProgram] = useState<FullProgram | null>(null);
  const [nextWorkout, setNextWorkout] = useState<(ProgramWorkoutRow & { exercises: ProgramExerciseRow[] }) | null>(null);

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
        const fullNext = fp.workouts.find((w) => w.id === next.id) ?? null;
        setNextWorkout(fullNext);
      } else {
        setNextWorkout(null);
      }
    } else {
      setNextWorkout(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleStartProgramWorkout = async () => {
    if (!fullProgram || !nextWorkout) return;

    // Compute progression and warmup sets for each exercise
    const progressions = new Map<string, ProgressionResult>();
    const plannedSets: PlannedSet[] = [];

    for (const exercise of nextWorkout.exercises) {
      const progression = await getProgressionForExercise(exercise);
      progressions.set(exercise.name, progression);

      let setNum = 1;

      // Generate warmup sets if configured
      if (exercise.warmup_sets != null && exercise.warmup_min_weight != null && exercise.warmup_min_increment != null) {
        const warmups = generateWarmupSets(progression.suggestedWeight, {
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
            restSeconds: 60, // shorter rest for warmups
            isWarmup: true,
          });
        }
      }

      // Working sets
      for (let s = 0; s < exercise.sets; s++) {
        plannedSets.push({
          exerciseName: exercise.name,
          setNumber: setNum++,
          reps: exercise.target_reps,
          weight: progression.suggestedWeight,
          weightUnit,
          groupTag: exercise.superset_group ?? undefined,
          restSeconds: exercise.rest_seconds,
          defaultRir: exercise.target_rir,
        });
      }
    }

    await startWorkout({
      programName: fullProgram.program.name,
      day: nextWorkout.label,
      type: 'program',
      programWorkoutId: nextWorkout.id,
      plannedSets,
      programExercises: nextWorkout.exercises,
      progressions,
    });
    navigation.navigate('ActiveWorkout');
  };

  const handleStartFreeWorkout = async () => {
    await startWorkout({ type: 'free' });
    navigation.navigate('ActiveWorkout');
  };

  const handleResumeWorkout = () => {
    navigation.navigate('ActiveWorkout');
  };

  const colors = {
    bg: isDark ? '#000' : '#F2F2F7',
    card: isDark ? '#1C1C1E' : '#FFF',
    text: isDark ? '#FFF' : '#000',
    secondaryText: isDark ? '#8E8E93' : '#6C6C70',
    accent: '#007AFF',
    border: isDark ? '#38383A' : '#E5E5EA',
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Active workout banner */}
      {workout && (
        <TouchableOpacity
          style={[styles.resumeBanner, { backgroundColor: '#34C759' }]}
          onPress={handleResumeWorkout}
        >
          <Text style={styles.resumeText}>Workout in progress - tap to resume</Text>
        </TouchableOpacity>
      )}

      {/* Program info and next workout */}
      {fullProgram && nextWorkout && !workout && (
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.programName, { color: colors.text }]}>{fullProgram.program.name}</Text>
          <Text style={[styles.nextWorkout, { color: colors.secondaryText }]}>
            Next: Workout {nextWorkout.label}
          </Text>
          <TouchableOpacity
            style={[styles.startButton, { backgroundColor: colors.accent }]}
            onPress={handleStartProgramWorkout}
          >
            <Text style={styles.startButtonText}>Start Workout</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Free workout button */}
      {!workout && (
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.freeButton, { borderColor: colors.accent }]}
            onPress={handleStartFreeWorkout}
          >
            <Text style={[styles.freeButtonText, { color: colors.accent }]}>Free Workout</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Recent workouts */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Workouts</Text>
      {recentWorkouts.length === 0 ? (
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
            No workouts yet. Start your first workout!
          </Text>
        </View>
      ) : (
        <FlatList
          data={recentWorkouts}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.workoutRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
              onPress={() => navigation.navigate('WorkoutDetail', { workoutId: item.id })}
            >
              <View style={styles.workoutRowLeft}>
                <Text style={[styles.workoutDate, { color: colors.text }]}>
                  {formatDate(item.start_time)}
                </Text>
                <Text style={[styles.workoutLabel, { color: colors.secondaryText }]}>
                  {item.type === 'program' && item.day
                    ? `Workout ${item.day}`
                    : 'Free Workout'}
                </Text>
              </View>
              <View style={styles.workoutRowRight}>
                <Text style={[styles.workoutDuration, { color: colors.secondaryText }]}>
                  {formatDuration(item.start_time, item.end_time)}
                </Text>
                <Text style={[styles.workoutStats, { color: colors.secondaryText }]}>
                  {item.exerciseCount} exercises, {item.setCount} sets
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  resumeBanner: {
    padding: 16,
    alignItems: 'center',
  },
  resumeText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '600',
  },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 20,
  },
  programName: {
    fontSize: 20,
    fontWeight: '700',
  },
  nextWorkout: {
    fontSize: 15,
    marginTop: 4,
  },
  startButton: {
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  freeButton: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    alignItems: 'center',
  },
  freeButtonText: {
    fontSize: 18,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
  workoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    marginHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  workoutRowLeft: {},
  workoutRowRight: { alignItems: 'flex-end' },
  workoutDate: { fontSize: 17, fontWeight: '600' },
  workoutLabel: { fontSize: 14, marginTop: 2 },
  workoutDuration: { fontSize: 15 },
  workoutStats: { fontSize: 13, marginTop: 2 },
});
