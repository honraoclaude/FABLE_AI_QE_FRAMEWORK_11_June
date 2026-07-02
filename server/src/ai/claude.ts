// Claude API integration — QE Framework §16 names "Claude API (Sonnet)" for
// AC generation, risk identification, and DoR/DoD assessment.
//
// AI is an enhancement, never a gate: every call degrades to `null` when no
// ANTHROPIC_API_KEY is configured or the request fails, and callers fall back
// to the deterministic template engines.

import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import type { AcScenario, Risk, RiskType, Story } from '../types.js';
import { applyAutomationScoring, categoriseScenario } from '../engines/ac.js';
import { scoreRisk } from '../engines/risk.js';
import type { InvestAssessment, InvestCriterion } from '../engines/invest.js';

// The framework spec (§16) selects Sonnet for AI assessment; override with QE_AI_MODEL.
const MODEL = process.env.QE_AI_MODEL ?? 'claude-sonnet-4-6';

export function aiAvailable(): boolean {
  // QE_DISABLE_AI=1 forces the deterministic template path (used by e2e tests
  // so they stay fast, free, and repeatable even when a key is configured).
  if (process.env.QE_DISABLE_AI === '1') return false;
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/** Shared client + model for other AI modules (e.g. the Sprint Copilot). */
export function anthropicClient(): Anthropic {
  return getClient();
}
export function aiModel(): string {
  return MODEL;
}

/**
 * Optional MCP enrichment (Phase 3, §18): when ATLASSIAN_MCP_URL is set and a
 * story carries a jiraKey, AC generation runs through the Claude API MCP
 * connector so the model can fetch the Jira issue, comments, and linked
 * tickets itself for full context.
 */
function atlassianMcpServer(): { type: 'url'; name: string; url: string; authorization_token?: string } | null {
  const url = process.env.ATLASSIAN_MCP_URL;
  if (!url) return null;
  return {
    type: 'url',
    name: 'atlassian',
    url,
    ...(process.env.ATLASSIAN_MCP_TOKEN ? { authorization_token: process.env.ATLASSIAN_MCP_TOKEN } : {}),
  };
}

function firstText(response: { content: { type: string }[] }): string {
  const block = response.content.find(
    (b): b is { type: 'text'; text: string } => b.type === 'text',
  );
  if (!block) throw new Error('No text block in response');
  return block.text;
}

const AC_SCHEMA = {
  type: 'object',
  properties: {
    scenarios: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          kind: { type: 'string', enum: ['happy', 'negative', 'edge', 'security', 'accessibility'] },
          given: { type: 'string' },
          when: { type: 'string' },
          then: { type: 'string' },
        },
        required: ['title', 'kind', 'given', 'when', 'then'],
        additionalProperties: false,
      },
    },
  },
  required: ['scenarios'],
  additionalProperties: false,
} as const;

/**
 * Generate Gherkin AC scenarios with Claude (§5.1). Returns null when AI is
 * unavailable or the call fails — caller falls back to the template engine.
 */
export async function generateScenariosWithAi(story: Story): Promise<AcScenario[] | null> {
  if (!aiAvailable()) return null;
  try {
    const system =
      'You are a senior QA engineer generating acceptance criteria as Gherkin scenarios. ' +
      'Minimum output: one happy path, one negative path, and one scenario per listed edge case. ' +
      'Add security scenarios for stories touching auth, payments, or personal data, and the ' +
      'standard WCAG 2.1 AA accessibility scenarios for UI stories. Be specific and testable.';
    const storyPayload = JSON.stringify({
      title: story.title,
      description: story.description,
      type: story.type,
      module: story.module,
      touches: story.touches,
      edgeCases: story.edgeCases,
      jiraKey: story.jiraKey ?? null,
    });

    const mcp = atlassianMcpServer();
    const response =
      mcp && story.jiraKey
        ? // MCP-enriched path: Claude pulls the Jira issue itself for full context.
          await getClient().beta.messages.create({
            model: MODEL,
            max_tokens: 8000,
            betas: ['mcp-client-2025-11-20'],
            mcp_servers: [mcp],
            system:
              system +
              ` Before writing scenarios, fetch Jira issue ${story.jiraKey} (including comments and linked issues) for full context.`,
            messages: [{ role: 'user', content: storyPayload }],
            output_config: { format: { type: 'json_schema', schema: AC_SCHEMA } },
          })
        : await getClient().messages.create({
            model: MODEL,
            max_tokens: 8000,
            system,
            messages: [{ role: 'user', content: storyPayload }],
            output_config: { format: { type: 'json_schema', schema: AC_SCHEMA } },
          });

    const parsed = JSON.parse(firstText(response)) as {
      scenarios: { title: string; kind: AcScenario['kind']; given: string; when: string; then: string }[];
    };

    return parsed.scenarios.map((s) => {
      const scenario: AcScenario = {
        id: randomUUID(),
        storyId: story.id,
        title: s.title,
        kind: s.kind,
        gherkin: { given: s.given, when: s.when, then: s.then },
        testTypes: [],
        automationCandidate: false,
        automationLayer: 'manual',
        automationReasons: [],
        approved: false,
        source: 'ai',
      };
      scenario.testTypes = categoriseScenario(scenario);
      return applyAutomationScoring(scenario);
    });
  } catch (err) {
    console.error('[ai] AC generation failed, falling back to template:', err);
    return null;
  }
}

