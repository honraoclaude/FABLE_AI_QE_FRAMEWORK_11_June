// Sprint Copilot — a conversational agent over the backlog engines.
// Claude answers Product Owner questions by CALLING the engines as tools
// (build_sprint_plan, forecast_roadmap, generate_sprint_scenarios, …), so
// every number in an answer comes from the same deterministic functions the
// dashboard uses. The tool-execution layer is pure and unit-testable without
// the API; the agentic loop activates only when AI is enabled.

import type Anthropic from '@anthropic-ai/sdk';
import {
  buildSprint,
  buildSummary,
  computeRoadmap,
  computeFairness,
  generateScenarios,
  type Outcome,
  type ScoredStory,
} from '../engines/backlog.js';
import type { Refinement, ConflictResolution } from '../backlog-data.js';
import type { TrendPoint } from '../po-snapshots.js';
import { aiAvailable, aiModel, anthropicClient } from './claude.js';

export interface CopilotContext {
  stories: ScoredStory[];
  outcomes: Outcome[];
  refinements: Record<string, Refinement>;
  conflicts: ConflictResolution[];
  sprintHistory: Record<number, string[]>;
  trends: TrendPoint[];
  source: 'jira' | 'sample';
}

// ── Tool definitions (Anthropic tool-use schema) ────────────────────────────

