import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  useColorScheme,
} from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { getDatabase } from '../db/database';
import * as setRepo from '../db/repositories/setRepository';
import { estimatedOneRepMax } from '../utils/formulas';
import { formatWeight } from '../utils/formatters';
import { useSettings } from '../context/SettingsContext';

type ChartType = 'weight' | 'volume' | 'estimated_1rm';
type TimeRange = '4w' | '12w' | '6m' | 'all';

interface DataPoint {
  date: Date;
  value: number;
}

const CHART_HEIGHT = 200;
const CHART_PADDING = 40;

export default function GraphsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { weightUnit } = useSettings();

  const [exerciseNames, setExerciseNames] = useState<string[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [chartType, setChartType] = useState<ChartType>('weight');
  const [timeRange, setTimeRange] = useState<TimeRange>('12w');
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);

  useEffect(() => {
    setRepo.getAllExerciseNames().then((names) => {
      setExerciseNames(names);
      if (names.length > 0 && !selectedExercise) {
        setSelectedExercise(names[0]);
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedExercise) return;
    loadChartData();
  }, [selectedExercise, chartType, timeRange]);

  async function loadChartData() {
    if (!selectedExercise) return;
    const db = getDatabase();

    let cutoffDate: string | null = null;
    const now = new Date();
    if (timeRange === '4w') cutoffDate = new Date(now.getTime() - 28 * 86400000).toISOString();
    else if (timeRange === '12w') cutoffDate = new Date(now.getTime() - 84 * 86400000).toISOString();
    else if (timeRange === '6m') cutoffDate = new Date(now.getTime() - 180 * 86400000).toISOString();

    const dateFilter = cutoffDate ? `AND w.start_time >= ?` : '';
    const params: (string | number)[] = [selectedExercise!];
    if (cutoffDate) params.push(cutoffDate);

    const rows = await db.getAllAsync<{
      workout_id: number;
      start_time: string;
      reps: number;
      weight: number;
    }>(
      `SELECT ws.workout_id, w.start_time, ws.reps, ws.weight
       FROM workout_sets ws
       JOIN workouts w ON w.id = ws.workout_id
       WHERE ws.exercise_name = ? AND ws.completed_at IS NOT NULL AND w.status = 'completed'
       ${dateFilter}
       ORDER BY w.start_time`,
      params
    );

    // Group by workout
    const byWorkout = new Map<number, { date: Date; sets: { reps: number; weight: number }[] }>();
    for (const row of rows) {
      if (!byWorkout.has(row.workout_id)) {
        byWorkout.set(row.workout_id, { date: new Date(row.start_time), sets: [] });
      }
      byWorkout.get(row.workout_id)!.sets.push({ reps: row.reps, weight: row.weight });
    }

    const points: DataPoint[] = [];
    for (const [, { date, sets }] of byWorkout) {
      let value = 0;
      if (chartType === 'weight') {
        value = Math.max(...sets.map((s) => s.weight));
      } else if (chartType === 'volume') {
        value = sets.reduce((sum, s) => sum + s.reps * s.weight, 0);
      } else if (chartType === 'estimated_1rm') {
        value = Math.max(...sets.map((s) => estimatedOneRepMax(s.weight, s.reps)));
      }
      points.push({ date, value });
    }

    setDataPoints(points);
  }

  const colors = {
    bg: isDark ? '#000' : '#F2F2F7',
    card: isDark ? '#1C1C1E' : '#FFF',
    text: isDark ? '#FFF' : '#000',
    secondaryText: isDark ? '#8E8E93' : '#6C6C70',
    accent: '#007AFF',
    border: isDark ? '#38383A' : '#E5E5EA',
    chartLine: '#007AFF',
    chartGrid: isDark ? '#38383A' : '#E5E5EA',
  };

  const screenWidth = Dimensions.get('window').width;
  const chartWidth = screenWidth - 32;

  const renderChart = () => {
    if (dataPoints.length === 0) {
      return (
        <View style={[styles.chartPlaceholder, { backgroundColor: colors.card }]}>
          <Text style={{ color: colors.secondaryText }}>No data for this exercise yet</Text>
        </View>
      );
    }

    const values = dataPoints.map((p) => p.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    const xScale = (i: number) =>
      CHART_PADDING + (i / Math.max(dataPoints.length - 1, 1)) * (chartWidth - CHART_PADDING * 2);
    const yScale = (v: number) =>
      CHART_HEIGHT - CHART_PADDING - ((v - minVal) / range) * (CHART_HEIGHT - CHART_PADDING * 2);

    const pointsStr = dataPoints.map((p, i) => `${xScale(i)},${yScale(p.value)}`).join(' ');

    return (
      <View style={[styles.chartContainer, { backgroundColor: colors.card }]}>
        <Svg width={chartWidth} height={CHART_HEIGHT}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const y = CHART_PADDING + pct * (CHART_HEIGHT - CHART_PADDING * 2);
            const val = maxVal - pct * range;
            return (
              <React.Fragment key={pct}>
                <Line
                  x1={CHART_PADDING}
                  y1={y}
                  x2={chartWidth - CHART_PADDING}
                  y2={y}
                  stroke={colors.chartGrid}
                  strokeWidth={0.5}
                />
                <SvgText
                  x={CHART_PADDING - 4}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={10}
                  fill={colors.secondaryText}
                >
                  {Math.round(val)}
                </SvgText>
              </React.Fragment>
            );
          })}

          {/* Line */}
          {dataPoints.length > 1 && (
            <Polyline
              points={pointsStr}
              fill="none"
              stroke={colors.chartLine}
              strokeWidth={2}
            />
          )}

          {/* Points */}
          {dataPoints.map((p, i) => (
            <Circle
              key={i}
              cx={xScale(i)}
              cy={yScale(p.value)}
              r={4}
              fill={colors.chartLine}
            />
          ))}
        </Svg>
      </View>
    );
  };

  const chartTypes: { key: ChartType; label: string }[] = [
    { key: 'weight', label: 'Weight' },
    { key: 'volume', label: 'Volume' },
    { key: 'estimated_1rm', label: 'Est. 1RM' },
  ];

  const timeRanges: { key: TimeRange; label: string }[] = [
    { key: '4w', label: '4W' },
    { key: '12w', label: '12W' },
    { key: '6m', label: '6M' },
    { key: 'all', label: 'All' },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Exercise selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.exerciseScroll}>
        {exerciseNames.map((name) => (
          <TouchableOpacity
            key={name}
            style={[
              styles.exercisePill,
              {
                backgroundColor: name === selectedExercise ? colors.accent : colors.card,
                borderColor: colors.border,
              },
            ]}
            onPress={() => setSelectedExercise(name)}
          >
            <Text
              style={{
                color: name === selectedExercise ? '#FFF' : colors.text,
                fontSize: 14,
                fontWeight: '600',
              }}
            >
              {name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Chart type tabs */}
      <View style={styles.tabRow}>
        {chartTypes.map((ct) => (
          <TouchableOpacity
            key={ct.key}
            style={[
              styles.tab,
              {
                backgroundColor: chartType === ct.key ? colors.accent : 'transparent',
                borderColor: colors.border,
              },
            ]}
            onPress={() => setChartType(ct.key)}
          >
            <Text
              style={{
                color: chartType === ct.key ? '#FFF' : colors.text,
                fontWeight: '600',
              }}
            >
              {ct.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chart */}
      {renderChart()}

      {/* Time range */}
      <View style={styles.tabRow}>
        {timeRanges.map((tr) => (
          <TouchableOpacity
            key={tr.key}
            style={[
              styles.tab,
              {
                backgroundColor: timeRange === tr.key ? colors.accent : 'transparent',
                borderColor: colors.border,
              },
            ]}
            onPress={() => setTimeRange(tr.key)}
          >
            <Text
              style={{
                color: timeRange === tr.key ? '#FFF' : colors.text,
                fontWeight: '600',
              }}
            >
              {tr.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  exerciseScroll: { paddingHorizontal: 12, paddingTop: 16 },
  exercisePill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 4,
    borderWidth: 1,
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 12,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  chartContainer: {
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 8,
  },
  chartPlaceholder: {
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
});
