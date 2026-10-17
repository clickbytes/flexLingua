/**
 * Report generation for the canonical matrix runner.
 *
 * Everything written here restates the honest runner results — translation
 * success, controlled refusal, ambiguity, known gaps, infrastructure errors
 * and NOT RUN stay separately labeled. Nothing in a report may turn a known
 * gap or an infrastructure error into a pass.
 */

import {appendFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

function escapeXml(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, '\uFFFD')
    .replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;').replace(/'/gu, '&apos;');
}

function clip(value, limit = 240) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function safeMarkdown(value, limit = 240) {
  return clip(value, limit).replace(/[\u0000-\u001F\u007F]/gu, ' ')
    .replace(/[\\|`<>\[\]*_]/gu, '\\$&');
}

function caseRecord({item, outcome, durationMs, document}) {
  return {
    id: item.id,
    tier: item.tier,
    direction: item.direction,
    family: item.family ?? null,
    construction: item.construction ?? null,
    review: item.review ?? null,
    input: item.input ?? null,
    expected: item.expected ?? null,
    expectedStatus: item.expected?.status ?? null,
    outcome: outcome?.pass === true ? 'PASS' : outcome?.kind === 'infra' ? 'INFRA' : 'FAIL',
    kind: outcome?.kind ?? null,
    observedStatus: outcome?.observed?.status ?? null,
    observed: {
      status: outcome?.observed?.status ?? null,
      text: document?.text ?? null,
      meaning: document?.meaning ?? null,
      alternatives: document?.alternatives ?? [],
      informationLoss: document?.informationLoss ?? [],
      diagnostics: document?.diagnostics ?? []
    },
    durationMs,
    failures: outcome?.failures ?? []
  };
}

function junit(report) {
  const cases = report.cases;
  const validationFailure = !report.valid || (cases.length === 0 && report.gates.matrix === 'RED');
  const tests = cases.length + (validationFailure ? 1 : 0);
  const failures = cases.filter(entry => entry.outcome === 'FAIL').length + (validationFailure ? 1 : 0);
  const errors = cases.filter(entry => entry.outcome === 'INFRA').length;
  const timeMs = report.run?.durationMs ?? report.durationMs ?? 0;
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
  if (validationFailure) {
    const message = report.validationIssues?.map(issue => issue.message).join('; ') ||
      report.notRun?.join('; ') || 'matrix did not execute';
    lines.push('  <testcase classname="translation-matrix" name="matrix-validation">');
    lines.push(`    <failure type="validation" message="${escapeXml(clip(message))}"/>`);
    lines.push('  </testcase>');
  }
  lines.push('</testsuite>', '</testsuites>');
  return lines.join('\n');
}

function summaryMarkdown(report) {
  const {gates, cases, totals, coverage, cliSmoke, knownGaps, notRun} = report;
  const lines = [];
  lines.push(`# Translation matrix — ${safeMarkdown(report.run.sha.slice(0, 10))} (${safeMarkdown(report.run.timestamp)})`);
  lines.push('');
  lines.push(`**Gates: matrix ${gates.matrix} · coverage ${gates.coverage} · CLI smoke ${gates.cli}**`);
  lines.push('');
  lines.push(`- Node ${safeMarkdown(report.run.node)} on ${safeMarkdown(report.run.platform)}; validated matrix: ${report.valid ? 'VALID' : 'INVALID (execution refused)'}`);
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
    for (const target of coverage.gate.targets.filter(entry => entry.missing.length)) {
      lines.push(`  - NOT VERIFIED ${safeMarkdown(target.targetId)}: missing ${safeMarkdown(target.missing.join(', '))}`);
    }
    for (const warning of coverage.warnings) lines.push(`  - WARN ${safeMarkdown(warning)}`);
  } else {
    lines.push('- Coverage: NOT RUN');
  }
  if (cliSmoke?.length) {
    lines.push(`- CLI smoke: ${cliSmoke.filter(entry => entry.pass).length}/${cliSmoke.length} passed ` +
      `(exit-code policy, single JSON document, no node:internal stacks)`);
  } else {
    lines.push('- CLI smoke: NOT RUN');
  }
  lines.push(`- Known gaps: ${knownGaps.length} — reported separately, never counted as PASS`);
  for (const gap of knownGaps) {
    const issueNumber = /^#([0-9]+)$/u.exec(gap.issue ?? '');
    const issue = issueNumber
      ? `([${safeMarkdown(gap.issue)}](https://github.com/clickbytes/flexLingua/issues/${issueNumber[1]}))`
      : safeMarkdown(gap.issue ?? 'issue not linked');
    lines.push(`  - ${safeMarkdown(gap.id)} ${safeMarkdown(gap.direction)} ${safeMarkdown(gap.state)} ${issue}`);
  }
  lines.push(`- Not run: ${notRun.length ? notRun.map(entry => safeMarkdown(entry)).join('; ') : 'none'}`);
  const proposed = cases.filter(entry => entry.review?.status !== 'approved');
  if (proposed.length) {
    lines.push(`- Unapproved cases (no positive coverage witness): ${proposed.map(entry => safeMarkdown(entry.id)).join(', ')}`);
  }

  const appendBreakdown = (title, keyOf) => {
    const grouped = new Map();
    for (const entry of cases) {
      const key = keyOf(entry);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(entry);
    }
    lines.push('', `## Results by ${title.toLowerCase()}`, '',
      `| ${title} | Translation | Refusal | Ambiguity | FAIL | INFRA |`,
      '| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const [key, entries] of [...grouped].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
      const count = kind => entries.filter(entry => entry.kind === kind && entry.outcome === 'PASS').length;
      lines.push(`| ${safeMarkdown(key)} | ${count('translation')} | ` +
        `${count('refusal')} | ${count('ambiguity')} | ` +
        `${entries.filter(entry => entry.outcome === 'FAIL').length} | ` +
        `${entries.filter(entry => entry.outcome === 'INFRA').length} |`);
    }
  };
  appendBreakdown('Direction', entry => entry.direction);
  appendBreakdown('Construction', entry => entry.construction ?? entry.family ?? '-');
  const failing = cases.filter(entry => entry.outcome !== 'PASS');
  if (failing.length) {
    lines.push('', '## Failing / infra records', '');
    for (const entry of failing) {
      lines.push(`- **${entry.outcome} ${safeMarkdown(entry.id)}** (${safeMarkdown(entry.direction)}, ${entry.outcome === 'INFRA' ? 'infrastructure failure — never reinterpreted' : 'expectation mismatch'}): ` +
        `${entry.failures.slice(0, 4).map(failure => `${safeMarkdown(failure.path)} expected ${safeMarkdown(failure.expected, 80)}; observed ${safeMarkdown(failure.actual, 80)}`).join(' · ')}`);
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
  gates, notRun = [], durationMs, mode}) {
  const report = {
    schemaVersion: '1.0',
    kind: 'translation-matrix-report',
    sha,
    node: process.version,
    platform: process.platform,
    finishedAt: new Date().toISOString(),
    durationMs,
    run: {sha, node: process.version, platform: process.platform,
      timestamp: new Date().toISOString(), mode, durationMs},
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
      issue: gap.issue, observedStatus: gap.observedStatus, observedAtSha: gap.observedAtSha})),
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

  return writeReportArtifacts({testsRoot, report});
}

