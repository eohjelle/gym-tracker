import './App.css';
import { DatabaseProvider } from './context/DatabaseContext';
import { SettingsProvider } from './context/SettingsContext';
import { ActiveWorkoutProvider } from './context/ActiveWorkoutContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import HomeScreen from './screens/HomeScreen';
import HistoryScreen from './screens/HistoryScreen';
import GraphsScreen from './screens/GraphsScreen';
import SettingsScreen from './screens/SettingsScreen';
import ActiveWorkoutScreen from './screens/ActiveWorkoutScreen';
import WorkoutSummaryScreen from './screens/WorkoutSummaryScreen';
import WorkoutDetailScreen from './screens/WorkoutDetailScreen';

function AppContent() {
  const { route, activeTab, setActiveTab } = useNavigation();

  let screen: React.ReactNode;

  if (route.screen === 'activeWorkout') {
    screen = <ActiveWorkoutScreen />;
  } else if (route.screen === 'workoutSummary') {
    screen = <WorkoutSummaryScreen workoutId={route.workoutId} />;
  } else if (route.screen === 'workoutDetail') {
    screen = <WorkoutDetailScreen workoutId={route.workoutId} />;
  } else {
    // Tab screens
    switch (activeTab) {
      case 'home': screen = <HomeScreen />; break;
      case 'history': screen = <HistoryScreen />; break;
      case 'graphs': screen = <GraphsScreen />; break;
      case 'settings': screen = <SettingsScreen />; break;
    }
  }

  const showTabBar = route.screen === 'tabs';

  return (
    <div className="app">
      <div className="screen-content">
        {screen}
      </div>
      {showTabBar && (
        <div className="tab-bar">
          <button className={activeTab === 'home' ? 'active' : ''} onClick={() => setActiveTab('home')}>
            <span className="tab-icon">&#x1F3CB;</span>
            Home
          </button>
          <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>
            <span className="tab-icon">&#x1F4CB;</span>
            History
          </button>
          <button className={activeTab === 'graphs' ? 'active' : ''} onClick={() => setActiveTab('graphs')}>
            <span className="tab-icon">&#x1F4C8;</span>
            Graphs
          </button>
          <button className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}>
            <span className="tab-icon">&#x2699;</span>
            Settings
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <DatabaseProvider>
      <SettingsProvider>
        <ActiveWorkoutProvider>
          <NavigationProvider>
            <AppContent />
          </NavigationProvider>
        </ActiveWorkoutProvider>
      </SettingsProvider>
    </DatabaseProvider>
  );
}
