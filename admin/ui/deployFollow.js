// How often the admin asks GitHub where a save's deploy is. The deploy waits for the whole
// CI run (build, five browser-test shards, then the Pages deploy): about 13–15 minutes. So
// it asks often at first (a failure early on, or the run starting, shows soon), less often
// once it's clearly underway, and stops after FOLLOW_FOR, when the page says it's still
// deploying and links to the run instead of looking busy for ever. Pure: the tests run it.

/** The first check, soon after the save: the run starting turns "waiting" into "publishing". */
export const FIRST_CHECK = 4000;
/** Every 15 s for the first 5 minutes… */
export const QUICK_CHECK = 15_000;
export const QUICK_FOR = 5 * 60_000;
/** …then every 30 s… */
export const SLOW_CHECK = 30_000;
/** …until 45 minutes have gone by (three times the usual run, with room for a retried shard). */
export const FOLLOW_FOR = 45 * 60_000;

/**
 * How long to wait before the next check, `elapsed` ms after the save; null when it's been
 * too long to keep asking.
 * @param {number} elapsed
 * @returns {number | null}
 */
export function nextDeployCheck(elapsed) {
  if (!(elapsed < FOLLOW_FOR)) return null;
  return elapsed < QUICK_FOR ? QUICK_CHECK : SLOW_CHECK;
}
