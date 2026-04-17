import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useActiveWorkout, ExerciseGroup } from '../context/ActiveWorkoutContext';
import { useSettings } from '../context/SettingsContext';
import { formatDuration, formatWeight } from '../utils/formatters';
import { getExerciseHistory } from '../db/repositories/setRepository';
import * as setRepo from '../db/repositories/setRepository';
import { WorkoutSetRow } from '../db/types';
import { formatProgressionReasoning } from '../services/progressionService';
import WeightStepper from '../components/WeightStepper';
import WorkoutOverview from '../components/WorkoutOverview';
import ExercisePicker from '../components/ExercisePicker';
import RestTimer from '../components/RestTimer';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type ViewMode = 'overview' | 'exercise' | 'set';

/** Build the 3 RIR zone options based on the exercise's target RIR. */
function getRirZones(targetRir: number) {
  return [
    { label: `< ${targetRir}`, subtitle: 'Too hard', storedValue: Math.max(0, targetRir - 1) },
    { label: `${targetRir}–${targetRir + 2}`, subtitle: 'Good', storedValue: targetRir },
    { label: `${targetRir + 3}+`, subtitle: 'Too easy', storedValue: targetRir + 3 },
  ];
}

export default function ActiveWorkoutScreen() {
  const navigation = useNavigation<NavProp>();
  const {
    workout,
    exercises,
    sets,
    currentExerciseIndex,
    setCurrentExerciseIndex,
    completeSet,
    addFreeExercise,
    addFreeSet,
    addWarmupSet,
    reloadSets,
    finishWorkout,
    discardWorkout,
    pendingExercise,
    setPendingExercise,
  } = useActiveWorkout();
  const { weightUnit, weightIncrement, defaultRestSeconds } = useSettings();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [viewMode, setViewMode] = useState<ViewMode>('exercise');
  const pendingSupersetIndex = useRef<number | null>(null);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('0:00');
  const [restTimerSeconds, setRestTimerSeconds] = useState<number | null>(null);

  // Set view state
  const [repsInput, setRepsInput] = useState('');
  const [weightInput, setWeightInput] = useState(0);
  const [notesInput, setNotesInput] = useState('');
  const [selectedRir, setSelectedRir] = useState<number | null>(null);
  const [lastPerformance, setLastPerformance] = useState<string | null>(null);

  // Exercise view: editing a set
  const [editingSetId, setEditingSetId] = useState<number | null>(null);
  const [editReps, setEditReps] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editRir, setEditRir] = useState('');

  // Exercise view: adding a warmup
  const [showWarmupForm, setShowWarmupForm] = useState(false);
  const [warmupReps, setWarmupReps] = useState('5');
  const [warmupWeight, setWarmupWeight] = useState(0);

  // Exercise view: adding a free set
  const [showAddSetForm, setShowAddSetForm] = useState(false);
  const [addSetReps, setAddSetReps] = useState('');
  const [addSetWeight, setAddSetWeight] = useState(0);
  const [addSetNotes, setAddSetNotes] = useState('');

  // Free exercise state (pendingExercise flow)
  const [freeReps, setFreeReps] = useState('');
  const [freeWeight, setFreeWeight] = useState(0);
  const [freeNotes, setFreeNotes] = useState('');

  // Elapsed time timer
  useEffect(() => {
    if (!workout) return;
    const interval = setInterval(() => {
      setElapsedTime(formatDuration(workout.start_time, null));
    }, 1000);
    return () => clearInterval(interval);
  }, [workout]);

  // Derived state
  const currentExercise: ExerciseGroup | null = exercises[currentExerciseIndex] ?? null;
  const currentSet: WorkoutSetRow | null = currentExercise
    ? currentExercise.sets.find((s) => s.completed_at == null) ?? null
    : null;
  const targetRir = currentExercise?.programExercise?.target_rir;
  const progression = currentExercise?.progression;
  const isProgramWorkout = workout?.type === 'program';
  const isCurrentSetWarmup = currentSet?.is_warmup === 1;

  const workingSets = currentExercise?.sets.filter((s) => s.is_warmup === 0) ?? [];
  const warmupSets = currentExercise?.sets.filter((s) => s.is_warmup === 1) ?? [];
  const completedWorkingSets = workingSets.filter((s) => s.completed_at != null);
  const completedWarmupSets = warmupSets.filter((s) => s.completed_at != null);
  const completedSets = currentExercise?.sets.filter((s) => s.completed_at != null) ?? [];
  const hasUncompletedSets = currentSet != null;

  // Load defaults when current set changes
  useEffect(() => {
    if (currentSet) {
      setRepsInput(currentSet.reps != null ? String(currentSet.reps) : '');
      setWeightInput(currentSet.weight ?? 0);
      setNotesInput('');
      setSelectedRir(currentSet.estimated_rir);
    }
  }, [currentSet?.id]);

  // Load last performance
  useEffect(() => {
    if (!currentExercise) {
      setLastPerformance(null);
      return;
    }
    getExerciseHistory(currentExercise.exerciseName, 1).then((history) => {
      if (history.length > 0 && history[0].sets.length > 0) {
        const best = history[0].sets
          .map((s) => `${formatWeight(s.weight ?? 0, s.weight_unit)} x ${s.reps}`)
          .join(', ');
        setLastPerformance(best);
      } else {
        setLastPerformance(null);
      }
    });
  }, [currentExercise?.exerciseName]);

  // === HANDLERS ===

  const handleCompleteSet = async () => {
    if (!currentSet || !currentExercise) return;
    const reps = parseInt(repsInput, 10);
    if (isNaN(reps) || reps <= 0) {
      Alert.alert('Invalid reps', 'Please enter a valid number of reps.');
      return;
    }
    const restSecs = currentSet.rest_seconds ?? defaultRestSeconds;
    Keyboard.dismiss();

    await completeSet(currentSet.id, {
      reps,
      weight: weightInput,
      notes: notesInput || undefined,
      estimatedRir: selectedRir ?? undefined,
    });

    // Superset: advance to next exercise in group with short rest
    if (currentExercise.groupTag) {
      const groupExercises = exercises.filter((e) => e.groupTag === currentExercise.groupTag);
      const groupIndex = groupExercises.findIndex((e) => e.exerciseName === currentExercise.exerciseName);
      if (groupIndex < groupExercises.length - 1) {
        const nextInGroup = groupExercises[groupIndex + 1];
        const nextIndex = exercises.findIndex((e) => e.exerciseName === nextInGroup.exerciseName);
        if (nextIndex >= 0) {
          // Use the current exercise's rest time from the program
          pendingSupersetIndex.current = nextIndex;
          setRestTimerSeconds(restSecs);
        }
        return;
      }
    }

    // Start full rest timer
    setRestTimerSeconds(restSecs);
  };

  const handleRestDone = () => {
    setRestTimerSeconds(null);

    // If we're transitioning to the next superset exercise
    if (pendingSupersetIndex.current != null) {
      setCurrentExerciseIndex(pendingSupersetIndex.current);
      setViewMode('set');
      pendingSupersetIndex.current = null;
      return;
    }

    if (!currentExercise) return;

    // For supersets: after full rest, find next exercise in group with uncompleted sets
    if (currentExercise.groupTag) {
      const groupExercises = exercises.filter((e) => e.groupTag === currentExercise.groupTag);
      for (const ge of groupExercises) {
        if (ge.sets.some((s) => s.completed_at == null)) {
          const idx = exercises.findIndex((e) => e.exerciseName === ge.exerciseName);
          if (idx >= 0) {
            setCurrentExerciseIndex(idx);
            setViewMode('set');
            return;
          }
        }
      }
    }

    // If current exercise has more uncompleted sets, stay in set view
    if (currentExercise.sets.some((s) => s.completed_at == null)) {
      setViewMode('set');
      return;
    }

    // Exercise done — go to exercise view
    setViewMode('exercise');
  };

  const handleCompleteFreeSet = async () => {
    if (!pendingExercise) return;
    const reps = parseInt(freeReps, 10);
    if (isNaN(reps) || reps <= 0) {
      Alert.alert('Invalid reps', 'Please enter a valid number of reps.');
      return;
    }
    Keyboard.dismiss();
    await addFreeSet(pendingExercise, { reps, weight: freeWeight, notes: freeNotes || undefined });
    setFreeReps('');
    setFreeNotes('');
    setRestTimerSeconds(defaultRestSeconds);
  };

  const handleAddWarmup = async () => {
    if (!currentExercise) return;
    const reps = parseInt(warmupReps, 10);
    if (isNaN(reps) || reps <= 0) return;
    Keyboard.dismiss();
    await addWarmupSet(currentExercise.exerciseName, { reps, weight: warmupWeight });
    setShowWarmupForm(false);
  };

  const handleAddSet = async () => {
    if (!currentExercise || !workout) return;
    const reps = parseInt(addSetReps, 10);
    if (isNaN(reps) || reps <= 0) {
      Alert.alert('Invalid reps', 'Please enter valid reps.');
      return;
    }
    Keyboard.dismiss();
    await addFreeSet(currentExercise.exerciseName, {
      reps,
      weight: addSetWeight,
      notes: addSetNotes || undefined,
    });
    setShowAddSetForm(false);
    setAddSetReps('');
    setAddSetNotes('');
  };

  const handleStartEditSet = (set: WorkoutSetRow) => {
    setEditingSetId(set.id);
    setEditReps(String(set.reps ?? ''));
    setEditWeight(String(set.weight ?? ''));
    setEditNotes(set.notes ?? '');
    setEditRir(set.estimated_rir != null ? String(set.estimated_rir) : '');
  };

  const handleSaveEditSet = async () => {
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
    await reloadSets();
  };

  const handleDeleteSet = (setId: number) => {
    Alert.alert('Delete Set', 'Remove this set?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await setRepo.deleteSet(setId);
          if (editingSetId === setId) setEditingSetId(null);
          await reloadSets();
        },
      },
    ]);
  };

  const handleFinishWorkout = () => {
    Alert.alert('End Workout', 'Are you sure you want to finish this workout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Workout',
        style: 'destructive',
        onPress: async () => {
          const workoutId = await finishWorkout();
          navigation.replace('WorkoutSummary', { workoutId });
        },
      },
    ]);
  };

  const handleDiscardWorkout = () => {
    Alert.alert('Discard Workout', 'This will delete all data from this workout.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await discardWorkout();
          navigation.goBack();
        },
      },
    ]);
  };

  const handleSelectExercise = (name: string) => {
    setShowExercisePicker(false);
    addFreeExercise(name);
    setFreeReps('');
    setFreeWeight(0);
    setFreeNotes('');
    getExerciseHistory(name, 1).then((history) => {
      if (history.length > 0 && history[0].sets.length > 0) {
        setFreeWeight(history[0].sets[0].weight ?? 0);
      }
    });
  };

  if (!workout) return null;

  const colors = {
    bg: isDark ? '#000' : '#F2F2F7',
    card: isDark ? '#1C1C1E' : '#FFF',
    text: isDark ? '#FFF' : '#000',
    secondaryText: isDark ? '#8E8E93' : '#6C6C70',
    accent: '#007AFF',
    border: isDark ? '#38383A' : '#E5E5EA',
    destructive: '#FF3B30',
    inputBg: isDark ? '#2C2C2E' : '#E5E5EA',
    done: '#34C759',
    warmupText: isDark ? '#636366' : '#AEAEB2',
  };

  // Top bar right button label
  const topBarRightLabel =
    viewMode === 'set' ? 'Exercise' :
    viewMode === 'exercise' ? 'Overview' :
    currentExercise ? 'Exercise' : '';

  const handleTopBarRight = () => {
    if (viewMode === 'set') setViewMode('exercise');
    else if (viewMode === 'exercise') setViewMode('overview');
    else if (viewMode === 'overview' && currentExercise) setViewMode('exercise');
  };

  // === RENDER HELPERS ===

  const renderSetRow = (s: WorkoutSetRow, opts?: { showPlanned?: boolean }) => {
    const isWarmup = s.is_warmup === 1;
    const isCompleted = s.completed_at != null;
    const isEditing = editingSetId === s.id;

    // Planned (uncompleted) set — show as dimmed row
    if (!isCompleted && !isEditing) {
      return (
        <View key={s.id} style={[styles.completedSetRow, { borderTopColor: colors.border, opacity: 0.4 }]}>
          <Text style={[styles.completedSetLabel, { color: isWarmup ? colors.warmupText : colors.secondaryText }]}>
            {isWarmup ? 'Warmup' : 'Set'}
          </Text>
          <Text style={[styles.completedSetDetail, { color: colors.secondaryText }]}>
            {formatWeight(s.weight ?? 0, s.weight_unit)} x {s.reps ?? '—'}
          </Text>
          <Text style={[styles.completedSetRir, { color: colors.secondaryText }]}>planned</Text>
        </View>
      );
    }

    if (isEditing) {
      return (
        <View key={s.id} style={[styles.editRow, { borderTopColor: colors.border }]}>
          <View style={styles.editFields}>
            <View style={styles.editFieldRow}>
              <Text style={[styles.editFieldLabel, { color: colors.secondaryText }]}>Weight:</Text>
              <TextInput
                style={[styles.editInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                value={editWeight} onChangeText={setEditWeight} keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.editFieldRow}>
              <Text style={[styles.editFieldLabel, { color: colors.secondaryText }]}>Reps:</Text>
              <TextInput
                style={[styles.editInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                value={editReps} onChangeText={setEditReps} keyboardType="number-pad"
              />
            </View>
            {!isWarmup && (
              <View style={styles.editFieldRow}>
                <Text style={[styles.editFieldLabel, { color: colors.secondaryText }]}>RIR:</Text>
                <TextInput
                  style={[styles.editInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                  value={editRir} onChangeText={setEditRir} keyboardType="number-pad"
                  placeholder="—" placeholderTextColor={colors.secondaryText}
                />
              </View>
            )}
            <View style={styles.editFieldRow}>
              <Text style={[styles.editFieldLabel, { color: colors.secondaryText }]}>Notes:</Text>
              <TextInput
                style={[styles.editInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                value={editNotes} onChangeText={setEditNotes}
                placeholder="optional" placeholderTextColor={colors.secondaryText}
              />
            </View>
          </View>
          <View style={styles.editActions}>
            <TouchableOpacity onPress={handleSaveEditSet}>
              <Text style={[styles.actionLink, { color: colors.accent }]}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingSetId(null)}>
              <Text style={[styles.actionLink, { color: colors.secondaryText }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteSet(s.id)}>
              <Text style={[styles.actionLink, { color: colors.destructive }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <TouchableOpacity
        key={s.id}
        style={[styles.completedSetRow, { borderTopColor: colors.border }]}
        onPress={() => handleStartEditSet(s)}
      >
        <Text style={[styles.completedSetLabel, { color: isWarmup ? colors.warmupText : colors.secondaryText }]}>
          {isWarmup ? 'Warmup' : 'Set'}
        </Text>
        <Text style={[styles.completedSetDetail, { color: isWarmup ? colors.warmupText : colors.text }]}>
          {formatWeight(s.weight ?? 0, s.weight_unit)} x {s.reps}
        </Text>
        {s.estimated_rir != null && !isWarmup && (
          <Text style={[styles.completedSetRir, { color: colors.secondaryText }]}>
            RIR {s.estimated_rir}
          </Text>
        )}
        {s.notes ? (
          <Text style={[styles.completedSetNotes, { color: colors.secondaryText }]} numberOfLines={1}>
            {s.notes}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  // === MAIN RENDER ===

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Rest timer overlay */}
      {restTimerSeconds != null && (
        <RestTimer
          initialSeconds={restTimerSeconds}
          onComplete={handleRestDone}
          onSkip={handleRestDone}
        />
      )}

      {/* Top bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleDiscardWorkout}>
          <Text style={[styles.topBarButton, { color: colors.destructive }]}>Discard</Text>
        </TouchableOpacity>
        <Text style={[styles.elapsed, { color: colors.text }]}>{elapsedTime}</Text>
        {topBarRightLabel ? (
          <TouchableOpacity onPress={handleTopBarRight}>
            <Text style={[styles.topBarButton, { color: colors.accent }]}>{topBarRightLabel}</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 60 }} />}
      </View>

      {/* === OVERVIEW === */}
      {viewMode === 'overview' ? (
        <View style={styles.flex}>
          <WorkoutOverview
            exercises={exercises}
            currentIndex={currentExerciseIndex}
            onSelectExercise={(idx) => {
              setCurrentExerciseIndex(idx);
              setViewMode('exercise');
              setEditingSetId(null);
              setShowWarmupForm(false);
              setShowAddSetForm(false);
            }}
            weightUnit={weightUnit}
          />
          <View style={styles.overviewButtons}>
            <TouchableOpacity
              style={[styles.outlineButton, { borderColor: colors.accent }]}
              onPress={() => setShowExercisePicker(true)}
            >
              <Text style={[styles.outlineButtonText, { color: colors.accent }]}>+ Add Exercise</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filledButton, { backgroundColor: colors.destructive }]}
              onPress={handleFinishWorkout}
            >
              <Text style={styles.filledButtonText}>End Workout</Text>
            </TouchableOpacity>
          </View>
        </View>

      /* === PENDING FREE EXERCISE === */
      ) : pendingExercise ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.centeredContent} keyboardShouldPersistTaps="handled">
            <Text style={[styles.exerciseName, { color: colors.text }]}>{pendingExercise}</Text>
            <Text style={[styles.subtitle, { color: colors.secondaryText }]}>New set</Text>

            <View style={styles.inputSection}>
              <Text style={[styles.inputLabel, { color: colors.secondaryText }]}>Weight</Text>
              <WeightStepper value={freeWeight} increment={weightIncrement} unit={weightUnit} onChange={setFreeWeight} />
            </View>
            <View style={styles.inputSection}>
              <Text style={[styles.inputLabel, { color: colors.secondaryText }]}>Reps</Text>
              <TextInput
                style={[styles.repsInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                value={freeReps} onChangeText={setFreeReps} keyboardType="number-pad"
                placeholder="0" placeholderTextColor={colors.secondaryText}
              />
            </View>
            <TextInput
              style={[styles.notesInput, { color: colors.text, backgroundColor: colors.inputBg }]}
              value={freeNotes} onChangeText={setFreeNotes}
              placeholder="Notes (optional)" placeholderTextColor={colors.secondaryText}
            />
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.done }]} onPress={handleCompleteFreeSet}>
              <Text style={styles.primaryButtonText}>Log Set</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.textButton} onPress={() => { setPendingExercise(null); setViewMode('exercise'); }}>
              <Text style={[styles.textButtonLabel, { color: colors.accent }]}>Done with {pendingExercise}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>

      /* === EXERCISE VIEW === */
      ) : viewMode === 'exercise' && currentExercise ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.exerciseViewContent} keyboardShouldPersistTaps="handled">
          <Text style={[styles.exerciseName, { color: colors.text }]}>{currentExercise.exerciseName}</Text>

          {progression && (
            <Text style={[styles.progressionHint, { color: colors.accent }]}>
              {formatProgressionReasoning(progression, weightUnit)}
            </Text>
          )}
          {lastPerformance && (
            <Text style={[styles.lastPerf, { color: colors.secondaryText }]}>Last: {lastPerformance}</Text>
          )}

          {/* Sets log — completed + planned */}
          {currentExercise.sets.length > 0 && (
            <View style={[styles.setsCard, { backgroundColor: colors.card }]}>
              {currentExercise.sets.map((s) => renderSetRow(s))}
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.exerciseActions}>
            {/* Log Next Set — prominent, only if uncompleted sets exist */}
            {hasUncompletedSets && (
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.done }]}
                onPress={() => setViewMode('set')}
              >
                <Text style={styles.primaryButtonText}>
                  {isCurrentSetWarmup
                    ? `Log Warmup ${completedWarmupSets.length + 1} of ${warmupSets.length}`
                    : `Log Set ${completedWorkingSets.length + 1} of ${workingSets.length}`}
                </Text>
              </TouchableOpacity>
            )}

            {/* Add warmup */}
            {showWarmupForm ? (
              <View style={[styles.inlineForm, { backgroundColor: colors.card }]}>
                <Text style={[styles.inlineFormTitle, { color: colors.text }]}>Add Warmup Set</Text>
                <WeightStepper value={warmupWeight} increment={weightIncrement} unit={weightUnit} onChange={setWarmupWeight} />
                <View style={styles.inlineFormRow}>
                  <Text style={[styles.inlineFormLabel, { color: colors.secondaryText }]}>Reps:</Text>
                  <TextInput
                    style={[styles.inlineFormInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                    value={warmupReps} onChangeText={setWarmupReps} keyboardType="number-pad"
                    returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()}
                  />
                </View>
                <View style={styles.inlineFormActions}>
                  <TouchableOpacity onPress={handleAddWarmup}>
                    <Text style={[styles.actionLink, { color: colors.accent }]}>Log Warmup</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowWarmupForm(false)}>
                    <Text style={[styles.actionLink, { color: colors.secondaryText }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.textButton}
                onPress={() => { setWarmupWeight(0); setWarmupReps('5'); setShowWarmupForm(true); setShowAddSetForm(false); }}
              >
                <Text style={[styles.textButtonLabel, { color: colors.secondaryText }]}>+ Add Warmup</Text>
              </TouchableOpacity>
            )}

            {/* Add set */}
            {showAddSetForm ? (
              <View style={[styles.inlineForm, { backgroundColor: colors.card }]}>
                <Text style={[styles.inlineFormTitle, { color: colors.text }]}>Add Set</Text>
                <WeightStepper value={addSetWeight} increment={weightIncrement} unit={weightUnit} onChange={setAddSetWeight} />
                <View style={styles.inlineFormRow}>
                  <Text style={[styles.inlineFormLabel, { color: colors.secondaryText }]}>Reps:</Text>
                  <TextInput
                    style={[styles.inlineFormInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                    value={addSetReps} onChangeText={setAddSetReps} keyboardType="number-pad"
                    returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()}
                  />
                </View>
                <TextInput
                  style={[styles.notesInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                  value={addSetNotes} onChangeText={setAddSetNotes}
                  placeholder="Notes (optional)" placeholderTextColor={colors.secondaryText}
                  returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()}
                />
                <View style={styles.inlineFormActions}>
                  <TouchableOpacity onPress={handleAddSet}>
                    <Text style={[styles.actionLink, { color: colors.accent }]}>Log Set</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowAddSetForm(false)}>
                    <Text style={[styles.actionLink, { color: colors.secondaryText }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.textButton}
                onPress={() => {
                  setAddSetWeight(currentSet?.weight ?? completedSets[completedSets.length - 1]?.weight ?? 0);
                  setAddSetReps('');
                  setAddSetNotes('');
                  setShowAddSetForm(true);
                  setShowWarmupForm(false);
                }}
              >
                <Text style={[styles.textButtonLabel, { color: colors.secondaryText }]}>+ Add Set</Text>
              </TouchableOpacity>
            )}

            {!hasUncompletedSets && (() => {
              // Find next exercise with uncompleted sets
              const nextIdx = exercises.findIndex((e, i) =>
                i !== currentExerciseIndex && e.sets.some((s) => s.completed_at == null)
              );
              if (nextIdx >= 0) {
                return (
                  <TouchableOpacity
                    style={[styles.primaryButton, { backgroundColor: colors.accent, marginTop: 8 }]}
                    onPress={() => {
                      setCurrentExerciseIndex(nextIdx);
                      setViewMode('exercise');
                      setEditingSetId(null);
                      setShowWarmupForm(false);
                      setShowAddSetForm(false);
                    }}
                  >
                    <Text style={styles.primaryButtonText}>Next Exercise</Text>
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  style={[styles.filledButton, { backgroundColor: colors.accent, marginTop: 8 }]}
                  onPress={handleFinishWorkout}
                >
                  <Text style={styles.filledButtonText}>End Workout</Text>
                </TouchableOpacity>
              );
            })()}
          </View>
        </ScrollView>
        </KeyboardAvoidingView>

      /* === SET VIEW === */
      ) : viewMode === 'set' && currentExercise && currentSet ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.centeredContent} keyboardShouldPersistTaps="handled">
            <Text style={[styles.exerciseName, { color: colors.text }]}>{currentExercise.exerciseName}</Text>
            <Text style={[styles.subtitle, { color: isCurrentSetWarmup ? colors.accent : colors.secondaryText }]}>
              {isCurrentSetWarmup
                ? `Warmup ${completedWarmupSets.length + 1} of ${warmupSets.length}`
                : `Set ${completedWorkingSets.length + 1} of ${workingSets.length}`}
              {!isCurrentSetWarmup && targetRir != null ? `  ·  Target RIR: ${targetRir}` : ''}
            </Text>

            {progression && !isCurrentSetWarmup && (
              <Text style={[styles.progressionHint, { color: colors.accent }]}>
                {formatProgressionReasoning(progression, weightUnit)}
              </Text>
            )}

            <View style={styles.inputSection}>
              <Text style={[styles.inputLabel, { color: colors.secondaryText }]}>Weight</Text>
              <WeightStepper value={weightInput} increment={weightIncrement} unit={weightUnit} onChange={setWeightInput} />
            </View>
            <View style={styles.inputSection}>
              <Text style={[styles.inputLabel, { color: colors.secondaryText }]}>Reps</Text>
              <TextInput
                style={[styles.repsInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                value={repsInput} onChangeText={setRepsInput} keyboardType="number-pad"
                placeholder="0" placeholderTextColor={colors.secondaryText}
              />
            </View>

            {/* RIR zone picker for working sets */}
            {isProgramWorkout && targetRir != null && !isCurrentSetWarmup && (
              <View style={styles.inputSection}>
                <Text style={[styles.inputLabel, { color: colors.secondaryText }]}>How did it feel?</Text>
                <View style={styles.rirRow}>
                  {getRirZones(targetRir).map((zone) => (
                    <TouchableOpacity
                      key={zone.label}
                      style={[
                        styles.rirZoneButton, { backgroundColor: colors.inputBg },
                        selectedRir === zone.storedValue && { backgroundColor: colors.accent },
                      ]}
                      onPress={() => setSelectedRir(zone.storedValue)}
                    >
                      <Text style={[styles.rirZoneLabel, { color: selectedRir === zone.storedValue ? '#FFF' : colors.text }]}>
                        {zone.subtitle}
                      </Text>
                      <Text style={[styles.rirZoneValue, { color: selectedRir === zone.storedValue ? 'rgba(255,255,255,0.7)' : colors.secondaryText }]}>
                        RIR {zone.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <TextInput
              style={[styles.notesInput, { color: colors.text, backgroundColor: colors.inputBg }]}
              value={notesInput} onChangeText={setNotesInput}
              placeholder="Notes (optional)" placeholderTextColor={colors.secondaryText}
            />
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.done }]} onPress={handleCompleteSet}>
              <Text style={styles.primaryButtonText}>Done</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>

      /* === EMPTY STATE === */
      ) : (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Add an exercise to get started</Text>
          <TouchableOpacity
            style={[styles.outlineButton, { borderColor: colors.accent }]}
            onPress={() => setShowExercisePicker(true)}
          >
            <Text style={[styles.outlineButtonText, { color: colors.accent }]}>+ Add Exercise</Text>
          </TouchableOpacity>
        </View>
      )}

      <ExercisePicker
        visible={showExercisePicker}
        onSelect={handleSelectExercise}
        onClose={() => setShowExercisePicker(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarButton: { fontSize: 16, fontWeight: '600' },
  elapsed: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // Shared
  exerciseName: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 18, marginTop: 4, marginBottom: 4 },
  progressionHint: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  lastPerf: { fontSize: 15, marginBottom: 12 },
  inputSection: { width: '100%', marginTop: 24, alignItems: 'center' },
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  repsInput: { fontSize: 36, fontWeight: '800', textAlign: 'center', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, minWidth: 120 },
  notesInput: { width: '100%', marginTop: 12, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },

  // Buttons
  primaryButton: { marginTop: 16, borderRadius: 16, paddingVertical: 18, paddingHorizontal: 40, alignItems: 'center', width: '100%' },
  primaryButtonText: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  outlineButton: { borderWidth: 2, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center' },
  outlineButtonText: { fontSize: 17, fontWeight: '700' },
  filledButton: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center' },
  filledButtonText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  textButton: { marginTop: 8, padding: 10 },
  textButtonLabel: { fontSize: 16, fontWeight: '600' },

  // Overview
  overviewButtons: { padding: 16, gap: 12 },

  // Centered content (set view, free exercise)
  centeredContent: { padding: 24, alignItems: 'center' },

  // Exercise view
  exerciseViewContent: { padding: 20, alignItems: 'center' },
  setsCard: { width: '100%', borderRadius: 12, padding: 12, marginTop: 12 },
  exerciseActions: { width: '100%', marginTop: 16, alignItems: 'center' },

  // Completed set rows
  completedSetRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  completedSetLabel: { fontSize: 14, width: 55 },
  completedSetDetail: { fontSize: 16, fontWeight: '600' },
  completedSetRir: { fontSize: 13 },
  completedSetNotes: { fontSize: 13, fontStyle: 'italic', flex: 1 },

  // Edit set inline
  editRow: {
    paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 8,
  },
  editFields: { gap: 8 },
  editFieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editFieldLabel: { fontSize: 14, width: 55 },
  editInput: { flex: 1, fontSize: 16, fontWeight: '600', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  editActions: { flexDirection: 'row', gap: 16, marginTop: 4 },
  actionLink: { fontSize: 16, fontWeight: '600' },

  // Inline forms (add warmup, add set)
  inlineForm: { width: '100%', borderRadius: 12, padding: 16, marginTop: 8, gap: 12 },
  inlineFormTitle: { fontSize: 16, fontWeight: '700' },
  inlineFormRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inlineFormLabel: { fontSize: 14, fontWeight: '600' },
  inlineFormInput: { fontSize: 20, fontWeight: '700', textAlign: 'center', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 6, minWidth: 60 },
  inlineFormActions: { flexDirection: 'row', gap: 16 },

  // RIR picker
  rirRow: { flexDirection: 'row', gap: 10 },
  rirZoneButton: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  rirZoneLabel: { fontSize: 16, fontWeight: '700' },
  rirZoneValue: { fontSize: 12, marginTop: 2 },

  // Empty state
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle: { fontSize: 22, fontWeight: '700', marginBottom: 24, textAlign: 'center' },
});
