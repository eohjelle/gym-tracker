import { useState, useEffect, useRef } from 'react';
import { getDatabase } from '../db/database';
import * as setRepo from '../db/repositories/setRepository';
import { estimatedOneRepMax } from '../utils/formulas';

type ChartType = 'weight' | 'volume' | 'estimated_1rm';
type TimeRange = '4w' | '12w' | '6m' | 'all';

interface DataPoint {
  date: string;
  value: number;
}

export default function GraphsScreen() {
  const [exerciseNames, setExerciseNames] = useState<string[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<string>('');
  const [chartType, setChartType] = useState<ChartType>('weight');
  const [timeRange, setTimeRange] = useState<TimeRange>('12w');
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(300);

  useEffect(() => {
    setRepo.getAllExerciseNames().then((names) => {
      setExerciseNames(names);
      if (names.length > 0 && !selectedExercise) setSelectedExercise(names[0]);
    });
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      setChartWidth(containerRef.current.offsetWidth - 32);
    }
  }, []);

  useEffect(() => {
    if (!selectedExercise) return;
    loadData();
  }, [selectedExercise, chartType, timeRange]);

  const loadData = async () => {
    const db = getDatabase();
    let dateFilter = '';
    const now = new Date();
    if (timeRange === '4w') {
      const d = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      dateFilter = `AND w.start_time >= '${d.toISOString()}'`;
    } else if (timeRange === '12w') {
      const d = new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000);
      dateFilter = `AND w.start_time >= '${d.toISOString()}'`;
    } else if (timeRange === '6m') {
      const d = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      dateFilter = `AND w.start_time >= '${d.toISOString()}'`;
    }

    const rows = await db.getAllAsync<{
      workout_id: number;
      start_time: string;
      reps: number;
      weight: number;
    }>(
      `SELECT ws.workout_id, w.start_time, ws.reps, ws.weight
       FROM workout_sets ws
       JOIN workouts w ON w.id = ws.workout_id
       WHERE ws.exercise_name = ? AND ws.completed_at IS NOT NULL AND ws.is_warmup = 0
       AND w.status = 'completed' ${dateFilter}
       ORDER BY w.start_time`,
      [selectedExercise]
    );

    // Group by workout
    const byWorkout = new Map<number, { date: string; sets: { reps: number; weight: number }[] }>();
    for (const row of rows) {
      if (!byWorkout.has(row.workout_id)) {
        byWorkout.set(row.workout_id, { date: row.start_time, sets: [] });
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
      } else {
        value = Math.max(...sets.map((s) => estimatedOneRepMax(s.weight, s.reps)));
      }
      points.push({ date, value });
    }
    setDataPoints(points);
  };

  const chartHeight = 200;
  const padding = { top: 20, right: 10, bottom: 30, left: 50 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  const minVal = dataPoints.length > 0 ? Math.min(...dataPoints.map((d) => d.value)) * 0.9 : 0;
  const maxVal = dataPoints.length > 0 ? Math.max(...dataPoints.map((d) => d.value)) * 1.1 : 100;
  const valRange = maxVal - minVal || 1;

  const polylinePoints = dataPoints
    .map((d, i) => {
      const x = padding.left + (dataPoints.length > 1 ? (i / (dataPoints.length - 1)) * plotWidth : plotWidth / 2);
      const y = padding.top + plotHeight - ((d.value - minVal) / valRange) * plotHeight;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div ref={containerRef}>
      {/* Exercise selector */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto' }}>
        {exerciseNames.map((name) => (
          <button
            key={name}
            onClick={() => setSelectedExercise(name)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              border: 'none',
              background: name === selectedExercise ? 'var(--accent)' : 'var(--card)',
              color: name === selectedExercise ? '#FFF' : 'var(--text)',
              fontSize: 14,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Chart type tabs */}
      <div style={{ padding: '0 16px' }}>
        <div className="segmented">
          {(['weight', 'volume', 'estimated_1rm'] as ChartType[]).map((t) => (
            <button key={t} className={chartType === t ? 'active' : ''} onClick={() => setChartType(t)}>
              {t === 'weight' ? 'Weight' : t === 'volume' ? 'Volume' : 'Est. 1RM'}
            </button>
          ))}
        </div>
      </div>

      {/* Time range tabs */}
      <div style={{ padding: '8px 16px' }}>
        <div className="segmented">
          {(['4w', '12w', '6m', 'all'] as TimeRange[]).map((r) => (
            <button key={r} className={timeRange === r ? 'active' : ''} onClick={() => setTimeRange(r)}>
              {r === '4w' ? '4W' : r === '12w' ? '12W' : r === '6m' ? '6M' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="card">
        {dataPoints.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>
            No data for this exercise.
          </div>
        ) : (
          <svg width={chartWidth} height={chartHeight} style={{ display: 'block' }}>
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const y = padding.top + plotHeight * (1 - frac);
              const val = minVal + valRange * frac;
              return (
                <g key={frac}>
                  <line x1={padding.left} y1={y} x2={padding.left + plotWidth} y2={y} stroke="var(--border)" strokeWidth={0.5} />
                  <text x={padding.left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="var(--text-secondary)">
                    {Math.round(val)}
                  </text>
                </g>
              );
            })}
            {/* Data line */}
            <polyline points={polylinePoints} fill="none" stroke="var(--accent)" strokeWidth={2} />
            {/* Data points */}
            {dataPoints.map((d, i) => {
              const x = padding.left + (dataPoints.length > 1 ? (i / (dataPoints.length - 1)) * plotWidth : plotWidth / 2);
              const y = padding.top + plotHeight - ((d.value - minVal) / valRange) * plotHeight;
              return <circle key={i} cx={x} cy={y} r={4} fill="var(--accent)" />;
            })}
          </svg>
        )}
      </div>
    </div>
  );
}
