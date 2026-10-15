/**
 * Average speed (files per second) of a download: files saved over the time it actually ran, summed across all its
 * runs. Both numbers are saved with the download (counters.done, counters.activeMs), so this is the same after a
 * reload. 0 when there is no timing yet (a download saved before timing existed, or one that has not run).
 *
 * @param {number} done
 * @param {number} activeMs
 */
export function averageSpeed(done, activeMs) {
  return activeMs > 0 ? (done / activeMs) * 1000 : 0;
}
