import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, useColorScheme } from 'react-native';
import { ExerciseGroup } from '../context/ActiveWorkoutContext';
import { formatWeight } from '../utils/formatters';

interface Props {
  exercises: ExerciseGroup[];
  currentIndex: number;
  onSelectExercise: (index: number) => void;
  weightUnit: 'kg' | 'lbs';
}

export default function WorkoutOverview({
  exercises,
  currentIndex,
  onSelectExercise,
  weightUnit,
}: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const colors = {
    bg: isDark ? '#000' : '#F2F2F7',
    card: isDark ? '#1C1C1E' : '#FFF',
    text: isDark ? '#FFF' : '#000',
    secondaryText: isDark ? '#8E8E93' : '#6C6C70',
    accent: '#007AFF',
    border: isDark ? '#38383A' : '#E5E5EA',
    currentBg: isDark ? '#1A2A3A' : '#E8F0FE',
    completedText: '#34C759',
  };

  return (
    <FlatList
      data={exercises}
      keyExtractor={(item) => item.exerciseName}
      style={{ backgroundColor: colors.bg }}
      renderItem={({ item, index }) => {
        const workingSets = item.sets.filter((s) => s.is_warmup === 0);
        const warmupSets = item.sets.filter((s) => s.is_warmup === 1);
        const completedSets = workingSets.filter((s) => s.completed_at != null);
        const completedWarmups = warmupSets.filter((s) => s.completed_at != null);
        const totalSets = workingSets.length;
        const isComplete = completedSets.length === totalSets && totalSets > 0;
        const isCurrent = index === currentIndex;

        return (
          <TouchableOpacity
            style={[
              styles.row,
              { backgroundColor: isCurrent ? colors.currentBg : colors.card, borderBottomColor: colors.border },
            ]}
            onPress={() => onSelectExercise(index)}
          >
            <View style={styles.rowLeft}>
              <View style={styles.nameRow}>
                {isComplete && <Text style={styles.checkmark}>{'  '}</Text>}
                <Text
                  style={[
                    styles.exerciseName,
                    { color: isComplete ? colors.completedText : colors.text },
                  ]}
                >
                  {item.exerciseName}
                </Text>
                {item.groupTag && (
                  <View style={[styles.groupBadge, { backgroundColor: colors.accent }]}>
                    <Text style={styles.groupBadgeText}>SS</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.progress, { color: colors.secondaryText }]}>
                {completedSets.length}/{totalSets} sets
                {warmupSets.length > 0 ? ` (${completedWarmups.length}/${warmupSets.length} warmup)` : ''}
              </Text>
            </View>
            <View style={styles.rowRight}>
              {completedSets.map((s) => (
                <Text key={s.id} style={[styles.setDetail, { color: colors.secondaryText }]}>
                  {formatWeight(s.weight ?? 0, s.weight_unit)} x {s.reps}
                </Text>
              ))}
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: { flex: 1 },
  rowRight: { alignItems: 'flex-end' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkmark: { fontSize: 16 },
  exerciseName: { fontSize: 17, fontWeight: '600' },
  groupBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  groupBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  progress: { fontSize: 14, marginTop: 4 },
  setDetail: { fontSize: 13, marginTop: 2 },
});
