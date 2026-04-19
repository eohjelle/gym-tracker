import React, { useState, useEffect, useRef } from 'react';
import { useSettings } from '../context/SettingsContext';
import { WeightUnit, TimerAlertMode } from '../utils/constants';
import * as programRepo from '../db/repositories/programRepository';
import { ProgramRow } from '../db/types';
import { parseProgramJSON } from '../utils/programParser';
import { getSupabaseConfig, saveSupabaseConfig, syncAll, restoreFromCloud } from '../services/syncService';

function SegmentedControl({ options, selected, onSelect }: {
  options: { key: string; label: string }[];
  selected: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="segmented">
      {options.map((opt) => (
        <button
          key={opt.key}
          className={selected === opt.key ? 'active' : ''}
          onClick={() => onSelect(opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsScreen() {
  const { weightUnit, defaultRestSeconds, timerAlertMode, updateSetting } = useSettings();

  const [restInput, setRestInput] = useState(String(defaultRestSeconds));
  const [activeProgram, setActiveProgram] = useState<ProgramRow | null>(null);
  const [allPrograms, setAllPrograms] = useState<ProgramRow[]>([]);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPrograms();
    loadSupabaseConfig();
  }, []);

  useEffect(() => {
    setRestInput(String(defaultRestSeconds));
  }, [defaultRestSeconds]);

  const loadSupabaseConfig = async () => {
    const config = await getSupabaseConfig();
    if (config) {
      setSupabaseUrl(config.url);
      setSupabaseKey(config.apiKey);
    }
  };

  const handleSaveSupabase = async () => {
    const trimmedUrl = supabaseUrl.replace(/\/+$/, '');
    await saveSupabaseConfig(trimmedUrl, supabaseKey.trim());
    setSupabaseUrl(trimmedUrl);
    setSupabaseKey(supabaseKey.trim());
    alert('Supabase configuration saved. Workouts will sync automatically.');
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    try {
      const result = await syncAll();
      alert(`Sync complete: ${result.synced} change(s) synced.`);
    } catch (e: any) {
      alert(`Sync failed: ${e.message || 'Unknown error'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRestore = () => {
    if (!window.confirm('This will pull all data from Supabase into your local database. Existing local data for the same workouts will be overwritten. Continue?')) return;
    setIsSyncing(true);
    restoreFromCloud()
      .then((result) => alert(`Restore complete: ${result.workouts} workout(s) restored.`))
      .catch((e: any) => alert(`Restore failed: ${e.message || 'Unknown error'}`))
      .finally(() => setIsSyncing(false));
  };

  const loadPrograms = async () => {
    const active = await programRepo.getActiveProgram();
    setActiveProgram(active);
    const all = await programRepo.getAllPrograms();
    setAllPrograms(all);
  };

  const handleRestChange = async () => {
    const val = parseInt(restInput, 10);
    if (val > 0) {
      await updateSetting('defaultRestSeconds', val);
    } else {
      setRestInput(String(defaultRestSeconds));
    }
  };

  const handleImportProgram = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const parsed = parseProgramJSON(content);
      await programRepo.saveProgram(parsed);
      await loadPrograms();
      alert(`"${parsed.name}" loaded with ${parsed.workouts.length} workouts.`);
    } catch (err: any) {
      alert(`Import error: ${err.message || 'Failed to import program.'}`);
    }
    // Reset file input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveProgram = async () => {
    if (!activeProgram) return;
    if (!window.confirm(`Remove "${activeProgram.name}"?`)) return;
    await programRepo.deleteProgram(activeProgram.id);
    await loadPrograms();
  };

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Rest Timer */}
      <div className="section-title">REST TIMER</div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Default duration (seconds)</span>
          <input
            type="number"
            value={restInput}
            onChange={(e) => setRestInput(e.target.value)}
            onBlur={handleRestChange}
            style={{ width: 80, textAlign: 'center', fontWeight: 600 }}
          />
        </div>
      </div>

      {/* Weight Unit */}
      <div className="section-title">WEIGHT UNIT</div>
      <div className="card">
        <SegmentedControl
          options={[
            { key: 'kg', label: 'Kilograms (kg)' },
            { key: 'lbs', label: 'Pounds (lbs)' },
          ]}
          selected={weightUnit}
          onSelect={(key) => updateSetting('weightUnit', key as WeightUnit)}
        />
      </div>

      {/* Timer Alert */}
      <div className="section-title">TIMER ALERT</div>
      <div className="card">
        <SegmentedControl
          options={[
            { key: 'sound_vibration', label: 'Sound + Vibration' },
            { key: 'vibration', label: 'Vibration' },
            { key: 'off', label: 'Off' },
          ]}
          selected={timerAlertMode}
          onSelect={(key) => updateSetting('timerAlertMode', key as TimerAlertMode)}
        />
      </div>

      {/* Program */}
      <div className="section-title">PROGRAM</div>
      <div className="card">
        {allPrograms.map((p) => (
          <button
            key={p.id}
            onClick={async () => {
              await programRepo.setActiveProgram(p.id);
              await loadPrograms();
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: 'none',
              border: 'none',
              borderBottom: '0.5px solid var(--border)',
              padding: '10px 0',
              fontSize: 16,
              color: 'var(--text)',
            }}
          >
            {p.id === activeProgram?.id ? '● ' : '○ '}
            {p.name}
          </button>
        ))}
        {activeProgram && (
          <button
            onClick={handleRemoveProgram}
            style={{ background: 'none', border: 'none', color: 'var(--destructive)', fontSize: 16, marginTop: 12, padding: 0 }}
          >
            Remove Active Program
          </button>
        )}
        <div style={{ marginTop: 12 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportProgram}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16, padding: 0 }}
          >
            Import Program JSON
          </button>
        </div>
      </div>

      {/* Cloud Sync */}
      <div className="section-title">CLOUD SYNC</div>
      <div className="card">
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
          Workouts auto-sync to Supabase when completed.
        </p>
        <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Project URL</label>
        <input
          type="url"
          value={supabaseUrl}
          onChange={(e) => setSupabaseUrl(e.target.value)}
          placeholder="https://xxxxx.supabase.co"
          style={{ fontSize: 14 }}
        />
        <label style={{ fontSize: 13, display: 'block', marginBottom: 4, marginTop: 12 }}>API Key (anon/public)</label>
        <input
          type="password"
          value={supabaseKey}
          onChange={(e) => setSupabaseKey(e.target.value)}
          placeholder="eyJhbGciOiJIUz..."
          style={{ fontSize: 14 }}
        />
        <button
          className="btn btn-accent"
          onClick={handleSaveSupabase}
          style={{ marginTop: 16, borderRadius: 8, padding: 12 }}
        >
          Save Configuration
        </button>
        {supabaseUrl.length > 0 && supabaseKey.length > 0 && (
          <>
            <button
              className="btn btn-success"
              onClick={handleSyncAll}
              disabled={isSyncing}
              style={{ marginTop: 8, borderRadius: 8, padding: 12, opacity: isSyncing ? 0.6 : 1 }}
            >
              {isSyncing ? 'Syncing...' : 'Push Changes to Cloud'}
            </button>
            <button
              className="btn btn-accent"
              onClick={handleRestore}
              disabled={isSyncing}
              style={{ marginTop: 8, borderRadius: 8, padding: 12, opacity: isSyncing ? 0.6 : 1 }}
            >
              Restore from Cloud
            </button>
          </>
        )}
      </div>

      {/* Theme */}
      <div className="section-title">THEME</div>
      <div className="card">
        <span style={{ color: 'var(--text-secondary)' }}>
          Follows system setting
        </span>
      </div>
    </div>
  );
}