async function writeReportArtifacts({testsRoot, report, writeMatrix = true}) {
  const directory = join(testsRoot, '.reports');
  await mkdir(directory, {recursive: true});
  const matrixJsonPath = join(directory, 'matrix.json');
  const summaryMdPath = join(directory, 'summary.md');
  const junitXmlPath = join(directory, 'junit.xml');
  if (writeMatrix) await writeFile(matrixJsonPath, `${JSON.stringify(report, null, 1)}\n`, 'utf8');
  await writeFile(junitXmlPath, junit(report), 'utf8');
  const markdown = summaryMarkdown(report);
  await writeFile(summaryMdPath, markdown, 'utf8');
  const written = writeMatrix ? [matrixJsonPath, summaryMdPath, junitXmlPath] :
    [summaryMdPath, junitXmlPath];
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) {
    await appendFile(stepSummary, markdown, 'utf8');
    written.push(stepSummary);
  }
  return {files: written, report};
}

/** Rebuild Markdown and JUnit from a previous matrix.json without running translation. */
export async function regenerateReports({testsRoot}) {
  const matrixJsonPath = join(testsRoot, '.reports', 'matrix.json');
  let report;
  try {
    report = JSON.parse(await readFile(matrixJsonPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot regenerate reports from ${matrixJsonPath}: ${error.message}`);
  }
  if (report?.kind !== 'translation-matrix-report' || report.schemaVersion !== '1.0' ||
      !report.run?.sha || !Array.isArray(report.cases) || !report.totals ||
      !report.gates || !Array.isArray(report.knownGaps) || !Array.isArray(report.notRun)) {
    throw new Error(`Cannot regenerate reports from ${matrixJsonPath}: invalid matrix report.`);
  }
  return writeReportArtifacts({testsRoot, report, writeMatrix: false});
}
