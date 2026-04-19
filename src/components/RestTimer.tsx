import { useEffect, useRef, useState } from 'react';
import { formatTimerSeconds } from '../utils/formatters';
import { useSettings } from '../context/SettingsContext';

interface Props {
  initialSeconds: number;
  onComplete: () => void;
  onSkip: () => void;
}

let audioCtx: AudioContext | null = null;

function playBeep() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch {
    // Audio not available
  }
}

export default function RestTimer({ initialSeconds, onComplete, onSkip }: Props) {
  const { timerAlertMode } = useSettings();
  const [remainingSeconds, setRemainingSeconds] = useState(initialSeconds);
  const [isPaused, setIsPaused] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const endTimeRef = useRef(Date.now() + initialSeconds * 1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    startInterval();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function startInterval() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      setRemainingSeconds(remaining);

      if (remaining <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setIsFinished(true);
        triggerAlert();
        setTimeout(onComplete, 1500);
      }
    }, 200);
  }

  function triggerAlert() {
    if (timerAlertMode === 'sound_vibration') {
      playBeep();
    }
    if (timerAlertMode === 'sound_vibration' || timerAlertMode === 'vibration') {
      if (navigator.vibrate) navigator.vibrate(300);
    }
  }

  function handlePause() {
    if (isPaused) {
      endTimeRef.current = Date.now() + remainingSeconds * 1000;
      setIsPaused(false);
      startInterval();
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setIsPaused(true);
    }
  }

  function handleExtend() {
    endTimeRef.current += 30 * 1000;
    setRemainingSeconds((prev) => prev + 30);
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100,
      }}
    >
      {isFinished ? (
        <div style={{ color: 'var(--success)', fontSize: 36, fontWeight: 800 }}>Time's up!</div>
      ) : (
        <>
          <div style={{ color: '#8E8E93', fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Rest</div>
          <div
            style={{
              color: '#FFF',
              fontSize: 80,
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatTimerSeconds(remainingSeconds)}
          </div>

          <div style={{ display: 'flex', gap: 24, marginTop: 40 }}>
            <button
              onClick={handlePause}
              style={{
                padding: '14px 20px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                color: 'var(--accent)',
                fontSize: 18,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button
              onClick={handleExtend}
              style={{
                padding: '14px 20px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                color: 'var(--accent)',
                fontSize: 18,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              +30s
            </button>
            <button
              onClick={onSkip}
              style={{
                padding: '14px 20px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                color: '#8E8E93',
                fontSize: 18,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Skip
            </button>
          </div>
        </>
      )}
    </div>
  );
}
