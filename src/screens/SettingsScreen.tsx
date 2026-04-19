import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  useColorScheme,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useSettings } from '../context/SettingsContext';
import { WeightUnit, TimerAlertMode } from '../utils/constants';
import * as programRepo from '../db/repositories/programRepository';
import { ProgramRow } from '../db/types';
import { parseProgramJSON } from '../utils/programParser';
import { getSupabaseConfig, saveSupabaseConfig, syncAll, restoreFromCloud } from '../services/syncService';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { weightUnit, defaultRestSeconds, timerAlertMode, updateSetting } = useSettings();

  const [restInput, setRestInput] = useState(String(defaultRestSeconds));
  const [activeProgram, setActiveProgram] = useState<ProgramRow | null>(null);
  const [allPrograms, setAllPrograms] = useState<ProgramRow[]>([]);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    loadPrograms();
    loadSupabaseConfig();
  }, []);

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
    Alert.alert('Saved', 'Supabase configuration saved. Workouts will sync automatically.');
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    try {
      const result = await syncAll();
      Alert.alert('Sync Complete', `${result.synced} change(s) synced.`);
    } catch (e: any) {
      Alert.alert('Sync Failed', e.message || 'Unknown error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRestore = () => {
    Alert.alert(
      'Restore from Cloud',
      'This will pull all data from Supabase into your local database. Existing local data for the same workouts will be overwritten.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setIsSyncing(true);
            try {
              const result = await restoreFromCloud();
              Alert.alert('Restore Complete', `${result.workouts} workout(s) restored.`);
            } catch (e: any) {
              Alert.alert('Restore Failed', e.message || 'Unknown error');
            } finally {
              setIsSyncing(false);
            }
          },
        },
      ]
    );
  };

  const loadPrograms = async () => {
    const active = await programRepo.getActiveProgram();
    setActiveProgram(active);
    const all = await programRepo.getAllPrograms();
    setAllPrograms(all);
  };

  useEffect(() => {
    setRestInput(String(defaultRestSeconds));
  }, [defaultRestSeconds]);

  const handleRestChange = async () => {
    const val = parseInt(restInput, 10);
    if (val > 0) {
      await updateSetting('defaultRestSeconds', val);
    } else {
      setRestInput(String(defaultRestSeconds));
    }
  };

  const handleImportProgram = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      const content = await FileSystem.readAsStringAsync(file.uri);

      // Validate JSON
      const parsed = parseProgramJSON(content);

      await programRepo.saveProgram(parsed);
      await loadPrograms();
      Alert.alert('Program Imported', `"${parsed.name}" loaded with ${parsed.workouts.length} workouts.`);
    } catch (e: any) {
      Alert.alert('Import Error', e.message || 'Failed to import program.');
    }
  };

  const handleRemoveProgram = async () => {
    if (!activeProgram) return;
    Alert.alert('Remove Program', `Remove "${activeProgram.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await programRepo.deleteProgram(activeProgram.id);
          await loadPrograms();
        },
      },
    ]);
  };

  const colors = {
    bg: isDark ? '#000' : '#F2F2F7',
    card: isDark ? '#1C1C1E' : '#FFF',
    text: isDark ? '#FFF' : '#000',
    secondaryText: isDark ? '#8E8E93' : '#6C6C70',
    accent: '#007AFF',
    border: isDark ? '#38383A' : '#E5E5EA',
    destructive: '#FF3B30',
    inputBg: isDark ? '#2C2C2E' : '#F2F2F7',
  };

  const SegmentedControl = ({
    options,
    selected,
    onSelect,
  }: {
    options: { key: string; label: string }[];
    selected: string;
    onSelect: (key: string) => void;
  }) => (
    <View style={[styles.segmented, { backgroundColor: colors.inputBg }]}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.key}
          style={[
            styles.segment,
            selected === opt.key && { backgroundColor: colors.accent },
          ]}
          onPress={() => onSelect(opt.key)}
        >
          <Text
            style={[
              styles.segmentText,
              { color: selected === opt.key ? '#FFF' : colors.text },
            ]}
          >
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Rest Timer */}
      <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>REST TIMER</Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.text }]}>Default duration (seconds)</Text>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.inputBg }]}
            value={restInput}
            onChangeText={setRestInput}
            onBlur={handleRestChange}
            keyboardType="number-pad"
            returnKeyType="done"
          />
        </View>
      </View>

      {/* Weight Unit */}
      <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>WEIGHT UNIT</Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <SegmentedControl
          options={[
            { key: 'kg', label: 'Kilograms (kg)' },
            { key: 'lbs', label: 'Pounds (lbs)' },
          ]}
          selected={weightUnit}
          onSelect={(key) => updateSetting('weightUnit', key as WeightUnit)}
        />
      </View>

      {/* Timer Alert */}
      <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>TIMER ALERT</Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <SegmentedControl
          options={[
            { key: 'sound_vibration', label: 'Sound + Vibration' },
            { key: 'vibration', label: 'Vibration' },
            { key: 'off', label: 'Off' },
          ]}
          selected={timerAlertMode}
          onSelect={(key) => updateSetting('timerAlertMode', key as TimerAlertMode)}
        />
      </View>

      {/* Program */}
      <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>PROGRAM</Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {allPrograms.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[styles.programRow, { borderBottomColor: colors.border }]}
            onPress={async () => {
              await programRepo.setActiveProgram(p.id);
              await loadPrograms();
            }}
          >
            <Text style={[styles.label, { color: colors.text }]}>
              {p.id === activeProgram?.id ? '● ' : '○ '}
              {p.name}
            </Text>
          </TouchableOpacity>
        ))}
        {activeProgram && (
          <TouchableOpacity style={styles.linkButton} onPress={handleRemoveProgram}>
            <Text style={{ color: colors.destructive, fontSize: 16 }}>Remove Active Program</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.linkButton} onPress={handleImportProgram}>
          <Text style={{ color: colors.accent, fontSize: 16 }}>Import Program JSON</Text>
        </TouchableOpacity>
      </View>

      {/* Supabase Sync */}
      <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>CLOUD SYNC</Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.label, { color: colors.secondaryText, marginBottom: 12, fontSize: 13 }]}>
          Workouts auto-sync to Supabase when completed.
        </Text>
        <Text style={[styles.label, { color: colors.text, marginBottom: 4, fontSize: 13 }]}>
          Project URL
        </Text>
        <TextInput
          style={[styles.supabaseInput, { color: colors.text, backgroundColor: colors.inputBg }]}
          value={supabaseUrl}
          onChangeText={setSupabaseUrl}
          placeholder="https://xxxxx.supabase.co"
          placeholderTextColor={colors.secondaryText}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={[styles.label, { color: colors.text, marginBottom: 4, marginTop: 12, fontSize: 13 }]}>
          API Key (anon/public)
        </Text>
        <TextInput
          style={[styles.supabaseInput, { color: colors.text, backgroundColor: colors.inputBg }]}
          value={supabaseKey}
          onChangeText={setSupabaseKey}
          placeholder="eyJhbGciOiJIUz..."
          placeholderTextColor={colors.secondaryText}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <TouchableOpacity
          style={[styles.syncButton, { backgroundColor: colors.accent, marginTop: 16 }]}
          onPress={handleSaveSupabase}
        >
          <Text style={styles.syncButtonText}>Save Configuration</Text>
        </TouchableOpacity>
        {supabaseUrl.length > 0 && supabaseKey.length > 0 && (
          <>
            <TouchableOpacity
              style={[styles.syncButton, { backgroundColor: isSyncing ? colors.secondaryText : '#34C759', marginTop: 8 }]}
              onPress={handleSyncAll}
              disabled={isSyncing}
            >
              <Text style={styles.syncButtonText}>
                {isSyncing ? 'Syncing...' : 'Push Changes to Cloud'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.syncButton, { backgroundColor: isSyncing ? colors.secondaryText : colors.accent, marginTop: 8 }]}
              onPress={handleRestore}
              disabled={isSyncing}
            >
              <Text style={styles.syncButtonText}>Restore from Cloud</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Theme */}
      <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>THEME</Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.label, { color: colors.secondaryText }]}>
          Follows system setting (currently {isDark ? 'dark' : 'light'})
        </Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: { fontSize: 16 },
  input: {
    fontSize: 16,
    fontWeight: '600',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 80,
    textAlign: 'center',
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
  programRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linkButton: {
    marginTop: 12,
  },
  supabaseInput: {
    fontSize: 14,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  syncButton: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center' as const,
  },
  syncButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
