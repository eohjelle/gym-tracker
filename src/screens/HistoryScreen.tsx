import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, useColorScheme } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { WorkoutRow } from '../db/types';
import * as workoutRepo from '../db/repositories/workoutRepository';
import { formatDuration, formatDate } from '../utils/formatters';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function HistoryScreen() {
  const navigation = useNavigation<NavProp>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [workouts, setWorkouts] = useState<
    (WorkoutRow & { exerciseCount: number; setCount: number })[]
  >([]);

  useFocusEffect(
    useCallback(() => {
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
    }, [])
  );

  const colors = {
    bg: isDark ? '#000' : '#F2F2F7',
    card: isDark ? '#1C1C1E' : '#FFF',
    text: isDark ? '#FFF' : '#000',
    secondaryText: isDark ? '#8E8E93' : '#6C6C70',
    border: isDark ? '#38383A' : '#E5E5EA',
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {workouts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
            No completed workouts yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={workouts}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
              onPress={() => navigation.navigate('WorkoutDetail', { workoutId: item.id })}
            >
              <View>
                <Text style={[styles.date, { color: colors.text }]}>
                  {formatDate(item.start_time)}
                </Text>
                <Text style={[styles.label, { color: colors.secondaryText }]}>
                  {item.type === 'program' && item.day
                    ? `${item.program_name} — Workout ${item.day}`
                    : 'Free Workout'}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={[styles.duration, { color: colors.secondaryText }]}>
                  {formatDuration(item.start_time, item.end_time)}
                </Text>
                <Text style={[styles.stats, { color: colors.secondaryText }]}>
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
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 17 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowRight: { alignItems: 'flex-end' },
  date: { fontSize: 17, fontWeight: '600' },
  label: { fontSize: 14, marginTop: 2 },
  duration: { fontSize: 15 },
  stats: { fontSize: 13, marginTop: 2 },
});
