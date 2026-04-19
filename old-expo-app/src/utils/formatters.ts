/** Format duration in seconds to "1h 23m" or "45m" or "< 1m" */
export function formatDuration(startTime: string, endTime: string | null): string {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const seconds = Math.floor((end - start) / 1000);

  if (seconds < 60) return '< 1m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Format seconds to "1:30" or "0:45" */
export function formatTimerSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Format date to "Mon, Apr 14" */
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Format weight with unit: "80 kg" or "175 lbs" */
export function formatWeight(weight: number, unit: 'kg' | 'lbs'): string {
  // Show decimal only if needed
  const formatted = weight % 1 === 0 ? weight.toString() : weight.toFixed(1);
  return `${formatted} ${unit}`;
}
