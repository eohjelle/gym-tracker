import { useEffect, useState } from 'react';
import { useNavigation } from '../context/NavigationContext';
import { WorkoutWithSets } from '../db/repositories/workoutRepository';
import * as workoutRepo from '../db/repositories/workoutRepository';
import * as setRepo from '../db/repositories/setRepository';
import { WorkoutSetRow } from '../db/types';
import { formatDuration, formatDate, formatWeight } from '../utils/formatters';
import ExercisePicker from '../components/ExercisePicker';

export default function WorkoutDetailScreen({ workoutId }: { workoutId: number }) {
  const { goBack } = useNavigation();

  const [workout, setWorkout] = useState<WorkoutWithSets | null>(null);
  const [editingSetId, setEditingSetId] = useState<number | null>(null);
  const [editReps, setEditReps] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editRir, setEditRir] = useState('');
  const [editingDate, setEditingDate] = useState(false);
  const [dateInput, setDateInput] = useState('');
  const [showExercisePicker, setShowExercisePicker] = useState(false);

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
    await loadWorkout();
  };

  const handleDeleteSet = async (setId: number) => {
    if (!window.confirm('Remove this set?')) return;
    await setRepo.deleteSet(setId);
    if (editingSetId === setId) setEditingSetId(null);
    await loadWorkout();
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
      alert('Please enter valid numbers.');
      return;
    }
    const setNumber = await setRepo.getNextSetNumber(workoutId, addingSetExercise);
    const newSet = await setRepo.addFreeSet(workoutId, {
      exerciseName: addingSetExercise,
      setNumber,
      reps,
      weight,
      weightUnit: workout.sets[0]?.weight_unit ?? 'lbs',
      notes: addSetNotes || undefined,
    });
    if (addSetIsWarmup) {
      const { getDatabase } = await import('../db/database');
      const db = getDatabase();
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
      alert('Invalid date. Use format: YYYY-MM-DD HH:MM');
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
    if (!window.confirm('This will permanently delete this workout and all its sets.')) return;
    workoutRepo.deleteWorkout(workoutId).then(() => goBack());
  };

  return (
    <div style={{ overflowY: 'auto', paddingBottom: 40 }}>
      {/* Back button */}
      <div style={{ padding: '12px 16px' }}>
        <button
          onClick={goBack}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: 0 }}
        >
          &larr; Back
        </button>
      </div>

      {/* Header */}
      <div className="card">
        {editingDate ? (
          <div>
            <input
              type="text"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              placeholder="YYYY-MM-DD HH:MM"
              autoFocus
              style={{ fontSize: 18, fontWeight: 600 }}
            />
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              <button onClick={handleSaveDate} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Save</button>
              <button onClick={() => setEditingDate(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={handleEditDate} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{formatDate(workout.start_time)}</div>
            <div style={{ fontSize: 13, marginTop: 2, color: 'var(--accent)' }}>Tap to edit date</div>
          </button>
        )}
        <div style={{ fontSize: 16, marginTop: 8, color: 'var(--text-secondary)' }}>
          {workout.type === 'program' && workout.day
            ? `${workout.program_name} — Workout ${workout.day}`
            : 'Free Workout'}
        </div>
        <div style={{ fontSize: 15, marginTop: 4, color: 'var(--text-secondary)' }}>
          Duration: {formatDuration(workout.start_time, workout.end_time)}
        </div>
      </div>

      {/* Exercises */}
      {exerciseGroups.map((group) => (
        <div key={group.name} className="card">
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{group.name}</div>
          {group.sets
            .filter((s) => s.completed_at != null)
            .map((set) => {
              const isEditing = editingSetId === set.id;
              const isWarmup = set.is_warmup === 1;

              if (isEditing) {
                return (
                  <div key={set.id} style={{ borderTop: '0.5px solid var(--border)', padding: '10px 0' }}>
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
                      <button onClick={handleSaveSet} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Save</button>
                      <button onClick={() => setEditingSetId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Cancel</button>
                      <button onClick={() => handleDeleteSet(set.id)} style={{ background: 'none', border: 'none', color: 'var(--destructive)', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Delete</button>
                    </div>
                  </div>
                );
              }

              return (
                <button
                  key={set.id}
                  onClick={() => handleStartEditSet(set)}
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
                  <span style={{ fontSize: 14, width: 50, color: isWarmup ? 'var(--text-secondary)' : 'var(--text-secondary)' }}>
                    {isWarmup ? 'W' : `Set ${set.set_number}`}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: isWarmup ? 'var(--text-secondary)' : 'var(--text)' }}>
                    {formatWeight(set.weight ?? 0, set.weight_unit)} x {set.reps}
                  </span>
                  {set.estimated_rir != null && (
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>RIR {set.estimated_rir}</span>
                  )}
                  {set.notes && (
                    <span style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--text-secondary)', flex: 1 }}>{set.notes}</span>
                  )}
                </button>
              );
            })}

          {/* Add set form for this exercise */}
          {addingSetExercise === group.name ? (
            <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                Add {addSetIsWarmup ? 'Warmup' : 'Set'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)', width: 55 }}>Weight:</span>
                  <input type="number" value={addSetWeight} onChange={(e) => setAddSetWeight(e.target.value)} autoFocus style={{ flex: 1, fontSize: 16, fontWeight: 600 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)', width: 55 }}>Reps:</span>
                  <input type="number" value={addSetReps} onChange={(e) => setAddSetReps(e.target.value)} style={{ flex: 1, fontSize: 16, fontWeight: 600 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)', width: 55 }}>Notes:</span>
                  <input type="text" value={addSetNotes} onChange={(e) => setAddSetNotes(e.target.value)} placeholder="optional" style={{ flex: 1, fontSize: 16 }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                <button onClick={handleSaveNewSet} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Save</button>
                <button onClick={() => setAddingSetExercise(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 20, paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
              <button onClick={() => handleStartAddSet(group.name, false)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 0 }}>+ Add Set</button>
              <button onClick={() => handleStartAddSet(group.name, true)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 0 }}>+ Warmup</button>
            </div>
          )}
        </div>
      ))}

      {/* Add exercise */}
      <div className="card" style={{ textAlign: 'center' }}>
        <button
          onClick={() => setShowExercisePicker(true)}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 17, fontWeight: 600, cursor: 'pointer' }}
        >
          + Add Exercise
        </button>
      </div>

      {/* Delete workout */}
      <div className="card" style={{ textAlign: 'center' }}>
        <button
          onClick={handleDeleteWorkout}
          style={{ background: 'none', border: 'none', color: 'var(--destructive)', fontSize: 17, fontWeight: 600, cursor: 'pointer' }}
        >
          Delete Workout
        </button>
      </div>

      <ExercisePicker
        visible={showExercisePicker}
        onSelect={handleAddExercise}
        onClose={() => setShowExercisePicker(false)}
      />
    </div>
  );
}