export const COPILOT_TOOLS = [
  {
    name: 'get_backlog_overview',
    description:
      'Get the scored backlog: summary KPIs plus every story with rank, priority, RICE, INVEST health, status, type, effort, outcome, regulated flag and dependencies. Call this first for any question about the backlog as a whole.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_story_details',
    description:
      'Get full detail for one story: INVEST dimension scores, RICE inputs (reach/impact/confidence/effort), DoR checks, stakeholder votes and conflict, refinement analysis (decomposition, hidden risks, missing elements) and any authored conflict resolution. Use when asked why a story is ranked or scored the way it is.',
    input_schema: {
      type: 'object',
      properties: { story_id: { type: 'string', description: 'Story id, e.g. FSC-009 or SCRUM-8' } },
      required: ['story_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'build_sprint_plan',
    description:
      'Check a specific selection of stories against a sprint capacity. Returns total effort, over-capacity flag, dependency warnings, outcomes covered and average health. Use for "can we fit X and Y" questions.',
    input_schema: {
      type: 'object',
      properties: {
        story_ids: { type: 'array', items: { type: 'string' } },
        capacity_weeks: { type: 'number', description: 'Sprint capacity in weeks (default 10)' },
      },
      required: ['story_ids'],
      additionalProperties: false,
    },
  },
  {
    name: 'forecast_roadmap',
    description:
      'Compute the dependency-aware roadmap: which stories land in which sprint at a given capacity, when each business outcome is delivered, and the overall delivery summary. Use for "when will X ship" and capacity what-ifs.',
    input_schema: {
      type: 'object',
      properties: { capacity_weeks: { type: 'number', description: 'Sprint capacity in weeks (default 10)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'generate_sprint_scenarios',
    description:
      'Generate the three auto sprint scenarios (Fix First / Build First / Balanced) at a given capacity, each with stories, effort, average health, average stakeholder conflict and outcomes covered. Use for "what should we pull into the next sprint" questions.',
    input_schema: {
      type: 'object',
      properties: { capacity_weeks: { type: 'number', description: 'Sprint capacity in weeks (default 10)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_stakeholder_fairness',
    description:
      'Get stakeholder attention share over recent sprints (ops / leadership / engineering / compliance) and the rebalancing recommendation.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_trends',
    description:
      'Get the sprint-over-sprint snapshot history: readiness %, average INVEST health, conflict, total RICE and story counts per snapshot. Use for "is the backlog improving" questions. May be empty if history is short.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
] as const;

// ── Tool executor (pure, unit-testable) ─────────────────────────────────────

function condenseStory(s: ScoredStory) {
  return {
    id: s.id, rank: s.rank, title: s.title, type: s.storyType, status: s.status,
    health: s.health, rice: s.riceScore, priority: s.priority, effortWeeks: s.effort,
    outcome: s.outcome, regulated: s.regulated, dependencies: s.dependencies, conflictPct: s.conflictIdx,
  };
}

export function executeCopilotTool(name: string, input: Record<string, unknown>, ctx: CopilotContext): unknown {
  const capacity = (raw: unknown) => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.min(40, Math.max(1, Math.round(n))) : 10;
  };

  switch (name) {
    case 'get_backlog_overview':
      return {
        source: ctx.source,
        summary: buildSummary(ctx.stories, ctx.outcomes),
        outcomes: ctx.outcomes,
        stories: [...ctx.stories].sort((a, b) => a.rank - b.rank).map(condenseStory),
      };

    case 'get_story_details': {
      const id = String(input.story_id ?? '').trim();
      const s = ctx.stories.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!s) return { error: `No story with id "${id}". Valid ids: ${ctx.stories.map((x) => x.id).join(', ')}` };
      return {
        ...condenseStory(s),
        userStory: s.userStory,
        businessValue: s.businessValue,
        invest: s.invest,
        riceInputs: { reach: s.reach, impact: s.impact, confidence: s.confidence, effort: s.effort },
        priorityFormula: `priority ${s.priority} = RICE ${s.riceScore} × (health ${s.health}/100); rank #${s.rank} of ${ctx.stories.length}`,
        dorChecks: s.dorChecks,
        dorStatus: `${s.dorScore}/5 ${s.dorStatus}`,
        stakeholderVotes: s.votes,
        refinement: ctx.refinements[s.id] ?? null,
        conflictResolution: ctx.conflicts.find((c) => c.storyId === s.id) ?? null,
      };
    }

    case 'build_sprint_plan': {
      const ids = Array.isArray(input.story_ids) ? input.story_ids.map(String) : [];
      return buildSprint(ctx.stories, ids, capacity(input.capacity_weeks));
    }

    case 'forecast_roadmap': {
      const r = computeRoadmap(ctx.stories, capacity(input.capacity_weeks));
      return {
        deliverySummary: r.deliverySummary,
        outcomeSprints: r.outcomeSprints,
        sprints: r.sprints.map((sp) => ({
          sprint: sp.sprint, effort: sp.effort, capacity: sp.capacity,
          stories: sp.stories.map((s) => ({ id: s.id, title: s.title, effort: s.effort, status: s.status })),
        })),
      };
    }

    case 'generate_sprint_scenarios':
      return generateScenarios(ctx.stories, capacity(input.capacity_weeks));

    case 'get_stakeholder_fairness':
      return computeFairness(ctx.sprintHistory);

    case 'get_trends':
      return ctx.trends.length >= 2
        ? { points: ctx.trends }
        : { points: ctx.trends, note: 'Fewer than 2 snapshots — no trend can be computed yet.' };

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Agentic loop ─────────────────────────────────────────────────────────────

export interface CopilotTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolTraceEntry {
  tool: string;
  input: Record<string, unknown>;
}

export interface CopilotReply {
  reply: string;
  toolTrace: ToolTraceEntry[];
}

const SYSTEM_PROMPT =
  'You are Sprint Copilot inside the QE Intelligence Portal — an assistant for Product Owners and QE Leads ' +
  'managing a Financial Sales Cloud backlog in an FCA-regulated environment. ' +
  'You MUST answer questions about the backlog by calling the provided tools; never invent numbers. ' +
  'Cite the figures the tools return (ranks, RICE, health %, effort weeks, conflict %) so every recommendation ' +
  'shows its working. Scoring model: INVEST health = 6 dimensions/30 × 100; RICE = reach × impact × confidence ÷ effort; ' +
  'priority = RICE × health/100; readiness: ≥70% Sprint Ready, 40–69% Needs Refinement, <40% Blocked. ' +
  'Default sprint capacity is 10 weeks unless the user says otherwise. ' +
  'Be concise and executive-ready: short paragraphs or tight bullet lists, bold the recommendation, no filler. ' +
  'Flag FCA-regulated stories when they affect a recommendation.';

export function copilotAvailable(): boolean {
  return aiAvailable();
}

export async function runCopilot(turns: CopilotTurn[], ctx: CopilotContext): Promise<CopilotReply> {
  const client = anthropicClient();
  const toolTrace: ToolTraceEntry[] = [];

  const messages: Anthropic.MessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));

  for (let iteration = 0; iteration < 8; iteration++) {
    const response = await client.messages.create({
      model: aiModel(),
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      tools: COPILOT_TOOLS as unknown as Anthropic.Tool[],
      messages,
    });

    if (response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return { reply: text || 'I could not produce an answer — please rephrase the question.', toolTrace };
    }

    messages.push({ role: 'assistant', content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const input = (block.input ?? {}) as Record<string, unknown>;
      toolTrace.push({ tool: block.name, input });
      const result = executeCopilotTool(block.name, input, ctx);
      results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: 'user', content: results });
  }

  return { reply: 'I hit the tool-call limit before finishing — try a narrower question.', toolTrace };
}
