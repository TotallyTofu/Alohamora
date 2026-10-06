import { log } from './log';
import { cacheDir, jobsTempRoot } from './paths';
import { removeOlderThan } from './util';

const DAY = 24 * 60 * 60 * 1000;

/** Startup clean-up: old preview proxies (7 days) and leftover job folders (1 day). Runs in the background. */
export async function runHousekeeping(): Promise<void> {
  const proxies = await removeOlderThan(cacheDir('proxies'), 7 * DAY);
  const jobs = await removeOlderThan(jobsTempRoot(), DAY);
  if (proxies || jobs) log.info('Housekeeping removed', { proxies, jobs });
}
