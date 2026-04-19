import { useEffect, useState } from 'react';
import { useNavigation } from '../context/NavigationContext';
import { WorkoutWithSets } from '../db/repositories/workoutRepository';
import * as workoutRepo from '../db/repositories/workoutRepository';
import { getPRsForWorkout } from '../db/repositories/personalRecordRepository';
import { PersonalRecordRow } from '../db/types';
import { formatDuration, formatWeight } from '../utils/formatters';

export default function WorkoutSummaryScreen({ workoutId }: { workoutId: number }) {
  const { navigate } = useNavigation();
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
    navigate({ screen: 'tabs', tab: 'home' });
  };

  return (
    <div style={{ paddingTop: 60 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, textAlign: 'center', marginBottom: 24 }}>
        Workout Complete!
      </h1>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{duration}</div>
            <div style={{ fontSize: 14, marginTop: 4, color: 'var(--text-secondary)' }}>Duration</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{exerciseNames.length}</div>
            <div style={{ fontSize: 14, marginTop: 4, color: 'var(--text-secondary)' }}>Exercises</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{completedSets.length}</div>
            <div style={{ fontSize: 14, marginTop: 4, color: 'var(--text-secondary)' }}>Sets</div>
          </div>
        </div>
      </div>

      {prs.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)', marginBottom: 12 }}>
            Personal Records!
          </div>
          {prs.map((pr) => (
            <div key={pr.id} style={{ padding: '6px 0' }}>
              {pr.exercise_name}:{' '}
              {pr.record_type === 'weight' && pr.reps
                ? `${pr.value} x ${pr.reps} reps`
                : pr.record_type === 'estimated_1rm'
                ? `Est. 1RM: ${Math.round(pr.value)}`
                : `Volume: ${Math.round(pr.value)}`}
            </div>
          ))}
        </div>
      )}

      <div style={{ margin: '24px 16px' }}>
        <button className="btn btn-accent" onClick={handleDone}>Done</button>
      </div>
    </div>
  );
}
