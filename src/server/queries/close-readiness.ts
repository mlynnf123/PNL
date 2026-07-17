import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { costCategoryFinalizations, jobs, revenueComponents } from '@/db/schema';
import { getJobFinancialSummary } from './job-financial-summary';

export interface CloseGateResult {
  gate: string;
  label: string;
  passed: boolean;
  blocker?: string;
}

// docs/04_WORKFLOWS_SCREENS_AND_PERMISSIONS.md SS7 close gates. Documents,
// depreciation-specific tracking, and exceptions are deferred along with
// their underlying tables (see docs/07 Phase 3 status) — the gates below
// cover what Phase 3 actually builds: completion, revenue, collections, and
// the three finalizable cost categories.
export async function evaluateCloseReadiness(
  jobId: string,
  db: DbOrTx = defaultDb,
): Promise<CloseGateResult[]> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const results: CloseGateResult[] = [];

  const operationallyComplete = job.operationalStatus === 'OperationallyComplete';
  results.push({
    gate: 'operational_completion',
    label: 'Operational completion',
    passed: operationallyComplete,
    blocker: operationallyComplete
      ? undefined
      : `Job is ${job.operationalStatus}, not OperationallyComplete`,
  });

  const draftRevenue = await db
    .select()
    .from(revenueComponents)
    .where(and(eq(revenueComponents.jobId, jobId), eq(revenueComponents.status, 'Draft')));
  results.push({
    gate: 'revenue_approved',
    label: 'Expected revenue',
    passed: draftRevenue.length === 0,
    blocker:
      draftRevenue.length === 0
        ? undefined
        : `${draftRevenue.length} draft revenue component(s) remain unresolved`,
  });

  const summary = await getJobFinancialSummary(jobId, db);
  const remainingIsZero = Number(summary.remainingToCollect) === 0;
  results.push({
    gate: 'collections_complete',
    label: 'Collections',
    passed: remainingIsZero,
    blocker: remainingIsZero ? undefined : `$${summary.remainingToCollect} remaining to collect`,
  });

  const finalizations = await db
    .select()
    .from(costCategoryFinalizations)
    .where(eq(costCategoryFinalizations.jobId, jobId));
  const finalizationByCategory = new Map(finalizations.map((f) => [f.category, f]));

  const categories = [
    ['labor', 'Labor'],
    ['material', 'Materials'],
    ['adjustments', 'Adjustments'],
  ] as const;

  for (const [category, label] of categories) {
    const passed = finalizationByCategory.get(category)?.status === 'Final';
    results.push({
      gate: `${category}_final`,
      label,
      passed,
      blocker: passed ? undefined : `${label} has not been finalized`,
    });
  }

  return results;
}

export function isCloseReady(results: CloseGateResult[]): boolean {
  return results.every((result) => result.passed);
}
