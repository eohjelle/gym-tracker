import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  useColorScheme,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';
import { WorkoutWithSets } from '../db/repositories/workoutRepository';
import * as workoutRepo from '../db/repositories/workoutRepository';
import * as setRepo from '../db/repositories/setRepository';
import { WorkoutSetRow } from '../db/types';
import { formatDuration, formatDate, formatWeight } from '../utils/formatters';
import ExercisePicker from '../components/ExercisePicker';

type RouteParams = RouteProp<RootStackParamList, 'WorkoutDetail'>;

export default function WorkoutDetailScreen() {
  const route = useRoute<RouteParams>();
  const navigation = useNavigation();
  const { workoutId } = route.params;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [workout, setWorkout] = useState<WorkoutWithSets | null>(null);
  const [editingSetId, setEditingSetId] = useState<number | null>(null);
  const [editReps, setEditReps] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editRir, setEditRir] = useState('');
  const [editingDate, setEditingDate] = useState(false);
  const [dateInput, setDateInput] = useState('');
  const [showExercisePicker, setShowExercisePicker] = useState(false);

  // State for adding a new set
  const [addingSetExercise, setAddingSetExercise] = useState<string | null>(null);
  const [addSetIsWarmup, setAddSetIsWarmup] = useState(false);
  const [addSetReps, setAddSetReps] = useState('');
  const [addSetWeight, setAddSetWeight] = useState('');
  const [addSetNotes, setAddSetNotes] = useState('');

  const loadWorkout = async () => {
    const w = await workoutRepo.getWorkoutWithSets(workoutId);
    setWorkout(w);
  };

  useEffect(() => {
    loadWorkout();
  }, [workoutId]);

  if (!workout) return null;

  const colors = {
    bg: isDark ? '#000' : '#F2F2F7',
    card: isDark ? '#1C1C1E' : '#FFF',
    text: isDark ? '#FFF' : '#000',
    secondaryText: isDark ? '#8E8E93' : '#6C6C70',
    border: isDark ? '#38383A' : '#E5E5EA',
    accent: '#007AFF',
    destructive: '#FF3B30',
    inputBg: isDark ? '#2C2C2E' : '#E5E5EA',
    warmupText: isDark ? '#636366' : '#AEAEB2',
    done: '#34C759',
  };

  // Group sets by exercise
  const exerciseGroups: { name: string; sets: WorkoutSetRow[] }[] = [];
  const seen = new Set<string>();
  for (const set of workout.sets) {
    if (!seen.has(set.exercise_name)) {
      seen.add(set.exercise_name);
      exerciseGroups.push({
        name: set.exercise_name,
        sets: workout.sets.filter((s) => s.exercise_name === set.exercise_name),
      });
    }
  }

  const handleStartEditSet = (set: WorkoutSetRow) => {
    setEditingSetId(set.id);
    setEditReps(String(set.reps ?? ''));
    setEditWeight(String(set.weight ?? ''));
    setEditNotes(set.notes ?? '');
    setEditRir(set.estimated_rir != null ? String(set.estimated_rir) : '');
  };

  const handleSaveSet = async () => {
    if (editingSetId == null) return;
    const reps = parseInt(editReps, 10);
    const weight = parseFloat(editWeight);
    if (isNaN(reps) || isNaN(weight)) {
      Alert.alert('Invalid input', 'Please enter valid numbers.');
      return;
    }
    const rir = editRir.trim() !== '' ? parseInt(editRir, 10) : null;
    await setRepo.updateSet(editingSetId, {
      reps,
      weight,
      notes: editNotes,
      estimatedRir: isNaN(rir as number) ? null : rir,
    });
    setEditingSetId(null);
    await loadWorkout();
  };

  const handleDeleteSet = async (setId: number) => {
    Alert.alert('Delete Set', 'Remove this set?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await setRepo.deleteSet(setId);
          if (editingSetId === setId) setEditingSetId(null);
          await loadWorkout();
        },
      },
    ]);
  };

  const handleStartAddSet = (exerciseName: string, isWarmup: boolean) => {
    setAddingSetExercise(exerciseName);
    setAddSetIsWarmup(isWarmup);
    setAddSetReps('');
    setAddSetWeight('');
    setAddSetNotes('');
  };

  const handleSaveNewSet = async () => {
    if (!addingSetExercise) return;
    const reps = parseInt(addSetReps, 10);
    const weight = parseFloat(addSetWeight);
    if (isNaN(reps) || isNaN(weight)) {
      Alert.alert('Invalid input', 'Please enter valid numbers.');
      return;
    }
    const setNumber = await setRepo.getNextSetNumber(workoutId, addingSetExercise);
    // Use addFreeSet to create a completed set, then update is_warmup if needed
    const newSet = await setRepo.addFreeSet(workoutId, {
      exerciseName: addingSetExercise,
      setNumber,
      reps,
      weight,
      weightUnit: workout.sets[0]?.weight_unit ?? 'lbs',
      notes: addSetNotes || undefined,
    });
    if (addSetIsWarmup) {
      const db = (await import('../db/database')).getDatabase();
      await db.runAsync('UPDATE workout_sets SET is_warmup = 1 WHERE id = ?', [newSet.id]);
    }
    setAddingSetExercise(null);
    await loadWorkout();
  };

  const handleAddExercise = async (exerciseName: string) => {
    setShowExercisePicker(false);
    handleStartAddSet(exerciseName, false);
  };

  const handleEditDate = () => {
    const d = new Date(workout.start_time);
    const pad = (n: number) => n.toString().padStart(2, '0');
    setDateInput(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
    setEditingDate(true);
  };

  const handleSaveDate = async () => {
    const parsed = new Date(dateInput.replace(' ', 'T'));
    if (isNaN(parsed.getTime())) {
      Alert.alert('Invalid date', 'Use format: YYYY-MM-DD HH:MM');
      return;
    }
    const newStart = parsed.toISOString();
    const oldStart = new Date(workout.start_time).getTime();
    const newStartMs = parsed.getTime();
    let newEnd: string | null = null;
    if (workout.end_time) {
      const oldEnd = new Date(workout.end_time).getTime();
      const duration = oldEnd - oldStart;
      newEnd = new Date(newStartMs + duration).toISOString();
    }
    await workoutRepo.updateWorkoutDate(workoutId, newStart, newEnd);
    setEditingDate(false);
    await loadWorkout();
  };

  const handleDeleteWorkout = () => {
    Alert.alert('Delete Workout', 'This will permanently delete this workout and all its sets.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await workoutRepo.deleteWorkout(workoutId);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        {editingDate ? (
          <View>
            <TextInput
              style={[styles.dateInput, { color: colors.text, backgroundColor: colors.inputBg }]}
              value={dateInput}
              onChangeText={setDateInput}
              placeholder="YYYY-MM-DD HH:MM"
              placeholderTextColor={colors.secondaryText}
              autoFocus
            />
            <View style={styles.editActions}>
              <TouchableOpacity onPress={handleSaveDate}>
                <Text style={[styles.actionLink, { color: colors.accent }]}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditingDate(false)}>
                <Text style={[styles.actionLink, { color: colors.secondaryText }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={handleEditDate}>
            <Text style={[styles.date, { color: colors.text }]}>
              {formatDate(workout.start_time)}
            </Text>
            <Text style={[styles.editHint, { color: colors.accent }]}>Tap to edit date</Text>
          </TouchableOpacity>
        )}
        <Text style={[styles.type, { color: colors.secondaryText }]}>
          {workout.type === 'program' && workout.day
            ? `${workout.program_name} — Workout ${workout.day}`
            : 'Free Workout'}
        </Text>
        <Text style={[styles.duration, { color: colors.secondaryText }]}>
          Duration: {formatDuration(workout.start_time, workout.end_time)}
        </Text>
      </View>

      {/* Exercises */}
      {exerciseGroups.map((group) => (
        <View key={group.name} style={[styles.exerciseCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.exerciseName, { color: colors.text }]}>{group.name}</Text>
          {group.sets
            .filter((s) => s.completed_at != null)
            .map((set) => {
              const isEditing = editingSetId === set.id;
              const isWarmup = set.is_warmup === 1;

              if (isEditing) {
                return (
                  <View key={set.id} style={[styles.setRow, styles.editRow, { borderTopColor: colors.border }]}>
                    <View style={styles.editFields}>
                      <View style={styles.editFieldRow}>
                        <Text style={[styles.editFieldLabel, { color: colors.secondaryText }]}>Weight:</Text>
                        <TextInput
                          style={[styles.editInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                          value={editWeight}
                          onChangeText={setEditWeight}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      <View style={styles.editFieldRow}>
                        <Text style={[styles.editFieldLabel, { color: colors.secondaryText }]}>Reps:</Text>
                        <TextInput
                          style={[styles.editInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                          value={editReps}
                          onChangeText={setEditReps}
                          keyboardType="number-pad"
                        />
                      </View>
                      {!isWarmup && (
                        <View style={styles.editFieldRow}>
                          <Text style={[styles.editFieldLabel, { color: colors.secondaryText }]}>RIR:</Text>
                          <TextInput
                            style={[styles.editInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                            value={editRir}
                            onChangeText={setEditRir}
                            keyboardType="number-pad"
                            placeholder="—"
                            placeholderTextColor={colors.secondaryText}
                          />
                        </View>
                      )}
                      <View style={styles.editFieldRow}>
                        <Text style={[styles.editFieldLabel, { color: colors.secondaryText }]}>Notes:</Text>
                        <TextInput
                          style={[styles.editInput, styles.editNotesInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                          value={editNotes}
                          onChangeText={setEditNotes}
                          placeholder="optional"
                          placeholderTextColor={colors.secondaryText}
                        />
                      </View>
                    </View>
                    <View style={styles.editActions}>
                      <TouchableOpacity onPress={handleSaveSet}>
                        <Text style={[styles.actionLink, { color: colors.accent }]}>Save</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEditingSetId(null)}>
                        <Text style={[styles.actionLink, { color: colors.secondaryText }]}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteSet(set.id)}>
                        <Text style={[styles.actionLink, { color: colors.destructive }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }

              return (
                <TouchableOpacity
                  key={set.id}
                  style={[styles.setRow, { borderTopColor: colors.border }]}
                  onPress={() => handleStartEditSet(set)}
                >
                  <Text style={[styles.setNumber, { color: isWarmup ? colors.warmupText : colors.secondaryText }]}>
                    {isWarmup ? 'W' : `Set ${set.set_number}`}
                  </Text>
                  <Text style={[styles.setDetail, { color: isWarmup ? colors.warmupText : colors.text }]}>
                    {formatWeight(set.weight ?? 0, set.weight_unit)} x {set.reps}
                  </Text>
                  {set.estimated_rir != null && (
                    <Text style={[styles.setRir, { color: colors.secondaryText }]}>
                      RIR {set.estimated_rir}
                    </Text>
                  )}
                  {set.notes ? (
                    <Text style={[styles.setNotes, { color: colors.secondaryText }]}>
                      {set.notes}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}

          {/* Add set form for this exercise */}
          {addingSetExercise === group.name ? (
            <View style={[styles.addSetForm, { borderTopColor: colors.border }]}>
              <Text style={[styles.addSetTitle, { color: colors.text }]}>
                Add {addSetIsWarmup ? 'Warmup' : 'Set'}
              </Text>
              <View style={styles.editFields}>
                <View style={styles.editFieldRow}>
                  <Text style={[styles.editFieldLabel, { color: colors.secondaryText }]}>Weight:</Text>
                  <TextInput
                    style={[styles.editInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                    value={addSetWeight}
                    onChangeText={setAddSetWeight}
                    keyboardType="decimal-pad"
                    autoFocus
                  />
                </View>
                <View style={styles.editFieldRow}>
                  <Text style={[styles.editFieldLabel, { color: colors.secondaryText }]}>Reps:</Text>
                  <TextInput
                    style={[styles.editInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                    value={addSetReps}
                    onChangeText={setAddSetReps}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.editFieldRow}>
                  <Text style={[styles.editFieldLabel, { color: colors.secondaryText }]}>Notes:</Text>
                  <TextInput
                    style={[styles.editInput, styles.editNotesInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                    value={addSetNotes}
                    onChangeText={setAddSetNotes}
                    placeholder="optional"
                    placeholderTextColor={colors.secondaryText}
                  />
                </View>
              </View>
              <View style={styles.editActions}>
                <TouchableOpacity onPress={handleSaveNewSet}>
                  <Text style={[styles.actionLink, { color: colors.accent }]}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setAddingSetExercise(null)}>
                  <Text style={[styles.actionLink, { color: colors.secondaryText }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={[styles.addSetButtons, { borderTopColor: colors.border }]}>
              <TouchableOpacity onPress={() => handleStartAddSet(group.name, false)}>
                <Text style={[styles.addSetLink, { color: colors.accent }]}>+ Add Set</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleStartAddSet(group.name, true)}>
                <Text style={[styles.addSetLink, { color: colors.secondaryText }]}>+ Warmup</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}

      {/* Add exercise button */}
      <TouchableOpacity
        style={[styles.addExerciseButton, { backgroundColor: colors.card }]}
        onPress={() => setShowExercisePicker(true)}
      >
        <Text style={[styles.addExerciseText, { color: colors.accent }]}>+ Add Exercise</Text>
      </TouchableOpacity>

      {/* Delete workout button */}
      <TouchableOpacity
        style={[styles.deleteButton, { backgroundColor: colors.card }]}
        onPress={handleDeleteWorkout}
      >
        <Text style={[styles.deleteButtonText, { color: colors.destructive }]}>Delete Workout</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />

      <ExercisePicker
        visible={showExercisePicker}
        onSelect={handleAddExercise}
        onClose={() => setShowExercisePicker(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    margin: 16,
    borderRadius: 12,
    padding: 20,
  },
  date: { fontSize: 22, fontWeight: '700' },
  editHint: { fontSize: 13, marginTop: 2 },
  type: { fontSize: 16, marginTop: 8 },
  duration: { fontSize: 15, marginTop: 4 },
  dateInput: {
    fontSize: 18,
    fontWeight: '600',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  exerciseCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
  },
  exerciseName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  editRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  setNumber: { fontSize: 14, width: 50 },
  setDetail: { fontSize: 16, fontWeight: '600' },
  setRir: { fontSize: 13 },
  setNotes: { fontSize: 14, fontStyle: 'italic', flex: 1 },
  editFields: { gap: 8 },
  editFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editFieldLabel: {
    fontSize: 14,
    width: 55,
  },
  editInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  editNotesInput: {
    fontWeight: '400',
  },
  editActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  actionLink: {
    fontSize: 16,
    fontWeight: '600',
  },
  addSetForm: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  addSetTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  addSetButtons: {
    flexDirection: 'row',
    gap: 20,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addSetLink: {
    fontSize: 15,
    fontWeight: '600',
  },
  addExerciseButton: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  addExerciseText: {
    fontSize: 17,
    fontWeight: '600',
  },
  deleteButton: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
});
