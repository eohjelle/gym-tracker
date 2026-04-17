import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { useColorScheme } from 'react-native';
import { DatabaseProvider } from './src/context/DatabaseContext';
import { SettingsProvider } from './src/context/SettingsContext';
import { ActiveWorkoutProvider } from './src/context/ActiveWorkoutContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  const colorScheme = useColorScheme();

  return (
    <DatabaseProvider>
      <SettingsProvider>
        <ActiveWorkoutProvider>
          <NavigationContainer theme={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <RootNavigator />
            <StatusBar style="auto" />
          </NavigationContainer>
        </ActiveWorkoutProvider>
      </SettingsProvider>
    </DatabaseProvider>
  );
}
