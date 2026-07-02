// AI for the Product Owner module — Claude-generated conflict resolutions,
// story decomposition, and hidden-complexity detection for Jira-synced
// stories (the sample backlog ships hand-authored equivalents). All gated on
// aiAvailable(); callers surface setup guidance when AI is off.

import { aiAvailable, aiModel, anthropicClient } from './claude.js';
import type { ScoredStory } from '../engines/backlog.js';
import type { ConflictResolution, Refinement } from '../backlog-data.js';

function storyPayload(s: ScoredStory): Record<string, unknown> {
  return {
    id: s.id, title: s.title, userStory: s.userStory, businessValue: s.businessValue,
    type: s.storyType, effortWeeks: s.effort, health: s.health, rice: s.riceScore,
    confidence: s.confidence, regulated: s.regulated, dependencies: s.dependencies,
    votes: s.votes, conflictPct: s.conflictIdx, outcome: s.outcome,
  };
}

function firstText(content: { type: string }[]): string {
  const block = content.find((b): b is { type: 'text'; text: string } => b.type === 'text');
  if (!block) throw new Error('No text block in response');
  return block.text;
}

const OPTION_SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string' },
    opsImpact: { type: 'string' },
    leadershipImpact: { type: 'string' },
    engImpact: { type: 'string' },
    risk: { type: 'string' },
  },
  required: ['label', 'opsImpact', 'leadershipImpact', 'engImpact', 'risk'],
  additionalProperties: false,
} as const;

const CONFLICT_SCHEMA = {
  type: 'object',
  properties: {
    coreTension: { type: 'string' },
    opsPosition: { type: 'string' },
    leadershipPosition: { type: 'string' },
    engPosition: { type: 'string' },
    optionA: OPTION_SCHEMA,
    optionB: OPTION_SCHEMA,
    recommendedOption: { type: 'string', enum: ['A', 'B'] },
    recommendationReason: { type: 'string' },
  },
  required: ['coreTension', 'opsPosition', 'leadershipPosition', 'engPosition', 'optionA', 'optionB', 'recommendedOption', 'recommendationReason'],
  additionalProperties: false,
} as const;

export async function generateConflictResolutionWithAi(story: ScoredStory): Promise<ConflictResolution | null> {
  if (!aiAvailable()) return null;
  try {
    const response = await anthropicClient().messages.create({
      model: aiModel(),
      max_tokens: 4000,
      system:
        'You are a senior product owner in an FCA-regulated financial services firm resolving stakeholder ' +
        'conflict on a backlog story. Votes are 1 (strongly fix/stabilise first) to 5 (strongly build new ' +
        'capability). Infer each group\'s realistic position from the story and votes, then produce two named ' +
        'resolution options with per-stakeholder impact and risk, and recommend one with clear reasoning. ' +
        'Be specific to this story — no generic advice.',
      messages: [{ role: 'user', content: JSON.stringify(storyPayload(story)) }],
      output_config: { format: { type: 'json_schema', schema: CONFLICT_SCHEMA } },
    });
    const parsed = JSON.parse(firstText(response.content)) as Omit<ConflictResolution, 'storyId' | 'title' | 'conflictIdx'>;
    return { storyId: story.id, title: story.title, conflictIdx: story.conflictIdx, ...parsed };
  } catch (err) {
    console.error('[ai] conflict resolution failed:', err);
    return null;
  }
}

const REFINEMENT_SCHEMA = {
  type: 'object',
  properties: {
    shouldDecompose: { type: 'boolean' },
    reason: { type: 'string' },
    subStories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          userStory: { type: 'string' },
          effortWeeks: { type: 'integer' },
          priority: { type: 'string', enum: ['High', 'Medium', 'Low'] },
          rationale: { type: 'string' },
        },
        required: ['title', 'userStory', 'effortWeeks', 'priority', 'rationale'],
        additionalProperties: false,
      },
    },
    hiddenRisks: { type: 'array', items: { type: 'string' } },
    missingElements: { type: 'array', items: { type: 'string' } },
    refinementAdvice: { type: 'string' },
  },
  required: ['shouldDecompose', 'reason', 'subStories', 'hiddenRisks', 'missingElements', 'refinementAdvice'],
  additionalProperties: false,
} as const;

export async function decomposeStoryWithAi(story: ScoredStory): Promise<Refinement | null> {
  if (!aiAvailable()) return null;
  try {
    const response = await anthropicClient().messages.create({
      model: aiModel(),
      max_tokens: 4000,
      system:
        'You are a senior product owner refining a backlog story in an FCA-regulated financial services firm. ' +
        'If effort is 5+ weeks, decompose into 2–4 independently shippable sub-stories (each with user-story ' +
        'format, effort, priority, rationale); otherwise confirm sprint-readiness. Always list hidden risks, ' +
        'missing elements, and one-paragraph refinement advice. Regulated stories must call out compliance ' +
        'sign-offs (suitability, KYC/AML, audit trail) where relevant.',
      messages: [{ role: 'user', content: JSON.stringify(storyPayload(story)) }],
      output_config: { format: { type: 'json_schema', schema: REFINEMENT_SCHEMA } },
    });
    return JSON.parse(firstText(response.content)) as Refinement;
  } catch (err) {
    console.error('[ai] decomposition failed:', err);
    return null;
  }
}

export interface ComplexityFinding {
  storyId: string;
  complexityScore: number; // 1–10, independent of INVEST health
  redFlags: string[];
  reasoning: string;
}

const COMPLEXITY_SCHEMA = {
  type: 'object',
  properties: {
    complexityScore: { type: 'integer', enum: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
    redFlags: { type: 'array', items: { type: 'string' } },
    reasoning: { type: 'string' },
  },
  required: ['complexityScore', 'redFlags', 'reasoning'],
  additionalProperties: false,
} as const;

export async function detectHiddenComplexityWithAi(story: ScoredStory): Promise<ComplexityFinding | null> {
  if (!aiAvailable()) return null;
  try {
    const response = await anthropicClient().messages.create({
      model: aiModel(),
      max_tokens: 2000,
      system:
        'You are a battle-scarred delivery lead detecting hidden complexity in backlog stories — the ' +
        '"looks like 2 weeks, actually needs a vendor contract and 3 backend refactors" pattern. Consider ' +
        'integration surface, regulatory sign-offs (FCA/COBS/KYC), data migrations, third-party dependencies, ' +
        'and legacy coupling. Score 1 (as simple as it looks) to 10 (iceberg). List concrete red flags only ' +
        'when justified by the story content.',
      messages: [{ role: 'user', content: JSON.stringify(storyPayload(story)) }],
      output_config: { format: { type: 'json_schema', schema: COMPLEXITY_SCHEMA } },
    });
    const parsed = JSON.parse(firstText(response.content)) as Omit<ComplexityFinding, 'storyId'>;
    return { storyId: story.id, ...parsed };
  } catch (err) {
    console.error('[ai] complexity detection failed:', err);
    return null;
  }
}
