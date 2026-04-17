import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  useColorScheme,
  SafeAreaView,
} from 'react-native';
import * as setRepo from '../db/repositories/setRepository';

interface Props {
  visible: boolean;
  onSelect: (exerciseName: string) => void;
  onClose: () => void;
}

export default function ExercisePicker({ visible, onSelect, onClose }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [search, setSearch] = useState('');
  const [exerciseNames, setExerciseNames] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setRepo.getAllExerciseNames().then(setExerciseNames);
      setSearch('');
    }
  }, [visible]);

  const filtered = search
    ? exerciseNames.filter((n) => n.toLowerCase().includes(search.toLowerCase()))
    : exerciseNames;

  const showCustomOption = search.length > 0 && !exerciseNames.some(
    (n) => n.toLowerCase() === search.toLowerCase()
  );

  const colors = {
    bg: isDark ? '#000' : '#F2F2F7',
    card: isDark ? '#1C1C1E' : '#FFF',
    text: isDark ? '#FFF' : '#000',
    secondaryText: isDark ? '#8E8E93' : '#6C6C70',
    accent: '#007AFF',
    border: isDark ? '#38383A' : '#E5E5EA',
    inputBg: isDark ? '#2C2C2E' : '#E5E5EA',
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Add Exercise</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.cancel, { color: colors.accent }]}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="Search or type new exercise name"
          placeholderTextColor={colors.secondaryText}
          value={search}
          onChangeText={setSearch}
          autoFocus
          returnKeyType="done"
        />

        <FlatList
          data={filtered}
          keyExtractor={(item) => item}
          ListHeaderComponent={
            showCustomOption ? (
              <TouchableOpacity
                style={[styles.row, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
                onPress={() => onSelect(search.trim())}
              >
                <Text style={[styles.rowText, { color: colors.accent }]}>
                  Create "{search.trim()}"
                </Text>
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
              onPress={() => onSelect(item)}
            >
              <Text style={[styles.rowText, { color: colors.text }]}>{item}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            !showCustomOption ? (
              <View style={styles.empty}>
                <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
                  {exerciseNames.length === 0
                    ? 'No exercises yet. Type a name above to create one.'
                    : 'No matches found.'}
                </Text>
              </View>
            ) : null
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 20, fontWeight: '700' },
  cancel: { fontSize: 17 },
  searchInput: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 17,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { fontSize: 17 },
  empty: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: { fontSize: 15, textAlign: 'center' },
});
