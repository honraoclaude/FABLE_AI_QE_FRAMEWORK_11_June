// INVEST assessment engine — checks each story against the INVEST principle:
// Independent, Negotiable, Valuable, Estimable, Small, Testable.
// Complements the DoR gate (§2): DoR checks artefact completeness; INVEST
// checks story *quality*. Deterministic heuristics here; the AI path in
// ai/claude.ts produces the same shape with richer rationale.

import type { AcScenario, Story } from '../types.js';

export type InvestLetter = 'I' | 'N' | 'V' | 'E' | 'S' | 'T';
export type InvestStatus = 'pass' | 'warn' | 'fail';

export interface InvestCriterion {
  letter: InvestLetter;
  name: string;
  question: string;
  status: InvestStatus;
  findings: string[];
  suggestion: string | null;
}

export interface InvestAssessment {
  verdict: 'strong' | 'acceptable' | 'weak';
  summary: string;
  criteria: InvestCriterion[];
  source: 'heuristic' | 'ai';
}

const DEPENDENCY_LANGUAGE = /\bdepends? on|blocked by|waiting (?:on|for)|after (?:story|ticket|epic)|requires [A-Z][A-Z0-9]+-\d+/i;
const IMPLEMENTATION_MANDATE = /\bmust use|only use|implement (?:with|using)|specifically use|has to use\b/i;
const VALUE_LANGUAGE = /\bso that|in order to|because|enables?|allows? (?:users?|customers?|the team)|value\b/i;
const VAGUE_TERMS = /\bTBD\b|\bTBC\b|\?\?\?|to be (?:decided|confirmed|determined)|\bvarious\b|\bsomehow\b|\band so on\b/i;
const SCOPE_CREEP = /\bentire\b|\bend[- ]to[- ]end overhaul\b|\ball (?:modules|pages|systems|screens)\b|complete (?:rewrite|overhaul)|\bplatform[- ]wide\b/i;
const UNMEASURABLE = /\b(?:fast|quick|easy|simple|intuitive|user[- ]?friendly|better|nice|seamless|robust)\b/i;
const MEASURABLE = /\d|\bwithin\b|\bunder\b|\bat least\b|\bno more than\b/;