const INVEST_SCHEMA = {
  type: 'object',
  properties: {
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          letter: { type: 'string', enum: ['I', 'N', 'V', 'E', 'S', 'T'] },
          status: { type: 'string', enum: ['pass', 'warn', 'fail'] },
          findings: { type: 'array', items: { type: 'string' } },
          suggestion: { type: ['string', 'null'] },
        },
        required: ['letter', 'status', 'findings', 'suggestion'],
        additionalProperties: false,
      },
    },
    summary: { type: 'string' },
  },
  required: ['criteria', 'summary'],
  additionalProperties: false,
} as const;

const INVEST_META: Record<string, { name: string; question: string }> = {
  I: { name: 'Independent', question: 'Can this story be delivered without waiting on other stories?' },
  N: { name: 'Negotiable', question: 'Does the story leave room for the team to discuss the how?' },
  V: { name: 'Valuable', question: 'Is the value to a user or the business stated?' },
  E: { name: 'Estimable', question: 'Is there enough known detail for the team to size it?' },
  S: { name: 'Small', question: 'Will it comfortably fit in one sprint?' },
  T: { name: 'Testable', question: 'Can QA prove it done or not done?' },
};

/**
 * Assess a story against INVEST with Claude. Returns null when AI is
 * unavailable — caller falls back to the heuristic engine.
 */
export async function assessInvestWithAi(
  story: Story,
  scenarios: AcScenario[],
): Promise<InvestAssessment | null> {
  if (!aiAvailable()) return null;
  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 4000,
      system:
        'You are an agile coach and QE lead assessing a user story against the INVEST principle ' +
        '(Independent, Negotiable, Valuable, Estimable, Small, Testable). Return exactly one entry ' +
        'per letter. Be specific: cite the story text in findings, and make suggestions actionable. ' +
        'pass = clearly satisfied, warn = needs attention before refinement, fail = blocks refinement.',
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            title: story.title,
            description: story.description,
            type: story.type,
            priority: story.priority,
            module: story.module,
            edgeCases: story.edgeCases,
            existingAcScenarios: scenarios.map((s) => s.title),
          }),
        },
      ],
      output_config: { format: { type: 'json_schema', schema: INVEST_SCHEMA } },
    });

    const parsed = JSON.parse(firstText(response)) as {
      criteria: { letter: string; status: 'pass' | 'warn' | 'fail'; findings: string[]; suggestion: string | null }[];
      summary: string;
    };

    const criteria: InvestCriterion[] = parsed.criteria
      .filter((c) => INVEST_META[c.letter])
      .map((c) => ({
        letter: c.letter as InvestCriterion['letter'],
        name: INVEST_META[c.letter]!.name,
        question: INVEST_META[c.letter]!.question,
        status: c.status,
        findings: c.findings,
        suggestion: c.suggestion,
      }));
    if (criteria.length !== 6) throw new Error(`expected 6 INVEST criteria, got ${criteria.length}`);

    const fails = criteria.filter((c) => c.status === 'fail').length;
    const warns = criteria.filter((c) => c.status === 'warn').length;
    return {
      verdict: fails > 0 ? 'weak' : warns > 0 ? 'acceptable' : 'strong',
      summary: parsed.summary,
      criteria,
      source: 'ai',
    };
  } catch (err) {
    console.error('[ai] INVEST assessment failed, falling back to heuristics:', err);
    return null;
  }
}

const RBT_SCHEMA = {
  type: 'object',
  properties: {
    executiveSummary: { type: 'string' },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['business', 'functional', 'integration', 'security', 'performance', 'data', 'compliance', 'operational', 'ux'],
          },
          area: { type: 'string' },
          description: { type: 'string' },
          rootCause: { type: 'string' },
          businessImpact: { type: 'string' },
          impact: { type: 'integer', enum: [1, 2, 3, 4, 5] },
          likelihood: { type: 'integer', enum: [1, 2, 3, 4, 5] },
          owner: { type: 'string', enum: ['PO', 'BA', 'Dev', 'QA', 'QE Lead', 'Release Manager'] },
          mitigation: { type: 'string' },
        },
        required: ['category', 'area', 'description', 'rootCause', 'businessImpact', 'impact', 'likelihood', 'owner', 'mitigation'],
        additionalProperties: false,
      },
    },
  },
  required: ['executiveSummary', 'risks'],
  additionalProperties: false,
} as const;

