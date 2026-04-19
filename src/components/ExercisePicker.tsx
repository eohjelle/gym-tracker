import { useEffect, useState } from 'react';
import * as setRepo from '../db/repositories/setRepository';

interface Props {
  visible: boolean;
  onSelect: (exerciseName: string) => void;
  onClose: () => void;
}

export default function ExercisePicker({ visible, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [exerciseNames, setExerciseNames] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setRepo.getAllExerciseNames().then(setExerciseNames);
      setSearch('');
    }
  }, [visible]);

  if (!visible) return null;

  const filtered = search
    ? exerciseNames.filter((n) => n.toLowerCase().includes(search.toLowerCase()))
    : exerciseNames;

  const showCustomOption =
    search.length > 0 && !exerciseNames.some((n) => n.toLowerCase() === search.toLowerCase());

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>Add Exercise</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 17, cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>

        <div style={{ padding: '0 16px 12px' }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or type new exercise name"
            autoFocus
            style={{ fontSize: 17 }}
          />
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {showCustomOption && (
            <button
              onClick={() => onSelect(search.trim())}
              style={{
                display: 'block',
                width: '100%',
                padding: 16,
                background: 'var(--card)',
                border: 'none',
                borderBottom: '0.5px solid var(--border)',
                textAlign: 'left',
                fontSize: 17,
                color: 'var(--accent)',
                cursor: 'pointer',
              }}
            >
              Create "{search.trim()}"
            </button>
          )}
          {filtered.map((name) => (
            <button
              key={name}
              onClick={() => onSelect(name)}
              style={{
                display: 'block',
                width: '100%',
                padding: 16,
                background: 'var(--card)',
                border: 'none',
                borderBottom: '0.5px solid var(--border)',
                textAlign: 'left',
                fontSize: 17,
                color: 'var(--text)',
                cursor: 'pointer',
              }}
            >
              {name}
            </button>
          ))}
          {filtered.length === 0 && !showCustomOption && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
              {exerciseNames.length === 0
                ? 'No exercises yet. Type a name above to create one.'
                : 'No matches found.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
