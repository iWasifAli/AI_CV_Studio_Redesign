import 'server-only';
import { getUserStore } from '@/modules/store';
import { today } from '@/modules/metrics/server';
import { aggregate, popularity, summarise, type UsageNote } from './usage';

/** Records notes in one write. Never throws (usage numbers must not break the product). */
export async function recordUsage(notes: readonly UsageNote[]): Promise<void> {
  const counts = aggregate(notes);
  if (!Object.keys(counts).length) return;
  await getUserStore()
    .bumpDesignUsage(today(), counts)
    .catch((e: Error) =>
      console.warn(JSON.stringify({ level: 'warn', area: 'design-usage', message: e.message })),
    );
}

export async function usageSummary(days = 30) {
  const to = today();
  const from = today(new Date(Date.now() - (days - 1) * 86_400_000));
  return { from, to, ...summarise(await getUserStore().getDesignUsage(from, to)) };
}

let cache: { at: number; value: Record<string, number> } | null = null;
/** 30-day popularity, cached for 10 minutes per server instance. */
export async function popularityCached(now = Date.now()): Promise<Record<string, number>> {
  if (cache && now - cache.at < 10 * 60_000) return cache.value;
  const value = popularity((await usageSummary(30)).rows);
  cache = { at: now, value };
  return value;
}
