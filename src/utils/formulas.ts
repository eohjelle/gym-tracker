/** Epley formula for estimated one-rep max */
export function estimatedOneRepMax(weight: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/** Total volume = sum of (reps * weight) for each set */
export function totalVolume(sets: { reps: number; weight: number }[]): number {
  return sets.reduce((sum, s) => sum + s.reps * s.weight, 0);
}
