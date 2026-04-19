export const DEFAULTS = {
  restSeconds: 90,
  weightUnit: 'kg' as const,
  timerAlertMode: 'sound_vibration' as const,
  weightIncrementKg: 2.5,
  weightIncrementLbs: 5,
  recentWorkoutsLimit: 7,
};

export type WeightUnit = 'kg' | 'lbs';
export type TimerAlertMode = 'sound_vibration' | 'vibration' | 'off';