export function assessInvest(story: Story, scenarios: AcScenario[] = []): InvestAssessment {
  const text = `${story.title} ${story.description}`;
  const criteria: InvestCriterion[] = [];

  // I — Independent
  {
    const findings: string[] = [];
    if (DEPENDENCY_LANGUAGE.test(text)) {
      findings.push('Dependency language found in the story text (depends on / blocked by / requires …)');
    }
    if (story.dorChecks['dependencies_identified']) {
      findings.push('Dependencies were reviewed at DoR and identified or stated as none');
    }
    criteria.push({
      letter: 'I',
      name: 'Independent',
      question: 'Can this story be delivered without waiting on other stories?',
      status: DEPENDENCY_LANGUAGE.test(text) ? 'warn' : 'pass',
      findings,
      suggestion: DEPENDENCY_LANGUAGE.test(text)
        ? 'Split or re-order so the story is deliverable on its own, or link the blocking ticket explicitly'
        : null,
    });
  }

  // N — Negotiable
  {
    const findings: string[] = [];
    let status: InvestStatus = 'pass';
    if (!story.description.trim()) {
      status = 'warn';
      findings.push('No description — there is no scope to negotiate during refinement');
    }
    if (IMPLEMENTATION_MANDATE.test(text)) {
      status = 'warn';
      findings.push('Story prescribes an implementation (“must use …”) — it reads as a contract, not a conversation');
    }
    criteria.push({
      letter: 'N',
      name: 'Negotiable',
      question: 'Does the story leave room for the team to discuss the how?',
      status,
      findings,
      suggestion:
        status === 'warn'
          ? 'State the outcome and constraints; leave implementation choices to the 3 Amigos conversation'
          : null,
    });
  }

  // V — Valuable
  {
    const findings: string[] = [];
    let status: InvestStatus;
    if (VALUE_LANGUAGE.test(story.description) || story.dorChecks['business_value']) {
      status = 'pass';
      findings.push("A 'why' / value statement is present");
    } else {
      status = 'fail';
      findings.push("No 'so that…' / 'in order to…' value statement found");
    }
    if (!story.priority) {
      if (status === 'pass') status = 'warn';
      findings.push('No priority assigned — value to the business is unranked');
    }
    criteria.push({
      letter: 'V',
      name: 'Valuable',
      question: 'Is the value to a user or the business stated?',
      status,
      findings,
      suggestion:
        status === 'pass'
          ? null
          : "Add the 'why': As a <persona> I want <capability> so that <benefit> — and have the PO set priority",
    });
  }

  // E — Estimable
  {
    const findings: string[] = [];
    let status: InvestStatus = 'pass';
    if (story.description.trim().length < 30) {
      status = 'fail';
      findings.push('Description is too thin for the team to estimate');
    } else if (VAGUE_TERMS.test(text)) {
      status = 'warn';
      findings.push('Vague terms (TBD / various / to be confirmed) make estimation unreliable');
    }
    if (story.edgeCases.length > 0) {
      findings.push(`${story.edgeCases.length} edge case(s) already identified — helps estimation`);
    }
    criteria.push({
      letter: 'E',
      name: 'Estimable',
      question: 'Is there enough known detail for the team to size it?',
      status,
      findings,
      suggestion:
        status === 'pass'
          ? null
          : 'Add concrete detail (current vs expected behaviour, affected journey) and resolve TBDs before refinement',
    });
  }

  // S — Small
  {
    const findings: string[] = [];
    let status: InvestStatus = 'pass';
    if (SCOPE_CREEP.test(text)) {
      status = 'warn';
      findings.push('Scope language suggests more than one sprint (entire / all modules / complete rewrite)');
    }
    if (/\band\b/i.test(story.title)) {
      status = 'warn';
      findings.push("Title joins multiple outcomes with 'and' — possibly a compound story");
    }
    if (story.edgeCases.length > 6) {
      status = 'warn';
      findings.push(`${story.edgeCases.length} edge cases — consider splitting by scenario group`);
    }
    if (story.dorChecks['fits_sprint']) {
      findings.push('Confirmed at DoR to fit within one sprint');
    }
    criteria.push({
      letter: 'S',
      name: 'Small',
      question: 'Will it comfortably fit in one sprint?',
      status,
      findings,
      suggestion:
        status === 'pass' ? null : 'Split using SPIDR (paths, interfaces, data, rules) into independently shippable slices',
    });
  }

  // T — Testable
  {
    const findings: string[] = [];
    let status: InvestStatus;
    if (scenarios.length > 0) {
      status = 'pass';
      findings.push(`${scenarios.length} AC scenario(s) exist${scenarios.some((s) => s.approved) ? ' (QA-approved)' : ''}`);
    } else if (story.dorChecks['ac_drafted']) {
      status = 'pass';
      findings.push('Acceptance criteria drafted at DoR');
    } else {
      status = 'fail';
      findings.push('No acceptance criteria — nothing to verify against');
    }
    if (UNMEASURABLE.test(text) && !MEASURABLE.test(text)) {
      if (status === 'pass') status = 'warn';
      findings.push('Subjective adjectives (fast / easy / intuitive) without measurable thresholds');
    }
    criteria.push({
      letter: 'T',
      name: 'Testable',
      question: 'Can QA prove it done or not done?',
      status,
      findings,
      suggestion:
        status === 'pass'
          ? null
          : 'Generate AC (portal → Generate AC) and replace subjective adjectives with measurable thresholds',
    });
  }

  const fails = criteria.filter((c) => c.status === 'fail').length;
  const warns = criteria.filter((c) => c.status === 'warn').length;
  const verdict = fails > 0 ? 'weak' : warns > 0 ? 'acceptable' : 'strong';
  const summary =
    verdict === 'strong'
      ? 'Meets all six INVEST criteria'
      : verdict === 'acceptable'
        ? `${warns} criterion/criteria need attention before refinement`
        : `${fails} INVEST failure(s) — not ready for refinement`;

  return { verdict, summary, criteria, source: 'heuristic' };
}
