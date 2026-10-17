/**
 * Report generation for the canonical matrix runner.
 *
 * Everything written here restates the honest runner results — translation
 * success, controlled refusal, ambiguity, known gaps, infrastructure errors
 * and NOT RUN stay separately labeled. Nothing in a report may turn a known
 * gap or an infrastructure error into a pass.
 */

import {appendFile, mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

function escapeXml(value) {
  return String(value)
    .replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;').replace(/'/gu, '&apos;');
}

function clip(value, limit = 240) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function caseRecord({item, outcome, durationMs}) {
  return {
    id: item.id,
    tier: item.tier,
    direction: item.direction,
    family: item.family ?? null,
    construction: item.construction ?? null,
    expectedStatus: item.expected?.status ?? null,
    outcome: outcome?.pass === true ? 'PASS' : outcome?.kind === 'infra' ? 'INFRA' : 'FAIL',
    kind: outcome?.kind ?? null,
    observedStatus: outcome?.observed?.status ?? null,
    durationMs,
    failures: outcome?.failures ?? []
  };
}

function junit(tests, failures, errors, timeMs, cases) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="translation-matrix" tests="${tests}" failures="${failures}" ` +
      `errors="${errors}" skipped="0" time="${(timeMs / 1000).toFixed(3)}">`,
    `<testsuite name="translation-matrix" tests="${tests}" failures="${failures}" ` +
      `errors="${errors}" skipped="0" time="${(timeMs / 1000).toFixed(3)}">`
  ];
  for (const entry of cases) {
    lines.push(`  <testcase id="${escapeXml(entry.id)}" ` +
      `classname="${escapeXml(`${entry.direction}.${entry.construction ?? entry.family ?? ''}`)}" ` +
      `name="${escapeXml(entry.id)}" time="${(entry.durationMs / 1000).toFixed(3)}">`);
    if (entry.outcome === 'FAIL') {
      const first = entry.failures[0];
      lines.push(`    <failure message="${escapeXml(`${clip(first?.path)}: ${clip(first?.expected)} / ${clip(first?.actual)}`)}" ` +
        `type="assertion">${escapeXml(entry.failures.map(failure => `${failure.path}: expected ${failure.expected}; observed ${failure.actual}`).join('\n'))}</failure>`);
    } else if (entry.outcome === 'INFRA') {
      const first = entry.failures[0];
      lines.push(`    <error message="${escapeXml(clip(first?.actual ?? 'infrastructure failure'))}" type="infrastructure"/>`);
    }
    lines.push('  </testcase>');
  }
  lines.push('</testsuite>', '</testsuites>');
  return lines.join('\n');
}

function summaryMarkdown(report) {
  const {gates, cases, totals, coverage, cliSmoke, knownGaps, notRun} = report;
  const lines = [];
  lines.push(`# Translation matrix — ${report.sha.slice(0, 10)} (${report.finishedAt})`);
  lines.push('');
  lines.push(`**Gates: matrix ${gates.matrix} · coverage ${gates.coverage} · CLI smoke ${gates.cli}**`);
  lines.push('');
  lines.push(`- Node ${report.node} on ${report.platform}; validated matrix: ${report.valid ? 'VALID' : 'INVALID (execution refused)'}`);
  lines.push(`- Executed cases: ${cases.length}; ` +
    `translation ${totals.translation.pass}/${totals.translation.run}, ` +
    `refusal ${totals.refusal.pass}/${totals.refusal.run}, ` +
    `ambiguity ${totals.ambiguity.pass}/${totals.ambiguity.run}, ` +
    `FAIL ${totals.fail.required} required / ${totals.fail.exploratory} exploratory, ` +
    `INFRA ${totals.infra.required} required / ${totals.infra.exploratory} exploratory`);
  if (coverage) {
    lines.push(`- Coverage: declared_implemented ${coverage.categories.declared_implemented} ` +
      `(with positive witness ${coverage.categories.implemented_with_positive_witness}); ` +
      `project_a1_verified ${coverage.categories.project_a1_verified}/` +
      `${coverage.categories.project_a1_targets} of the authored A1 subset; ` +
      `required-target gate ${coverage.gate.passed ? 'GREEN' : 'RED'}`);
  } else {
    lines.push(`- Coverage: NOT RUN (coverage ran under --all only)`);
  }
  if (cliSmoke) {
    lines.push(`- CLI smoke: ${cliSmoke.filter(entry => entry.pass).length}/${cliSmoke.length} passed ` +
      `(exit-code policy, single JSON document, no node:internal stacks)`);
  } else {
    lines.push('- CLI smoke: NOT RUN');
  }
  lines.push(`- Known gaps: ${knownGaps.length} (${knownGaps.map(gap => gap.id).join(', ')}) ` +
    `— reported separately, never counted as PASS`);
  lines.push(`- Not run: ${notRun.length ? notRun.join('; ') : 'none'}`);
  const failing = cases.filter(entry => entry.outcome !== 'PASS');
  if (failing.length) {
    lines.push('', '## Failing / infra records', '');
    for (const entry of failing) {
      lines.push(`- **${entry.outcome} ${entry.id}** (${entry.direction}, ${entry.outcome === 'INFRA' ? 'infrastructure failure — never reinterpreted' : 'expectation mismatch'}): ` +
        `${entry.failures.slice(0, 4).map(failure => `${clip(failure.path)} expected ${clip(failure.expected, 80)}; observed ${clip(failure.actual, 80)}`).join(' · ')}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Write the three report artifacts and (when configured) append the summary to
 * GITHUB_STEP_SUMMARY. Returns the collection of written paths.
 */
export async function writeReports({testsRoot, sha, matrix, outcomes, coverage, cliSmoke,
  gates, notRun = [], durationMs}) {
  const directory = join(testsRoot, '.reports');
  await mkdir(directory, {recursive: true});

  const report = {
    schemaVersion: '1.0',
    kind: 'translation-matrix-report',
    sha,
    node: process.version,
    platform: process.platform,
    finishedAt: new Date().toISOString(),
    durationMs,
    valid: !matrix.issues.some(issue => issue.severity === 'error'),
    gates,
    validationIssues: matrix.issues.map(issue => ({severity: issue.severity, kind: issue.kind,
      file: issue.file ?? null, id: issue.id ?? null, message: clip(issue.message)})),
    cases: outcomes.map(caseRecord),
    totals: {translation: {pass: 0, run: 0}, refusal: {pass: 0, run: 0},
      ambiguity: {pass: 0, run: 0}, fail: {required: 0, exploratory: 0},
      infra: {required: 0, exploratory: 0}},
    knownGaps: (Array.isArray(matrix.gaps?.gaps) ? matrix.gaps.gaps : []).map(gap => ({
      id: gap.id, direction: gap.direction, severity: gap.severity, state: gap.state,
      observedStatus: gap.observedStatus, observedAtSha: gap.observedAtSha})),
    coverage,
    cliSmoke,
    notRun
  };

  /* Totals are recomputed here directly from outcomes — same accounting as the runner. */
  for (const {item, outcome} of outcomes) {
    if (!outcome) continue;
    const kind = outcome.kind;
    if (kind === 'translation' || kind === 'refusal' || kind === 'ambiguity') {
      if (item.tier === 'required') report.totals[kind].run += 1;
      if (outcome.pass && item.tier === 'required') report.totals[kind].pass += 1;
    }
    if (!outcome.pass) {
      const gate = item.tier === 'required' ? 'required' : 'exploratory';
      const bucket = kind === 'infra' ? 'infra' : 'fail';
      report.totals[bucket][gate] += 1;
    }
  }

  const matrixJsonPath = join(directory, 'matrix.json');
  const summaryMdPath = join(directory, 'summary.md');
  const junitXmlPath = join(directory, 'junit.xml');
  const failCount = report.totals.fail.required + report.totals.fail.exploratory;
  const errorCount = report.totals.infra.required + report.totals.infra.exploratory;
  await writeFile(matrixJsonPath, `${JSON.stringify(report, null, 1)}\n`, 'utf8');
  await writeFile(junitXmlPath, junit(report.cases.length, failCount, errorCount, durationMs, report.cases), 'utf8');
  const markdown = summaryMarkdown(report);
  await writeFile(summaryMdPath, markdown, 'utf8');
  const written = [matrixJsonPath, summaryMdPath, junitXmlPath];
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) {
    await appendFile(stepSummary, markdown, 'utf8');
    written.push(stepSummary);
  }
  return {files: written, report};
}
