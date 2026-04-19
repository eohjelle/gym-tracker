import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { RootStackParamList, RootTabParamList } from '../types/navigation';

import HomeScreen from '../screens/HomeScreen';
import HistoryScreen from '../screens/HistoryScreen';
import GraphsScreen from '../screens/GraphsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ActiveWorkoutScreen from '../screens/ActiveWorkoutScreen';
import WorkoutSummaryScreen from '../screens/WorkoutSummaryScreen';
import WorkoutDetailScreen from '../screens/WorkoutDetailScreen';

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          title: 'Home',
          tabBarIcon: () => null,
        }}
      />
      <Tab.Screen
        name="HistoryTab"
        component={HistoryScreen}
        options={{
          title: 'History',
          tabBarIcon: () => null,
        }}
      />
      <Tab.Screen
        name="GraphsTab"
        component={GraphsScreen}
        options={{
          title: 'Graphs',
          tabBarIcon: () => null,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarIcon: () => null,
        }}
      />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="MainTabs" component={TabNavigator} />
      <Stack.Screen
        name="ActiveWorkout"
        component={ActiveWorkoutScreen}
        options={{
          gestureEnabled: false,
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen
        name="WorkoutSummary"
        component={WorkoutSummaryScreen}
        options={{
          gestureEnabled: false,
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="WorkoutDetail"
        component={WorkoutDetailScreen}
        options={{
          headerShown: true,
          title: 'Workout Detail',
        }}
      />
    </Stack.Navigator>
  );
}
