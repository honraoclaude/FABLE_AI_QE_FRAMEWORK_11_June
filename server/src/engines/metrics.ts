// Core quality metrics — QE Framework §14.1
// Each metric reports its value, target, and whether the target is met.

export interface MetricsInput {
  prodBugs: number;
  totalBugs: number;
  bugsCaughtBeforeDev: number;
  automatedTests: number;
  totalTests: number;
  avgSprintsToDetect: number; // MTTD in sprints
  storiesMeetingFullDod: number;
  storiesDelivered: number;
  flakyTests: number;
  autoTestsThatCaughtBug: number;
}

export interface Metric {
  id: string;
  name: string;
  definition: string;
  value: number;
  unit: '%' | 'sprints';
  target: string;
  met: boolean;
}

const pct = (num: number, den: number): number =>
  den > 0 ? Math.round((num / den) * 1000) / 10 : 0;

export function computeMetrics(i: MetricsInput): Metric[] {
  const escapeRate = pct(i.prodBugs, i.totalBugs);
  const shiftLeft = pct(i.bugsCaughtBeforeDev, i.totalBugs);
  const automationCoverage = pct(i.automatedTests, i.totalTests);
  const dodCompliance = pct(i.storiesMeetingFullDod, i.storiesDelivered);
  const flakiness = pct(i.flakyTests, i.totalTests);
  const automationRoi = pct(i.autoTestsThatCaughtBug, i.automatedTests);

  return [
    {
      id: 'escape_rate', name: 'Escape Rate',
      definition: 'Prod bugs / total bugs × 100',
      value: escapeRate, unit: '%', target: '< 5%', met: escapeRate < 5,
    },
    {
      id: 'shift_left_index', name: 'Shift-Left Index',
      definition: '% bugs caught before dev starts',
      value: shiftLeft, unit: '%', target: '> 30%', met: shiftLeft > 30,
    },
    {
      id: 'automation_coverage', name: 'Automation Coverage',
      definition: '% tests automated per module',
      value: automationCoverage, unit: '%', target: '> 80%', met: automationCoverage > 80,
    },
    {
      id: 'mttd', name: 'MTTD',
      definition: 'Time from bug intro to detection',
      value: i.avgSprintsToDetect, unit: 'sprints', target: '< 1 sprint', met: i.avgSprintsToDetect < 1,
    },
    {
      id: 'dod_compliance', name: 'DoD Compliance',
      definition: '% stories meeting full DoD',
      value: dodCompliance, unit: '%', target: '> 95%', met: dodCompliance > 95,
    },
    {
      id: 'flakiness', name: 'Test Flakiness Rate',
      definition: '% tests with intermittent results',
      value: flakiness, unit: '%', target: '< 2%', met: flakiness < 2,
    },
    {
      id: 'automation_roi', name: 'Automation ROI',
      definition: '% of auto tests that caught a bug',
      value: automationRoi, unit: '%', target: '> 70%', met: automationRoi > 70,
    },
  ];
}
