// Acceptance Criteria engine — QE Framework §5
// Template generation (offline fallback for the AI path), test-type
// categorisation, and automation candidate scoring.

import { randomUUID } from 'node:crypto';
import type { AcScenario, Gherkin, ScenarioKind, Story, TestType } from '../types.js';

// ---------------------------------------------------------------------------
// Generation (deterministic template path — §5.1 minimum output:
// one happy path, one negative path, one per edge case, plus auto security AC
// for auth/payments/personal-data stories and accessibility AC for UI stories)
// ---------------------------------------------------------------------------

/** Standard accessibility AC auto-added to UI stories (§11.2) */
export const STANDARD_ACCESSIBILITY_AC: { title: string; gherkin: Gherkin }[] = [
  {
    title: 'All interactive elements are keyboard navigable',
    gherkin: {
      given: 'a user navigating with the keyboard only',
      when: 'they tab through the new UI',
      then: 'every interactive element is reachable and operable without a mouse',
    },
  },
  {
    title: 'Screen reader announces form errors correctly',
    gherkin: {
      given: 'a screen reader user submits the form with invalid data',
      when: 'validation errors appear',
      then: 'each error is announced and associated with its field',
    },
  },
  {
    title: 'Colour contrast meets WCAG 2.1 AA (4.5:1 ratio)',
    gherkin: {
      given: 'the new UI is rendered',
      when: 'text and background colours are measured',
      then: 'all text meets the 4.5:1 contrast ratio',
    },
  },
  {
    title: 'Focus order is logical and visible',
    gherkin: {
      given: 'a keyboard user moves focus through the page',
      when: 'focus changes',
      then: 'the focus indicator is visible and the order follows the visual layout',
    },
  },
  {
    title: 'Images have descriptive alt text',
    gherkin: {
      given: 'the new UI contains images',
      when: 'assistive technology reads the page',
      then: 'every informative image has descriptive alternative text',
    },
  },
];

/** OWASP Top 10 checks by feature type (§10.2), used to phrase security AC */
const SECURITY_AC: Record<'auth' | 'payments' | 'personal_data', { title: string; gherkin: Gherkin }[]> = {
  auth: [
    {
      title: 'Access control prevents unauthorised access (OWASP A01)',
      gherkin: {
        given: 'a user without the required role',
        when: 'they attempt to access the protected resource directly',
        then: 'access is denied and the attempt is logged',
      },
    },
    {
      title: 'Authentication failures are handled safely (OWASP A07)',
      gherkin: {
        given: 'an attacker submitting repeated invalid credentials',
        when: 'login attempts exceed the threshold',
        then: 'the account is rate-limited and no credential information is leaked',
      },
    },
  ],
  payments: [
    {
      title: 'Payment data is protected in transit and at rest (OWASP A02)',
      gherkin: {
        given: 'a payment is submitted',
        when: 'data is transmitted and stored',
        then: 'card data is encrypted and never logged in plaintext',
      },
    },
    {
      title: 'Payment inputs are protected against injection (OWASP A03)',
      gherkin: {
        given: 'a payment form field',
        when: 'malicious input (SQL/script payloads) is submitted',
        then: 'the input is rejected or sanitised and no injection occurs',
      },
    },
  ],
  personal_data: [
    {
      title: 'Personal data is encrypted and minimised (OWASP A02)',
      gherkin: {
        given: 'personal data is captured',
        when: 'it is stored or transmitted',
        then: 'it is encrypted and only required fields are retained',
      },
    },
    {
      title: 'Security events involving personal data are logged (OWASP A09)',
      gherkin: {
        given: 'personal data is accessed',
        when: 'a read or export occurs',
        then: 'an audit log entry records who accessed what and when',
      },
    },
  ],
};

function makeScenario(
  storyId: string,
  kind: ScenarioKind,
  title: string,
  gherkin: Gherkin,
  source: 'ai' | 'template',
): AcScenario {
  const base: AcScenario = {
    id: randomUUID(),
    storyId,
    title,
    kind,
    gherkin,
    testTypes: [],
    automationCandidate: false,
    automationLayer: 'manual',
    automationReasons: [],
    approved: false,
    source,
  };
  base.testTypes = categoriseScenario(base);
  return applyAutomationScoring(base);
}

