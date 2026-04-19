import { useState } from 'react';

interface Props {
  value: number;
  increment: number;
  unit: 'kg' | 'lbs';
  onChange: (value: number) => void;
}

export default function WeightStepper({ value, increment, unit, onChange }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [textValue, setTextValue] = useState('');

  const handleDecrement = () => {
    onChange(Math.max(0, value - increment));
  };

  const handleIncrement = () => {
    onChange(value + increment);
  };

  const handleStartEdit = () => {
    setTextValue(value % 1 === 0 ? value.toString() : value.toFixed(1));
    setIsEditing(true);
  };

  const handleEndEdit = () => {
    const parsed = parseFloat(textValue);
    if (!isNaN(parsed) && parsed >= 0) {
      onChange(parsed);
    }
    setIsEditing(false);
  };

  const displayValue = value % 1 === 0 ? value.toString() : value.toFixed(1);

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
            borderBottom: '2px solid var(--accent)',
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
          <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--text)' }}>{displayValue}</div>
          <div style={{ fontSize: 14, marginTop: -2, color: 'var(--text)' }}>{unit}</div>
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
