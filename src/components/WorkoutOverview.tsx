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
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {exercises.map((item, index) => {
        const workingSets = item.sets.filter((s) => s.is_warmup === 0);
        const warmupSets = item.sets.filter((s) => s.is_warmup === 1);
        const completedSets = workingSets.filter((s) => s.completed_at != null);
        const completedWarmups = warmupSets.filter((s) => s.completed_at != null);
        const totalSets = workingSets.length;
        const isComplete = completedSets.length === totalSets && totalSets > 0;
        const isCurrent = index === currentIndex;

        return (
          <button
            key={item.exerciseName}
            onClick={() => onSelectExercise(index)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              width: '100%',
              padding: 16,
              background: isCurrent ? 'var(--current-bg, rgba(0,122,255,0.1))' : 'var(--card)',
              border: 'none',
              borderBottom: '0.5px solid var(--border)',
              textAlign: 'left',
              cursor: 'pointer',
              color: 'var(--text)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 17,
                    fontWeight: 600,
                    color: isComplete ? 'var(--success)' : 'var(--text)',
                  }}
                >
                  {item.exerciseName}
                </span>
                {item.groupTag && (
                  <span
                    style={{
                      background: 'var(--accent)',
                      color: '#FFF',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    SS
                  </span>
                )}
              </div>
              <div style={{ fontSize: 14, marginTop: 4, color: 'var(--text-secondary)' }}>
                {completedSets.length}/{totalSets} sets
                {warmupSets.length > 0
                  ? ` (${completedWarmups.length}/${warmupSets.length} warmup)`
                  : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {completedSets.map((s) => (
                <div key={s.id} style={{ fontSize: 13, marginTop: 2, color: 'var(--text-secondary)' }}>
                  {formatWeight(s.weight ?? 0, s.weight_unit)} x {s.reps}
                </div>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