/** Deterministic Gherkin generation used when the Claude API is unavailable. */
export function generateScenariosTemplate(story: Story): AcScenario[] {
  const subject = story.title.trim() || 'the feature';
  const scenarios: AcScenario[] = [
    makeScenario(story.id, 'happy', `${subject} — happy path`, {
      given: `a valid user on the ${story.module} module`,
      when: `they complete "${subject}" with valid inputs`,
      then: 'the operation succeeds and the expected outcome is shown',
    }, 'template'),
    makeScenario(story.id, 'negative', `${subject} — negative path`, {
      given: `a user on the ${story.module} module`,
      when: `they attempt "${subject}" with invalid or missing inputs`,
      then: 'a clear error is shown and no partial state is persisted',
    }, 'template'),
  ];

  for (const edge of story.edgeCases) {
    scenarios.push(
      makeScenario(story.id, 'edge', `${subject} — edge: ${edge}`, {
        given: `the edge condition: ${edge}`,
        when: `the user performs "${subject}"`,
        then: 'the system behaves correctly and degrades gracefully',
      }, 'template'),
    );
  }

  for (const area of ['auth', 'payments', 'personal_data'] as const) {
    if (story.touches.includes(area)) {
      for (const sec of SECURITY_AC[area]) {
        scenarios.push(makeScenario(story.id, 'security', sec.title, sec.gherkin, 'template'));
      }
    }
  }

  if (story.touches.includes('ui')) {
    for (const a11y of STANDARD_ACCESSIBILITY_AC) {
      scenarios.push(makeScenario(story.id, 'accessibility', a11y.title, a11y.gherkin, 'template'));
    }
  }

  return scenarios;
}

// ---------------------------------------------------------------------------
// Categorisation — §5.2
// ---------------------------------------------------------------------------

const UNIT_HINTS = /\b(calculat|validat(e|ion)|format|single function|in isolation|rounding)\b/i;
const E2E_HINTS = /\b(journey|end[- ]to[- ]end|checkout flow|across (systems|services)|multiple systems)\b/i;
const API_HINTS = /\b(api|endpoint|response code|payload|encrypted|stored|persisted|logged|audit|rate.?limit)\b/i;
const UI_HINTS = /\b(click|screen|page|browser|keyboard|focus|contrast|alt text|screen reader|shown|displayed|form)\b/i;

export function categoriseScenario(s: Pick<AcScenario, 'title' | 'gherkin' | 'kind'>): TestType[] {
  const text = `${s.title} ${s.gherkin.given} ${s.gherkin.when} ${s.gherkin.then}`;
  const types = new Set<TestType>();

  if (UNIT_HINTS.test(text)) types.add('unit');
  if (E2E_HINTS.test(text)) types.add('e2e');
  if (API_HINTS.test(text) && !UI_HINTS.test(text)) types.add('api_automation');
  if (UI_HINTS.test(text)) types.add('ui_automation');
  if (s.kind === 'edge' || s.kind === 'negative') types.add('regression');

  // Every scenario validates a feature behaviour at some layer.
  if (!types.has('unit') && !types.has('e2e')) types.add('functional');
  if (types.size === 0) types.add('functional');
  return [...types];
}

// ---------------------------------------------------------------------------
// Automation candidate scoring — §5.3
// Repeatability / Stability / Complexity / Frequency / Layer
// ---------------------------------------------------------------------------

export interface AutomationSignals {
  runsEveryBuild: boolean;
  staticDataOrUi: boolean;
  requiresManualJudgement: boolean;
  highRegressionRisk: boolean;
  apiTestableWithoutUi: boolean;
}

export function scoreAutomation(signals: AutomationSignals): {
  candidate: boolean;
  layer: 'api' | 'ui' | 'manual';
  reasons: string[];
} {
  const reasons: string[] = [];
  if (signals.requiresManualJudgement) {
    return {
      candidate: false,
      layer: 'manual',
      reasons: ['Complexity: too many variables or manual judgement required — keep manual'],
    };
  }
  if (signals.runsEveryBuild) reasons.push('Repeatability: runs on every build');
  if (signals.staticDataOrUi) reasons.push('Stability: relies on static data/UI');
  if (signals.highRegressionRisk) reasons.push('Frequency: high regression risk');

  const candidate = reasons.length > 0;
  const layer = !candidate ? 'manual' : signals.apiTestableWithoutUi ? 'api' : 'ui';
  if (candidate && signals.apiTestableWithoutUi) {
    reasons.push('Layer: API-testable without UI — API automation preferred');
  }
  return { candidate, layer, reasons };
}

/** Derive automation signals from a scenario's content and apply scoring. */
export function applyAutomationScoring(s: AcScenario): AcScenario {
  const isRegression = s.testTypes.includes('regression') || s.kind === 'security';
  const apiTestable = s.testTypes.includes('api_automation') && !s.testTypes.includes('ui_automation');
  const manualJudgement = s.kind === 'accessibility' && /audit|logical/i.test(s.title);

  const { candidate, layer, reasons } = scoreAutomation({
    runsEveryBuild: s.kind === 'happy' || isRegression,
    staticDataOrUi: s.source === 'template' || s.kind !== 'edge',
    requiresManualJudgement: manualJudgement,
    highRegressionRisk: isRegression,
    apiTestableWithoutUi: apiTestable,
  });

  return { ...s, automationCandidate: candidate, automationLayer: layer, automationReasons: reasons };
}
