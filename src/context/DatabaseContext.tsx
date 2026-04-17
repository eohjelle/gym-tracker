import React, { createContext, useContext, useEffect, useState } from 'react';
import { SQLiteDatabase } from 'expo-sqlite';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { initDatabase } from '../db/database';

const DatabaseContext = createContext<SQLiteDatabase | null>(null);

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);

  useEffect(() => {
    initDatabase().then(setDb);
  }, []);

  if (!db) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <DatabaseContext.Provider value={db}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDB(): SQLiteDatabase {
  const db = useContext(DatabaseContext);
  if (!db) throw new Error('useDB must be used within DatabaseProvider');
  return db;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
