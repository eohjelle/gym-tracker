import React, { createContext, useContext, useEffect, useState } from 'react';
import { WebDatabase, initDatabase } from '../db/database';

const DatabaseContext = createContext<WebDatabase | null>(null);

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<WebDatabase | null>(null);

  useEffect(() => {
    initDatabase().then(setDb);
  }, []);

  if (!db) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <DatabaseContext.Provider value={db}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDB(): WebDatabase {
  const db = useContext(DatabaseContext);
  if (!db) throw new Error('useDB must be used within DatabaseProvider');
  return db;
}
