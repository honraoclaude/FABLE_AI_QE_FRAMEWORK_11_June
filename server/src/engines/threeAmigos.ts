// 3 Amigos Evaluator — QE Framework §3.
// Evaluates a story against INVEST, converts every weak criterion into an
// owned action item (BA / Dev / PO / QA), and gates "3 Amigos Complete" on
// all actions being resolved.

import type { ActionItem, Story } from '../types.js';
import type { InvestAssessment, InvestLetter } from './invest.js';

/** Which amigo owns fixing each INVEST criterion when it is weak. */
export const INVEST_OWNER: Record<InvestLetter, ActionItem['owner']> = {
  I: 'Dev', // dependencies / sequencing
  N: 'BA', // rewrite as outcome, not implementation contract
  V: 'PO', // value statement + priority
  E: 'BA', // add the detail the team needs to estimate
  S: 'BA', // split the story
  T: 'QA', // acceptance criteria / measurable thresholds
};

/**
 * Derive action items from an INVEST assessment. Every warn/fail criterion
 * becomes one owned action with a stable id (`invest-<letter>`), so done
 * status survives re-evaluation while resolved criteria drop their actions.
 */
export function deriveActions(invest: InvestAssessment, previous: ActionItem[] = []): ActionItem[] {
  const previousById = new Map(previous.map((a) => [a.id, a]));
  const actions: ActionItem[] = [];

  for (const c of invest.criteria) {
    if (c.status === 'pass') continue;
    const id = `invest-${c.letter}`;
    const description =
      c.suggestion ?? c.findings[0] ?? `${c.name}: needs attention before refinement`;
    actions.push({
      id,
      owner: INVEST_OWNER[c.letter],
      description,
      severity: c.status === 'fail' ? 'blocker' : 'attention',
      source: `INVEST ${c.letter} — ${c.name}`,
      done: previousById.get(id)?.done ?? false,
      jiraKey: previousById.get(id)?.jiraKey ?? null,
    });
  }
  return actions;
}

export interface ThreeAmigosEvaluation {
  invest: InvestAssessment;
  actions: ActionItem[];
  openActions: number;
  /** True when every action is done — story may be marked 3 Amigos Complete */
  ready: boolean;
  message: string;
}

export function evaluateThreeAmigos(
  story: Story,
  invest: InvestAssessment,
): ThreeAmigosEvaluation {
  const actions = deriveActions(invest, story.actions ?? []);
  const openActions = actions.filter((a) => !a.done).length;
  const ready = openActions === 0;
  return {
    invest,
    actions,
    openActions,
    ready,
    message: ready
      ? 'All actions resolved — story may be marked 3 Amigos Complete'
      : `${openActions} open action(s) — assign to ${[...new Set(actions.filter((a) => !a.done).map((a) => a.owner))].join(', ')}`,
  };
}

export interface CompleteResult {
  allowed: boolean;
  reason: string;
}

/** Gate for marking 3 Amigos complete: every evaluator action must be done. */
export function canMarkComplete(story: Story): CompleteResult {
  const open = (story.actions ?? []).filter((a) => !a.done);
  if (open.length > 0) {
    return {
      allowed: false,
      reason: `Cannot mark 3 Amigos complete: ${open.length} open action(s) — ${open
        .map((a) => `${a.owner}: ${a.source}`)
        .join('; ')}`,
    };
  }
  return { allowed: true, reason: 'All evaluator actions resolved' };
}
