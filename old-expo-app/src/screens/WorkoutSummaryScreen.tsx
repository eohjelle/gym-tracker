import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { RouteProp, useRoute, useNavigation, CommonActions } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';
import { WorkoutWithSets } from '../db/repositories/workoutRepository';
import * as workoutRepo from '../db/repositories/workoutRepository';
import { getPRsForWorkout } from '../db/repositories/personalRecordRepository';
import { PersonalRecordRow } from '../db/types';
import { formatDuration, formatWeight } from '../utils/formatters';

type RouteParams = RouteProp<RootStackParamList, 'WorkoutSummary'>;

export default function WorkoutSummaryScreen() {
  const route = useRoute<RouteParams>();
  const navigation = useNavigation();
  const { workoutId } = route.params;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [workout, setWorkout] = useState<WorkoutWithSets | null>(null);
  const [prs, setPrs] = useState<PersonalRecordRow[]>([]);

  useEffect(() => {
    workoutRepo.getWorkoutWithSets(workoutId).then(setWorkout);
    getPRsForWorkout(workoutId).then(setPrs);
  }, [workoutId]);

  if (!workout) return null;

  const completedSets = workout.sets.filter((s) => s.completed_at != null);
  const exerciseNames = [...new Set(completedSets.map((s) => s.exercise_name))];
  const duration = formatDuration(workout.start_time, workout.end_time);

  const handleDone = () => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      })
    );
  };

  const colors = {
    bg: isDark ? '#000' : '#F2F2F7',
    card: isDark ? '#1C1C1E' : '#FFF',
    text: isDark ? '#FFF' : '#000',
    secondaryText: isDark ? '#8E8E93' : '#6C6C70',
    accent: '#007AFF',
    gold: '#FFD60A',
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.title, { color: colors.text }]}>Workout Complete!</Text>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.text }]}>{duration}</Text>
            <Text style={[styles.statLabel, { color: colors.secondaryText }]}>Duration</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.text }]}>{exerciseNames.length}</Text>
            <Text style={[styles.statLabel, { color: colors.secondaryText }]}>Exercises</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.text }]}>{completedSets.length}</Text>
            <Text style={[styles.statLabel, { color: colors.secondaryText }]}>Sets</Text>
          </View>
        </View>
      </View>

      {/* PRs */}
      {prs.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.prTitle, { color: colors.gold }]}>Personal Records!</Text>
          {prs.map((pr) => (
            <View key={pr.id} style={styles.prRow}>
              <Text style={[styles.prText, { color: colors.text }]}>
                {pr.exercise_name}:{' '}
                {pr.record_type === 'weight' && pr.reps
                  ? `${pr.value} x ${pr.reps} reps`
                  : pr.record_type === 'estimated_1rm'
                  ? `Est. 1RM: ${Math.round(pr.value)}`
                  : `Volume: ${Math.round(pr.value)}`}
              </Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={[styles.doneButton, { backgroundColor: colors.accent }]}
        onPress={handleDone}
      >
        <Text style={styles.doneButtonText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 24,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 20,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: { alignItems: 'center' },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 14,
    marginTop: 4,
  },
  prTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
  },
  prRow: {
    paddingVertical: 6,
  },
  prText: {
    fontSize: 16,
  },
  doneButton: {
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
