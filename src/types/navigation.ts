export type RootStackParamList = {
  MainTabs: undefined;
  ActiveWorkout: { programName?: string; week?: number; day?: string } | undefined;
  WorkoutSummary: { workoutId: number };
  WorkoutDetail: { workoutId: number };
};

export type RootTabParamList = {
  HomeTab: undefined;
  HistoryTab: undefined;
  GraphsTab: undefined;
  SettingsTab: undefined;
};
