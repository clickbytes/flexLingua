/**
 * The single canonical runner for the sentence-translation matrix.
 * Local `npm test` and the `translation-matrix` GitHub Actions check both execute
 * exactly this module. Honest accounting: PASS translation / PASS refusal /
 * PASS ambiguity / FAIL / INFRA / NOT-RUN are reported separately and aligned
 * with `tests/README.md`; nothing here may turn a gap into a pass.
 */

import {spawnSync} from 'node:child_process';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAppRuntime} from '../js/app/runtime.js';
import {createTranslationService} from '../js/app/translation-service.js';
import {compareCase} from './lib/assertions.mjs';
import {loadMatrix} from './lib/validate.mjs';

const RUNNER_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(RUNNER_DIR);

const USAGE = `Usage: node tests/run.mjs [--validate|--matrix|--all] [--help]

  --validate   load and validate schemas, catalog, required-ids, gaps, cross rules
  --matrix     validate first, then execute every approved case through the
               production createTranslationService (never a second translator)
  --all        validate + matrix (coverage accounting, CLI smoke and reports
               land with later TM tasks; they are reported as NOT RUN until then)

Exit codes: 0 all green gates; 1 required FAIL/INFRA, invalid or incomplete
matrix; 2 usage error. Infrastructure errors are always failures and are never
re-interpreted as expected refusals.`;

const TRIM = 240;
const KIND_LABEL = Object.freeze({
  translation: 'translation',
  refusal: 'refusal',
  ambiguity: 'ambiguity'
});

function readSha() {
  try {
    const result = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: REPO_ROOT, encoding: 'utf8'});
    if (result.status === 0 && typeof result.stdout === 'string' && /^[0-9a-f]{40}$/u.test(result.stdout.trim())) {
      return result.stdout.trim();
    }
  } catch {
    /* git absent: report unknown, never fake */
  }
  return 'unknown';
}

function parseFlags(argv) {
  const flags = {validate: false, matrix: false, all: false, help: false};
  for (const arg of argv) {
    if (arg === '--validate') flags.validate = true;
    else if (arg === '--matrix') flags.matrix = true;
    else if (arg === '--all') flags.all = true;
    else if (arg === '--help' || arg === '-h') flags.help = true;
    else return null;
  }
  if (flags.all) { flags.validate = true; flags.matrix = true; }
  return flags;
}

