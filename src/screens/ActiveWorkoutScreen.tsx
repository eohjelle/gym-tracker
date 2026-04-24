import { useState, useEffect, useRef } from 'react';
import { useNavigation } from '../context/NavigationContext';
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
import RestTimer, { NextSetPreview } from '../components/RestTimer';

type ViewMode = 'overview' | 'exercise' | 'set';

function getRirZones(targetRir: number) {
  return [
    { label: `< ${targetRir}`, subtitle: 'Too hard', storedValue: Math.max(0, targetRir - 1) },
    { label: `${targetRir}–${targetRir + 2}`, subtitle: 'Good', storedValue: targetRir },
    { label: `${targetRir + 3}+`, subtitle: 'Too easy', storedValue: targetRir + 3 },
  ];
}

export default function ActiveWorkoutScreen() {
  const { navigate, goBack } = useNavigation();
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

  // Free exercise state
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
      alert('Please enter a valid number of reps.');
      return;
    }
    const restSecs = currentSet.rest_seconds ?? defaultRestSeconds;

    await completeSet(currentSet.id, {
      reps,
      weight: weightInput,
      notes: notesInput || undefined,
      estimatedRir: selectedRir ?? undefined,
    });

    // Superset: advance to next exercise in group
    if (currentExercise.groupTag) {
      const groupExercises = exercises.filter((e) => e.groupTag === currentExercise.groupTag);
      const groupIndex = groupExercises.findIndex((e) => e.exerciseName === currentExercise.exerciseName);
      if (groupIndex < groupExercises.length - 1) {
        const nextInGroup = groupExercises[groupIndex + 1];
        const nextIndex = exercises.findIndex((e) => e.exerciseName === nextInGroup.exerciseName);
        if (nextIndex >= 0) {
          pendingSupersetIndex.current = nextIndex;
          setRestTimerSeconds(restSecs);
        }
        return;
      }
    }

    setRestTimerSeconds(restSecs);
  };

  const handleRestDone = () => {
    setRestTimerSeconds(null);

    if (pendingSupersetIndex.current != null) {
      setCurrentExerciseIndex(pendingSupersetIndex.current);
      setViewMode('set');
      pendingSupersetIndex.current = null;
      return;
    }

    if (!currentExercise) return;

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

    if (currentExercise.sets.some((s) => s.completed_at == null)) {
      setViewMode('set');
      return;
    }

    setViewMode('exercise');
  };

  const handleCompleteFreeSet = async () => {
    if (!pendingExercise) return;
    const reps = parseInt(freeReps, 10);
    if (isNaN(reps) || reps <= 0) {
      alert('Please enter a valid number of reps.');
      return;
    }
    await addFreeSet(pendingExercise, { reps, weight: freeWeight, notes: freeNotes || undefined });
    setFreeReps('');
    setFreeNotes('');
    setRestTimerSeconds(defaultRestSeconds);
  };

  const handleAddWarmup = async () => {
    if (!currentExercise) return;
    const reps = parseInt(warmupReps, 10);
    if (isNaN(reps) || reps <= 0) return;
    await addWarmupSet(currentExercise.exerciseName, { reps, weight: warmupWeight });
    setShowWarmupForm(false);
  };

  const handleAddSet = async () => {
    if (!currentExercise || !workout) return;
    const reps = parseInt(addSetReps, 10);
    if (isNaN(reps) || reps <= 0) {
      alert('Please enter valid reps.');
      return;
    }
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
      alert('Please enter valid numbers.');
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
    if (!window.confirm('Remove this set?')) return;
    setRepo.deleteSet(setId).then(async () => {
      if (editingSetId === setId) setEditingSetId(null);
      await reloadSets();
    });
  };

  const handleFinishWorkout = () => {
    if (!window.confirm('Are you sure you want to finish this workout?')) return;
    finishWorkout().then((workoutId) => {
      navigate({ screen: 'workoutSummary', workoutId });
    });
  };

  const handleDiscardWorkout = () => {
    if (!window.confirm('This will delete all data from this workout.')) return;
    discardWorkout().then(() => goBack());
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

  const getNextSetPreview = (): NextSetPreview | null => {
    const toPreview = (exerciseName: string, set: WorkoutSetRow): NextSetPreview => ({
      exerciseName,
      weight: set.weight ?? 0,
      weightUnit: set.weight_unit,
      isWarmup: set.is_warmup === 1,
    });

    if (pendingSupersetIndex.current != null) {
      const nextEx = exercises[pendingSupersetIndex.current];
      const nextSet = nextEx?.sets.find((s) => s.completed_at == null);
      if (nextEx && nextSet) return toPreview(nextEx.exerciseName, nextSet);
    }

    if (!currentExercise) return null;

    if (currentExercise.groupTag) {
      const groupExercises = exercises.filter((e) => e.groupTag === currentExercise.groupTag);
      for (const ge of groupExercises) {
        const nextSet = ge.sets.find((s) => s.completed_at == null);
        if (nextSet) return toPreview(ge.exerciseName, nextSet);
      }
    }

    const nextSet = currentExercise.sets.find((s) => s.completed_at == null);
    if (nextSet) return toPreview(currentExercise.exerciseName, nextSet);

    const nextIdx = exercises.findIndex((e, i) =>
      i !== currentExerciseIndex && e.sets.some((s) => s.completed_at == null)
    );
    if (nextIdx >= 0) {
      const nextEx = exercises[nextIdx];
      const next = nextEx.sets.find((s) => s.completed_at == null);
      if (next) return toPreview(nextEx.exerciseName, next);
    }

    return null;
  };

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

  const renderSetRow = (s: WorkoutSetRow) => {
    const isWarmup = s.is_warmup === 1;
    const isCompleted = s.completed_at != null;
    const isEditing = editingSetId === s.id;

    if (!isCompleted && !isEditing) {
      return (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '0.5px solid var(--border)', opacity: 0.4 }}>
          <span style={{ fontSize: 14, width: 55, color: isWarmup ? 'var(--text-secondary)' : 'var(--text-secondary)' }}>
            {isWarmup ? 'Warmup' : 'Set'}
          </span>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {formatWeight(s.weight ?? 0, s.weight_unit)} x {s.reps ?? '—'}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>planned</span>
        </div>
      );
    }

    if (isEditing) {
      return (
        <div key={s.id} style={{ borderTop: '0.5px solid var(--border)', padding: '10px 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)', width: 55 }}>Weight:</span>
              <input type="number" value={editWeight} onChange={(e) => setEditWeight(e.target.value)} style={{ flex: 1, fontSize: 16, fontWeight: 600 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)', width: 55 }}>Reps:</span>
              <input type="number" value={editReps} onChange={(e) => setEditReps(e.target.value)} style={{ flex: 1, fontSize: 16, fontWeight: 600 }} />
            </div>
            {!isWarmup && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, color: 'var(--text-secondary)', width: 55 }}>RIR:</span>
                <input type="number" value={editRir} onChange={(e) => setEditRir(e.target.value)} placeholder="—" style={{ flex: 1, fontSize: 16, fontWeight: 600 }} />
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)', width: 55 }}>Notes:</span>
              <input type="text" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="optional" style={{ flex: 1, fontSize: 16 }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <button onClick={handleSaveEditSet} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Save</button>
            <button onClick={() => setEditingSetId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Cancel</button>
            <button onClick={() => handleDeleteSet(s.id)} style={{ background: 'none', border: 'none', color: 'var(--destructive)', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Delete</button>
          </div>
        </div>
      );
    }

    return (
      <button
        key={s.id}
        onClick={() => handleStartEditSet(s)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          width: '100%',
          padding: '10px 0',
          background: 'none',
          border: 'none',
          borderTop: '0.5px solid var(--border)',
          textAlign: 'left',
          cursor: 'pointer',
          color: 'var(--text)',
        }}
      >
        <span style={{ fontSize: 14, width: 55, color: isWarmup ? 'var(--text-secondary)' : 'var(--text-secondary)' }}>
          {isWarmup ? 'Warmup' : 'Set'}
        </span>
        <span style={{ fontSize: 16, fontWeight: 600, color: isWarmup ? 'var(--text-secondary)' : 'var(--text)' }}>
          {formatWeight(s.weight ?? 0, s.weight_unit)} x {s.reps}
        </span>
        {s.estimated_rir != null && !isWarmup && (
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>RIR {s.estimated_rir}</span>
        )}
        {s.notes && (
          <span style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.notes}</span>
        )}
      </button>
    );
  };

  // === MAIN RENDER ===

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Rest timer overlay */}
      {restTimerSeconds != null && (
        <RestTimer
          initialSeconds={restTimerSeconds}
          onComplete={handleRestDone}
          onSkip={handleRestDone}
          nextPreview={getNextSetPreview()}
        />
      )}

      {/* Top bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '0.5px solid var(--border)',
        flexShrink: 0,
      }}>
        <button onClick={handleDiscardWorkout} style={{ background: 'none', border: 'none', color: 'var(--destructive)', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
          Discard
        </button>
        <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
          {elapsedTime}
        </span>
        {topBarRightLabel ? (
          <button onClick={handleTopBarRight} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
            {topBarRightLabel}
          </button>
        ) : (
          <span style={{ width: 60 }} />
        )}
      </div>

      {/* === OVERVIEW === */}
      {viewMode === 'overview' ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
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
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={() => setShowExercisePicker(true)}
              style={{
                padding: 14,
                borderRadius: 12,
                border: '2px solid var(--accent)',
                background: 'none',
                color: 'var(--accent)',
                fontSize: 17,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              + Add Exercise
            </button>
            <button
              className="btn"
              onClick={handleFinishWorkout}
              style={{ background: 'var(--destructive)', color: '#FFF', borderRadius: 12, padding: 14, fontSize: 17, fontWeight: 700 }}
            >
              End Workout
            </button>
          </div>
        </div>

      /* === PENDING FREE EXERCISE === */
      ) : pendingExercise ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>{pendingExercise}</div>
          <div style={{ fontSize: 18, marginTop: 4, color: 'var(--text-secondary)' }}>New set</div>

          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Weight</div>
            <WeightStepper value={freeWeight} increment={weightIncrement} unit={weightUnit} onChange={setFreeWeight} />
          </div>
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Reps</div>
            <input
              type="number"
              value={freeReps}
              onChange={(e) => setFreeReps(e.target.value)}
              placeholder="0"
              style={{ fontSize: 36, fontWeight: 800, textAlign: 'center', borderRadius: 12, padding: '12px 24px', minWidth: 120 }}
            />
          </div>
          <input
            type="text"
            value={freeNotes}
            onChange={(e) => setFreeNotes(e.target.value)}
            placeholder="Notes (optional)"
            style={{ width: '100%', marginTop: 12, fontSize: 16 }}
          />
          <button
            className="btn"
            onClick={handleCompleteFreeSet}
            style={{ marginTop: 16, width: '100%', background: 'var(--success)', color: '#FFF', borderRadius: 16, padding: 18, fontSize: 20, fontWeight: 800 }}
          >
            Log Set
          </button>
          <button
            onClick={() => { setPendingExercise(null); setViewMode('exercise'); }}
            style={{ marginTop: 8, padding: 10, background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}
          >
            Done with {pendingExercise}
          </button>
        </div>

      /* === EXERCISE VIEW === */
      ) : viewMode === 'exercise' && currentExercise ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>{currentExercise.exerciseName}</div>

          {progression && (
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>
              {formatProgressionReasoning(progression, weightUnit)}
            </div>
          )}
          {lastPerformance && (
            <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 12 }}>Last: {lastPerformance}</div>
          )}

          {/* Sets log */}
          {currentExercise.sets.length > 0 && (
            <div className="card" style={{ textAlign: 'left', marginTop: 12 }}>
              {currentExercise.sets.map((s) => renderSetRow(s))}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            {hasUncompletedSets && (
              <button
                className="btn"
                onClick={() => setViewMode('set')}
                style={{ width: '100%', background: 'var(--success)', color: '#FFF', borderRadius: 16, padding: 18, fontSize: 20, fontWeight: 800 }}
              >
                {isCurrentSetWarmup
                  ? `Log Warmup ${completedWarmupSets.length + 1} of ${warmupSets.length}`
                  : `Log Set ${completedWorkingSets.length + 1} of ${workingSets.length}`}
              </button>
            )}

            {/* Add warmup */}
            {showWarmupForm ? (
              <div className="card" style={{ textAlign: 'left', marginTop: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Add Warmup Set</div>
                <WeightStepper value={warmupWeight} increment={weightIncrement} unit={weightUnit} onChange={setWarmupWeight} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Reps:</span>
                  <input
                    type="number"
                    value={warmupReps}
                    onChange={(e) => setWarmupReps(e.target.value)}
                    style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', minWidth: 60, borderRadius: 8, padding: '6px 16px' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                  <button onClick={handleAddWarmup} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Log Warmup</button>
                  <button onClick={() => setShowWarmupForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setWarmupWeight(0); setWarmupReps('5'); setShowWarmupForm(true); setShowAddSetForm(false); }}
                style={{ marginTop: 8, padding: 10, background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}
              >
                + Add Warmup
              </button>
            )}

            {/* Add set */}
            {showAddSetForm ? (
              <div className="card" style={{ textAlign: 'left', marginTop: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Add Set</div>
                <WeightStepper value={addSetWeight} increment={weightIncrement} unit={weightUnit} onChange={setAddSetWeight} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Reps:</span>
                  <input
                    type="number"
                    value={addSetReps}
                    onChange={(e) => setAddSetReps(e.target.value)}
                    style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', minWidth: 60, borderRadius: 8, padding: '6px 16px' }}
                  />
                </div>
                <input
                  type="text"
                  value={addSetNotes}
                  onChange={(e) => setAddSetNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  style={{ width: '100%', marginTop: 12, fontSize: 16 }}
                />
                <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                  <button onClick={handleAddSet} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Log Set</button>
                  <button onClick={() => setShowAddSetForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setAddSetWeight(currentSet?.weight ?? completedSets[completedSets.length - 1]?.weight ?? 0);
                  setAddSetReps('');
                  setAddSetNotes('');
                  setShowAddSetForm(true);
                  setShowWarmupForm(false);
                }}
                style={{ marginTop: 8, padding: 10, background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}
              >
                + Add Set
              </button>
            )}

            {!hasUncompletedSets && (() => {
              const nextIdx = exercises.findIndex((e, i) =>
                i !== currentExerciseIndex && e.sets.some((s) => s.completed_at == null)
              );
              if (nextIdx >= 0) {
                return (
                  <button
                    className="btn btn-accent"
                    onClick={() => {
                      setCurrentExerciseIndex(nextIdx);
                      setViewMode('exercise');
                      setEditingSetId(null);
                      setShowWarmupForm(false);
                      setShowAddSetForm(false);
                    }}
                    style={{ width: '100%', marginTop: 8 }}
                  >
                    Next Exercise
                  </button>
                );
              }
              return (
                <button
                  className="btn btn-accent"
                  onClick={handleFinishWorkout}
                  style={{ width: '100%', marginTop: 8 }}
                >
                  End Workout
                </button>
              );
            })()}
          </div>
        </div>

      /* === SET VIEW === */
      ) : viewMode === 'set' && currentExercise && currentSet ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>{currentExercise.exerciseName}</div>
          <div style={{ fontSize: 18, marginTop: 4, color: isCurrentSetWarmup ? 'var(--accent)' : 'var(--text-secondary)' }}>
            {isCurrentSetWarmup
              ? `Warmup ${completedWarmupSets.length + 1} of ${warmupSets.length}`
              : `Set ${completedWorkingSets.length + 1} of ${workingSets.length}`}
            {!isCurrentSetWarmup && targetRir != null ? `  ·  Target RIR: ${targetRir}` : ''}
          </div>

          {progression && !isCurrentSetWarmup && (
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>
              {formatProgressionReasoning(progression, weightUnit)}
            </div>
          )}

          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Weight</div>
            <WeightStepper value={weightInput} increment={weightIncrement} unit={weightUnit} onChange={setWeightInput} />
          </div>
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Reps</div>
            <input
              type="number"
              value={repsInput}
              onChange={(e) => setRepsInput(e.target.value)}
              placeholder="0"
              style={{ fontSize: 36, fontWeight: 800, textAlign: 'center', borderRadius: 12, padding: '12px 24px', minWidth: 120 }}
            />
          </div>

          {/* RIR zone picker */}
          {isProgramWorkout && targetRir != null && !isCurrentSetWarmup && (
            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>How did it feel?</div>
              <div style={{ display: 'flex', gap: 10 }}>
                {getRirZones(targetRir).map((zone) => (
                  <button
                    key={zone.label}
                    onClick={() => setSelectedRir(zone.storedValue)}
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      padding: 12,
                      border: 'none',
                      background: selectedRir === zone.storedValue ? 'var(--accent)' : 'var(--input-bg)',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 700, color: selectedRir === zone.storedValue ? '#FFF' : 'var(--text)' }}>
                      {zone.subtitle}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 2, color: selectedRir === zone.storedValue ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)' }}>
                      RIR {zone.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <input
            type="text"
            value={notesInput}
            onChange={(e) => setNotesInput(e.target.value)}
            placeholder="Notes (optional)"
            style={{ width: '100%', marginTop: 12, fontSize: 16 }}
          />
          <button
            className="btn"
            onClick={handleCompleteSet}
            style={{ marginTop: 16, width: '100%', background: 'var(--success)', color: '#FFF', borderRadius: 16, padding: 18, fontSize: 20, fontWeight: 800 }}
          >
            Done
          </button>
        </div>

      /* === EMPTY STATE === */
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 24, textAlign: 'center' }}>
            Add an exercise to get started
          </div>
          <button
            onClick={() => setShowExercisePicker(true)}
            style={{
              padding: 14,
              borderRadius: 12,
              border: '2px solid var(--accent)',
              background: 'none',
              color: 'var(--accent)',
              fontSize: 17,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + Add Exercise
          </button>
        </div>
      )}

      <ExercisePicker
        visible={showExercisePicker}
        onSelect={handleSelectExercise}
        onClose={() => setShowExercisePicker(false)}
      />
    </div>
  );
}
