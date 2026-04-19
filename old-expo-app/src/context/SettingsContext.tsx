import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getDatabase } from '../db/database';
import { DEFAULTS, WeightUnit, TimerAlertMode } from '../utils/constants';

interface Settings {
  weightUnit: WeightUnit;
  defaultRestSeconds: number;
  timerAlertMode: TimerAlertMode;
}

interface SettingsContextValue extends Settings {
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  weightIncrement: number;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>({
    weightUnit: DEFAULTS.weightUnit,
    defaultRestSeconds: DEFAULTS.restSeconds,
    timerAlertMode: DEFAULTS.timerAlertMode,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const db = getDatabase();
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      'SELECT key, value FROM settings'
    );
    const map = new Map(rows.map((r) => [r.key, r.value]));

    setSettings({
      weightUnit: (map.get('weightUnit') as WeightUnit) ?? DEFAULTS.weightUnit,
      defaultRestSeconds: Number(map.get('defaultRestSeconds')) || DEFAULTS.restSeconds,
      timerAlertMode: (map.get('timerAlertMode') as TimerAlertMode) ?? DEFAULTS.timerAlertMode,
    });
  }

  const updateSetting = useCallback(async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const db = getDatabase();
    await db.runAsync(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [key, String(value)]
    );
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const weightIncrement =
    settings.weightUnit === 'kg' ? DEFAULTS.weightIncrementKg : DEFAULTS.weightIncrementLbs;

  return (
    <SettingsContext.Provider value={{ ...settings, updateSetting, weightIncrement }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