function clip(value, limit = TRIM) {
  const text = typeof value === 'string' ? value : String(value ?? 'none');
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function printIssues(issues) {
  const ordered = [...issues].sort((a, b) => {
    const bySeverity = (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1);
    if (bySeverity !== 0) return bySeverity;
    const ka = (a.kind ?? '').localeCompare(b.kind ?? '', 'en');
    if (ka !== 0) return ka;
    return (a.file ?? '').localeCompare(b.file ?? '', 'en') ||
      String(a.id ?? '').localeCompare(String(b.id ?? ''), 'en');
  });
  for (const issue of ordered) {
    const label = issue.severity === 'error' ? 'ERROR ' : 'WARN  ';
    const id = issue.id ? ` ${issue.id}:` : ':';
    console.log(`${label}${issue.kind} ${issue.file ?? '-'}${id} ${clip(issue.message)}`);
  }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (flags === null || flags.help || (!flags.validate && !flags.matrix)) {
    console.log(USAGE);
    process.exitCode = flags !== null && flags.help ? 0 : 2;
    return;
  }
  const started = Date.now();
  const sha = readSha();
  console.log(`translation-matrix at ${sha} (node ${process.version}, ${process.platform})`);

  const matrix = await loadMatrix({testsRoot: RUNNER_DIR});
  printIssues(matrix.issues);
  const hasErrors = matrix.issues.some(issue => issue.severity === 'error');

  if (!flags.matrix) {
    console.log(hasErrors ? 'VALIDATE: INVALID' : 'VALIDATE: VALID');
    process.exitCode = hasErrors ? 1 : 0;
    return;
  }
  if (hasErrors) {
    console.log('MATRIX: NOT RUN (invalid matrix data; required gate cannot be trusted)');
    process.exitCode = 1;
    return;
  }
  if (flags.validate) {
    console.log('VALIDATE: VALID');
  }

  const declaredRequiredCases = Array.isArray(matrix.requiredIds?.requiredCaseIds)
    ? matrix.requiredIds.requiredCaseIds : [];
  if (matrix.cases.length === 0 || declaredRequiredCases.length === 0) {
    console.log('MATRIX: INCOMPLETE — no approved required cases exist yet ' +
      `(cases ${matrix.cases.length}, requiredCaseIds ${declaredRequiredCases.length}); ` +
      'zero cases are never reported as PASS');
    process.exitCode = 1;
    return;
  }

  const runtime = await createAppRuntime();
  const service = createTranslationService(runtime);
  const outcomes = [];
  for (const item of matrix.cases) {
    const startedAt = Date.now();
    let document = null;
    let threw = null;
    try {
      document = service.translate({from: item.input.from, to: item.input.to, text: item.input.text});
    } catch (error) {
      threw = error;
    }
    let outcome;
    if (threw !== null) {
      outcome = {pass: false, kind: 'infra', failures:
        [{path: 'exception', expected: 'a service document', actual: clip(threw?.message ?? String(threw))}],
        observed: {status: 'exception'}};
    } else {
      outcome = compareCase(item, document);
      if (document?.status === 'error') {
        outcome.kind = 'infra';
      }
    }
    outcomes.push({item, outcome, durationMs: Date.now() - startedAt});
  }

  const counts = {translation: {pass: 0, run: 0}, refusal: {pass: 0, run: 0},
    ambiguity: {pass: 0, run: 0}, fail: {required: 0, exploratory: 0},
    infra: {required: 0, exploratory: 0}};
  for (const {item, outcome, durationMs} of outcomes) {
    const kind = outcome.kind in KIND_LABEL ? outcome.kind : null;
    if (outcome.pass) {
      console.log(`PASS [${outcome.kind}] ${item.id} (${item.direction}, ${durationMs} ms) ` +
        `"${clip(item.input.text, 48)}" -> ${outcome.observed.status}`);
    } else if (outcome.kind === 'infra') {
      console.log(`INFRA ${item.id} (${item.direction}) — infrastructure failure, never reinterpreted:`);
      printFailures(outcome.failures);
    } else {
      console.log(`FAIL [${outcome.kind}] ${item.id} (${item.direction}) ` +
        `"${clip(item.input.text, 48)}":`);
      printFailures(outcome.failures);
    }
    if (item.tier === 'required') {
      if (kind) {
        counts[kind].run += 1;
        if (outcome.pass) counts[kind].pass += 1;
      }
      if (!outcome.pass) {
        if (outcome.kind === 'infra') counts.infra.required += 1;
        else counts.fail.required += 1;
      }
    } else if (!outcome.pass) {
      if (outcome.kind === 'infra') counts.infra.exploratory += 1;
      else counts.fail.exploratory += 1;
    }
  }

  const gapCount = Array.isArray(matrix.gaps?.gaps) ? matrix.gaps.gaps.length : 0;
  console.log('');
  console.log(`Totals: translation ${counts.translation.pass}/${counts.translation.run}, ` +
    `refusal ${counts.refusal.pass}/${counts.refusal.run}, ` +
    `ambiguity ${counts.ambiguity.pass}/${counts.ambiguity.run}, ` +
    `FAIL ${counts.fail.required} required / ${counts.fail.exploratory} exploratory, ` +
    `INFRA ${counts.infra.required} required / ${counts.infra.exploratory} exploratory, ` +
    `NOT-RUN 0`);
  console.log(`Known gaps registered: ${gapCount} (reported separately, never counted as PASS)`);
  console.log('Coverage accounting and CLI smoke: NOT RUN until TM-06/TM-07 land (explicit, not silent).');

  const failedRequired = counts.fail.required + counts.infra.required;
  if (failedRequired > 0) {
    console.log(`GATE: RED — ${failedRequired} required case(s) did not pass. Merge to main stays blocked.`);
    process.exitCode = 1;
    return;
  }
  console.log(`GATE: GREEN — ${outcomes.length} executed case(s), required (${declaredRequiredCases.length}) all PASS.`);
  console.log(`Duration: ${Date.now() - started} ms.`);
  process.exitCode = 0;
}

function printFailures(failures) {
  for (const failure of failures) {
    console.log(`    - ${failure.path}: expected ${clip(failure.expected)}; observed ${clip(failure.actual)}`);
  }
}

main().catch(error => {
  console.error(`INFRA runner crashed: ${clip(error?.message ?? String(error))}`);
  process.exitCode = 1;
});
