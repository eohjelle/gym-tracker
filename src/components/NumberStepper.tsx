import { useState } from 'react';

interface Props {
  value: number;
  increment?: number;
  min?: number;
  onChange: (value: number) => void;
}

export default function NumberStepper({ value, increment = 1, min = 0, onChange }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [textValue, setTextValue] = useState('');

  const handleDecrement = () => onChange(Math.max(min, value - increment));
  const handleIncrement = () => onChange(value + increment);

  const handleStartEdit = () => {
    setTextValue(String(value));
    setIsEditing(true);
  };

  const handleEndEdit = () => {
    const parsed = parseInt(textValue, 10);
    if (!isNaN(parsed) && parsed >= min) {
      onChange(parsed);
    }
    setIsEditing(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <button
        onClick={handleDecrement}
        style={{
          width: 72,
          height: 56,
          borderRadius: 12,
          border: 'none',
          background: 'var(--input-bg)',
          color: 'var(--accent)',
          fontSize: 18,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        -{increment}
      </button>

      {isEditing ? (
        <input
          type="number"
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          onBlur={handleEndEdit}
          onKeyDown={(e) => e.key === 'Enter' && handleEndEdit()}
          autoFocus
          style={{
            fontSize: 36,
            fontWeight: 800,
            textAlign: 'center',
            minWidth: 100,
            width: 120,
            background: 'none',
            border: 'none',
            borderBottomWidth: 2,
            borderBottomStyle: 'solid',
            borderBottomColor: 'var(--accent)',
            color: 'var(--text)',
            padding: 0,
          }}
        />
      ) : (
        <button
          onClick={handleStartEdit}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'center',
            minWidth: 100,
            padding: 0,
          }}
        >
          <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--text)' }}>{value}</div>
        </button>
      )}

      <button
        onClick={handleIncrement}
        style={{
          width: 72,
          height: 56,
          borderRadius: 12,
          border: 'none',
          background: 'var(--input-bg)',
          color: 'var(--accent)',
          fontSize: 18,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        +{increment}
      </button>
    </div>
  );
}
