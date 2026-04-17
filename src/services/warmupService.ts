export interface WarmupSet {
  weight: number;
  reps: number;
}

/**
 * Generate warmup sets ramping from min_weight to just below workingWeight.
 *
 * Each warmup weight is a multiple of min_increment, at or above min_weight.
 * Reps decrease as weight increases (e.g., 8, 5, 3 for 3 sets).
 */
export function generateWarmupSets(
  workingWeight: number,
  config: { sets: number; min_weight: number; min_increment: number }
): WarmupSet[] {
  const { sets, min_weight, min_increment } = config;

  if (sets <= 0 || workingWeight <= min_weight) return [];

  const results: WarmupSet[] = [];
  const intervals = sets + 1;
  const rawStep = (workingWeight - min_weight) / intervals;

  // Descending reps pattern based on number of warmup sets
  const repPattern = getRepPattern(sets);

  for (let i = 1; i <= sets; i++) {
    const rawWeight = min_weight + rawStep * i;
    // Round to nearest min_increment
    const rounded = Math.round(rawWeight / min_increment) * min_increment;
    // Ensure at least min_weight and below working weight
    const weight = Math.max(min_weight, Math.min(rounded, workingWeight - min_increment));

    results.push({
      weight,
      reps: repPattern[i - 1],
    });
  }

  // Deduplicate consecutive identical weights
  const deduped: WarmupSet[] = [];
  for (const set of results) {
    if (deduped.length === 0 || deduped[deduped.length - 1].weight !== set.weight) {
      deduped.push(set);
    }
  }

  return deduped;
}

function getRepPattern(sets: number): number[] {
  switch (sets) {
    case 1: return [5];
    case 2: return [8, 3];
    case 3: return [8, 5, 3];
    case 4: return [10, 8, 5, 3];
    case 5: return [10, 8, 5, 3, 2];
    default: {
      // For >5 sets, interpolate
      const pattern: number[] = [];
      for (let i = 0; i < sets; i++) {
        const t = i / (sets - 1);
        pattern.push(Math.max(2, Math.round(10 - t * 8)));
      }
      return pattern;
    }
  }
}
