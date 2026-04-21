import React, { createContext, useContext, useState, useCallback } from 'react';

export type Route =
  | { screen: 'tabs'; tab: 'home' | 'history' | 'graphs' | 'settings' }
  | { screen: 'activeWorkout' }
  | { screen: 'workoutSummary'; workoutId: number }
  | { screen: 'workoutDetail'; workoutId: number }
  | { screen: 'workoutPreview'; programWorkoutId: number; isDeload: boolean };

interface NavigationContextValue {
  route: Route;
  navigate: (route: Route) => void;
  goBack: () => void;
  activeTab: 'home' | 'history' | 'graphs' | 'settings';
  setActiveTab: (tab: 'home' | 'history' | 'graphs' | 'settings') => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<Route>({ screen: 'tabs', tab: 'home' });
  const [history, setHistory] = useState<Route[]>([]);
  const [activeTab, setActiveTabState] = useState<'home' | 'history' | 'graphs' | 'settings'>('home');

  const navigate = useCallback((newRoute: Route) => {
    setHistory((prev) => [...prev, route]);
    setRoute(newRoute);
    if (newRoute.screen === 'tabs') {
      setActiveTabState(newRoute.tab);
    }
  }, [route]);

  const goBack = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) {
        setRoute({ screen: 'tabs', tab: activeTab });
        return prev;
      }
      const newHistory = [...prev];
      const previous = newHistory.pop()!;
      setRoute(previous);
      if (previous.screen === 'tabs') {
        setActiveTabState(previous.tab);
      }
      return newHistory;
    });
  }, [activeTab]);

  const setActiveTab = useCallback((tab: 'home' | 'history' | 'graphs' | 'settings') => {
    setActiveTabState(tab);
    setRoute({ screen: 'tabs', tab });
    setHistory([]);
  }, []);

  return (
    <NavigationContext.Provider value={{ route, navigate, goBack, activeTab, setActiveTab }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider');
  return ctx;
}
