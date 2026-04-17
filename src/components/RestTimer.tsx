import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import * as Haptics from 'expo-haptics';
import { formatTimerSeconds } from '../utils/formatters';
import { useSettings } from '../context/SettingsContext';

interface Props {
  initialSeconds: number;
  onComplete: () => void;
  onSkip: () => void;
}

export default function RestTimer({ initialSeconds, onComplete, onSkip }: Props) {
  const { timerAlertMode } = useSettings();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

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
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - now) / 1000));
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
    if (timerAlertMode === 'sound_vibration' || timerAlertMode === 'vibration') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

  function handlePause() {
    if (isPaused) {
      // Resume: recalculate end time
      endTimeRef.current = Date.now() + remainingSeconds * 1000;
      setIsPaused(false);
      startInterval();
    } else {
      // Pause
      if (intervalRef.current) clearInterval(intervalRef.current);
      setIsPaused(true);
    }
  }

  function handleExtend() {
    endTimeRef.current += 30 * 1000;
    setRemainingSeconds((prev) => prev + 30);
    if (isPaused) {
      // Stay paused but update remaining
    }
  }

  const colors = {
    bg: '#000',
    text: '#FFF',
    accent: '#007AFF',
    secondaryText: '#8E8E93',
  };

  const progress = 1 - remainingSeconds / (initialSeconds || 1);

  return (
    <View style={[styles.overlay, { backgroundColor: colors.bg }]}>
      {isFinished ? (
        <Text style={styles.finishedText}>Time's up!</Text>
      ) : (
        <>
          <Text style={styles.label}>Rest</Text>
          <Text style={styles.timer}>{formatTimerSeconds(remainingSeconds)}</Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.actionButton} onPress={handlePause}>
              <Text style={[styles.actionText, { color: colors.accent }]}>
                {isPaused ? 'Resume' : 'Pause'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={handleExtend}>
              <Text style={[styles.actionText, { color: colors.accent }]}>+30s</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={onSkip}>
              <Text style={[styles.actionText, { color: colors.secondaryText }]}>Skip</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  label: {
    color: '#8E8E93',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  timer: {
    color: '#FFF',
    fontSize: 80,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  finishedText: {
    color: '#34C759',
    fontSize: 36,
    fontWeight: '800',
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 40,
    gap: 24,
  },
  actionButton: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  actionText: {
    fontSize: 18,
    fontWeight: '700',
  },
});