/**
 * Identify product risks for the RBT framework with Claude (Senior QE Lead
 * persona). Returns null when AI is unavailable — caller falls back to the
 * rule-based template.
 */
export async function identifyRbtRisksWithAi(
  ctx: import('../engines/rbt.js').ProductContext,
): Promise<{ executiveSummary: string; risks: import('../engines/rbt.js').IdentifiedRisk[] } | null> {
  if (!aiAvailable()) return null;
  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 12000,
      system:
        'You are a Senior Quality Engineering Lead with expertise in Risk-Based Testing, test strategy, ' +
        'and product quality governance. From the product context, identify and categorize product risks ' +
        'across business, functional, integration, security, performance, data, compliance, operational, ' +
        'and user-experience categories. Cover every key business process, every integration, and every ' +
        'stated regulation. Rate impact 1–5 (worst of financial / customer / regulatory / brand) and ' +
        'likelihood 1–5 (defect trends / complexity / change frequency / dependency exposure). Make root ' +
        'causes and mitigations specific to this product, not generic. Also write a 4–6 sentence executive ' +
        'summary of the risk posture and recommended testing investment.',
      messages: [{ role: 'user', content: JSON.stringify(ctx) }],
      output_config: { format: { type: 'json_schema', schema: RBT_SCHEMA } },
    });

    const parsed = JSON.parse(firstText(response)) as {
      executiveSummary: string;
      risks: {
        category: import('../engines/rbt.js').RiskCategory;
        area: string; description: string; rootCause: string; businessImpact: string;
        impact: number; likelihood: number;
        owner: import('../engines/rbt.js').IdentifiedRisk['owner'];
        mitigation: string;
      }[];
    };

    const { scoreRisk5x5 } = await import('../engines/rbt.js');
    const counters = new Map<string, number>();
    const prefix: Record<string, string> = {
      business: 'BUS', functional: 'FUN', integration: 'INT', security: 'SEC',
      performance: 'PER', data: 'DAT', compliance: 'COM', operational: 'OPS', ux: 'UX',
    };
    const risks = parsed.risks.map((r) => {
      const n = (counters.get(r.category) ?? 0) + 1;
      counters.set(r.category, n);
      const { score, level } = scoreRisk5x5(r.impact, r.likelihood);
      return { riskId: `${prefix[r.category]}-${n}`, ...r, score, level, status: 'open' as const };
    });
    return { executiveSummary: parsed.executiveSummary, risks };
  } catch (err) {
    console.error('[ai] RBT risk identification failed, falling back to template:', err);
    return null;
  }
}

const RISK_SCHEMA = {
  type: 'object',
  properties: {
    risks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: [
              'coverage_gap', 'dependency', 'regression', 'complexity',
              'technical_debt', 'data', 'performance', 'security',
            ],
          },
          description: { type: 'string' },
          severity: { type: 'integer', enum: [1, 2, 3, 4] },
          likelihood: { type: 'integer', enum: [1, 2, 3, 4] },
        },
        required: ['type', 'description', 'severity', 'likelihood'],
        additionalProperties: false,
      },
    },
  },
  required: ['risks'],
  additionalProperties: false,
} as const;

/**
 * Identify product risks for a story with Claude (§6.1). Returns null when AI
 * is unavailable — risk entry then stays a QE-manual activity.
 */
export async function analyseRisksWithAi(story: Story): Promise<Risk[] | null> {
  if (!aiAvailable()) return null;
  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 4000,
      system:
        'You are a QE lead identifying product risks from a user story. Look for vague ' +
        'requirements, missing AC, large scope, cross-team dependencies, untested error states, ' +
        'and security concerns. Rate severity and likelihood 1 (low) to 4 (critical).',
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            title: story.title,
            description: story.description,
            type: story.type,
            module: story.module,
            touches: story.touches,
            edgeCases: story.edgeCases,
          }),
        },
      ],
      output_config: { format: { type: 'json_schema', schema: RISK_SCHEMA } },
    });

    const parsed = JSON.parse(firstText(response)) as {
      risks: { type: RiskType; description: string; severity: number; likelihood: number }[];
    };

    const now = new Date().toISOString();
    return parsed.risks.map((r) => {
      const { score, band, action } = scoreRisk(r.severity, r.likelihood);
      return {
        id: randomUUID(),
        type: r.type,
        module: story.module,
        description: r.description,
        severity: r.severity,
        likelihood: r.likelihood,
        score,
        band,
        action,
        mitigation: null,
        source: 'ai' as const,
        status: 'open' as const,
        createdAt: now,
      };
    });
  } catch (err) {
    console.error('[ai] Risk analysis failed:', err);
    return null;
  }
}
