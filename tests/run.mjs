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
import {ConversationContext} from '../js/core/conversation.js';
import {withUncertainties} from '../js/core/translation-result.js';
import {runCliSmoke} from './lib/cli.mjs';
import {compareCase, comparePublicEntryPoints} from './lib/assertions.mjs';
import {ALLOWED_DIRECTIONS} from './lib/discover.mjs';
import {buildCoverage, buildInventoryCoverage} from './lib/coverage.mjs';
import {regenerateReports, writeReports} from './lib/report.mjs';
import {loadMatrix} from './lib/validate.mjs';

const RUNNER_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(RUNNER_DIR);

const USAGE = `Usage: node tests/run.mjs [--validate|--matrix|--cli|--all] [--help]

  --validate   load and validate schemas, catalog, required-ids, gaps, cross rules
  --matrix     validate, execute the matrix, account for coverage and write reports
               through the production createTranslationService
  --cli        matrix, coverage and batched CLI smoke for cliSmoke-tagged cases
               (one success-path process check, shared command path, exit codes)
  --report     regenerate summary.md and junit.xml from an existing matrix.json
               without translating; without matrix.json it exits 3
  --all        validate + matrix + coverage accounting + CLI smoke + reports
               (this is what npm test and GitHub Actions run)

Exit codes: 0 all green gates; 1 required FAIL/INFRA, invalid or incomplete
matrix; 2 usage error; 3 --report invoked without a saved matrix. Infrastructure
errors are always failures and are never re-interpreted as expected refusals.`;

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
  const flags = {validate: false, matrix: false, cli: false, all: false,
    report: false, help: false};
  for (const arg of argv) {
    if (arg === '--validate') flags.validate = true;
    else if (arg === '--matrix') flags.matrix = true;
    else if (arg === '--cli') flags.cli = true;
    else if (arg === '--report') flags.report = true;
    else if (arg === '--all') flags.all = true;
    else if (arg === '--help' || arg === '-h') flags.help = true;
    else return null;
  }
  if (flags.all) { flags.validate = true; flags.matrix = true; flags.cli = true; flags.report = true; }
  if (flags.cli) { flags.matrix = true; }
  if (flags.matrix) { flags.report = true; }
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
  if (flags === null || flags.help || (!flags.validate && !flags.matrix && !flags.report)) {
    console.log(USAGE);
    process.exitCode = flags !== null && flags.help ? 0 : 2;
    return;
  }
  if (flags.report && !flags.matrix && !flags.validate) {
    try {
      const written = await regenerateReports({testsRoot: RUNNER_DIR});
      console.log(`REPORTS (regenerated without translation): ${written.files.join(', ')}`);
    } catch (error) {
      console.error(`REPORTS: ${clip(error?.message ?? String(error))}`);
      process.exitCode = 3;
    }
    return;
  }
  if (flags.report && flags.validate && !flags.matrix) {
    console.log('Use --validate alone, or --report alone to regenerate saved reports.');
    process.exitCode = 2;
    return;
  }
  const started = Date.now();
  const sha = readSha();
  console.log(`translation-matrix at ${sha} (node ${process.version}, ${process.platform})`);

  const runtime = await createAppRuntime();
  const matrix = await loadMatrix({testsRoot: RUNNER_DIR, ontology: runtime.engine.ontology});
  printIssues(matrix.issues);
  const hasErrors = matrix.issues.some(issue => issue.severity === 'error');

  if (!flags.matrix) {
    console.log(hasErrors ? 'VALIDATE: INVALID' : 'VALIDATE: VALID');
    process.exitCode = hasErrors ? 1 : 0;
    return;
  }
  if (hasErrors) {
    console.log('MATRIX: NOT RUN (invalid matrix data; required gate cannot be trusted)');
    await writeReports({testsRoot: RUNNER_DIR, sha, matrix, outcomes: [], coverage: null,
      cliSmoke: null, gates: {matrix: 'RED', coverage: 'NOT RUN', cli: 'NOT RUN'},
      notRun: ['matrix: invalid input', 'coverage', 'CLI smoke'],
      durationMs: Date.now() - started, mode: flags.all ? 'all' : flags.cli ? 'cli' : 'matrix'});
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
    await writeReports({testsRoot: RUNNER_DIR, sha, matrix, outcomes: [], coverage: null,
      cliSmoke: null, gates: {matrix: 'RED', coverage: 'NOT RUN', cli: 'NOT RUN'},
      notRun: ['matrix: incomplete required cases', 'coverage', 'CLI smoke'],
      durationMs: Date.now() - started, mode: flags.all ? 'all' : flags.cli ? 'cli' : 'matrix'});
    process.exitCode = 1;
    return;
  }

  const service = createTranslationService(runtime);
  const outcomes = [];
  for (const item of matrix.cases) {
    const startedAt = Date.now();
    let document = null;
    let threw = null;
    let apiItem = item;
    try {
      let caseService = service;
      if (item.session) {
        const seed = matrix.cases.find(candidate => candidate.id === item.session.caseId);
        if (!seed || seed.tier !== 'required' || seed.review.status !== 'approved' || seed.expected.status !== 'ok') {
          throw new Error('Session setup requires an approved successful canonical case.');
        }
        const session = new ConversationContext(runtime.engine);
        const output = session.translate(seed.input);
        const checked = compareCase(seed,withUncertainties({...output,status:'ok',meaning:output.interlingua,
          interpretations:[],previewId:null}),{engine:runtime.engine});
        if (!checked.pass) throw new Error('Session seed does not satisfy its independent canonical oracle.');
        session.remember({turnId:'t1',referent:`proposition.roles.${item.session.rememberRole}`,
          recordedAt:'2026-10-19T00:00:00.000Z'});
        caseService = createTranslationService(runtime,{session});
        apiItem = {...item,input:{...item.input,context:session.translationContext(item.input.context)}};
      }
      document = caseService.translate(item.input);
    } catch (error) {
      threw = error;
    }
    let outcome;
    if (threw !== null) {
      outcome = {pass: false, kind: 'infra', failures:
        [{path: 'exception', expected: 'a service document', actual: clip(threw?.message ?? String(threw))}],
        observed: {status: 'exception'}};
    } else {
      outcome = compareCase(item, document, {engine: runtime.engine});
      if (document?.status === 'error') {
        outcome.kind = 'infra';
      }
      if (item.verifyEngine === true) {
        const api = comparePublicEntryPoints(apiItem, document, runtime.engine);
        outcome.observed.publicEntryPoints = api.checks;
        outcome.failures.push(...api.failures);
        if (api.failures.length) outcome.pass = false;
        if (api.infra) outcome.kind = 'infra';
      }
    }
    outcomes.push({item, outcome, document, durationMs: Date.now() - startedAt});
    if (outcomes.length % 25 === 0 || outcomes.length === matrix.cases.length) {
      console.log(`MATRIX progress: ${outcomes.length}/${matrix.cases.length}`);
    }
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
    `matrix cases NOT-RUN 0`);
  console.log(`Known gaps registered: ${gapCount} (reported separately, never counted as PASS)`);

  const notRunLabels = flags.cli ? [] : ['CLI smoke (run --cli or --all)'];
  const inventory = await buildInventoryCoverage({runtime, outcomes,
    requiredCaseIds: matrix.requiredIds?.requiredCaseIds ?? [], cases: matrix.cases});
  const coverageResult = printCoverage({runtime, matrix, outcomes, gapCount, notRunLabels, inventory});
  const coverageFailed = !coverageResult.gate.passed;

  let cliFailed = false;
  let cliResults = null;
  if (flags.cli || flags.all) {
    const smokeCases = matrix.cases.filter(item => item.cliSmoke === true);
    console.log('');
    if (smokeCases.length === 0) {
      console.log('CLI smoke: NOT RUN — no cliSmoke-tagged cases exist (explicit, not silent).');
      cliResults = [];
      cliFailed = true;
      notRunLabels.push('CLI smoke: no cliSmoke-tagged cases');
    } else {
      console.log(`CLI SMOKE (${smokeCases.length} tagged cases, batched): exit-code policy ` +
        '(ok→0; unsupported/invalid/ambiguous/resource_limit→2), one process success check, no node:internal stacks');
      const serviceDocuments = new Map(outcomes.map(({item, document}) => [item.id, document]));
      cliResults = await runCliSmoke({cases: smokeCases, serviceDocuments,
        engine: runtime.engine, repoRoot: REPO_ROOT,
        onProgress(completed, total) {
          if (completed % 25 === 0 || completed === total) {
            console.log(`CLI progress: ${completed}/${total}`);
          }
        }});
      let smokePassed = 0;
      for (const result of cliResults) {
        if (result.pass) {
          smokePassed += 1;
          console.log(`CLI-PASS [${result.kind}] ${result.id} (${result.durationMs} ms)`);
        } else {
          console.log(`${result.kind === 'infra' ? 'CLI-INFRA' : 'CLI-FAIL'} ${result.id} ` +
            `(${result.durationMs} ms):`);
          for (const line of result.lines) console.log(`    - ${line}`);
        }
      }
      console.log(`CLI smoke: ${smokePassed}/${cliResults.length} passed.`);
      cliFailed = smokePassed !== cliResults.length;
    }
  }

  const failedRequired = counts.fail.required + counts.infra.required;
  const matrixRed = failedRequired > 0;
  const gates = {
    matrix: matrixRed ? 'RED' : 'GREEN',
    coverage: coverageFailed ? 'RED' : 'GREEN',
    cli: (flags.cli || flags.all) ? (cliFailed ? 'RED' : 'GREEN') : 'NOT RUN'
  };
  if (matrixRed) {
    console.log(`GATE: RED — ${failedRequired} required case(s) did not pass. Merge to main stays blocked.`);
  } else {
    console.log(`GATE (matrix): GREEN — ${outcomes.length} executed case(s), required (${declaredRequiredCases.length}) all PASS.`);
  }
  console.log(coverageFailed
    ? 'GATE: RED — coverage: a required A1 target lacks a positive witness in the canonical pair directions. Merge to main stays blocked.'
    : 'GATE (coverage): GREEN — every required A1 target is witnessed in both canonical directions.');
  if (flags.cli || flags.all) {
    console.log(cliFailed
      ? 'GATE: RED — CLI smoke: the shipped command line does not match the approved expectations or the exit-code policy.'
      : 'GATE (CLI smoke): GREEN — the shipped command line matches the approved expectations and the exit-code policy.');
  }

  if (flags.report) {
    const written = await writeReports({testsRoot: RUNNER_DIR, sha, matrix, outcomes,
      coverage: coverageResult, cliSmoke: cliResults, gates, notRun: notRunLabels,
      durationMs: Date.now() - started, mode: flags.all ? 'all' : flags.cli ? 'cli' : 'matrix'});
    console.log(`REPORTS: ${written.files.join(', ')}`);
  }

  process.exitCode = matrixRed || coverageFailed || cliFailed ? 1 : 0;
  console.log(`Duration: ${Date.now() - started} ms.`);
}

/** Live declared sentence tuples: manifest direction limits ∩ (source analyze ∩ target realize). */
function extractDeclaredTuples(runtime) {
  const analyzeByCode = new Map();
  const realizeByCode = new Map();
  const directionsByCode = new Map();
  for (const language of runtime.languages) {
    const analyze = new Set();
    const realize = new Set();
    for (const item of language.capabilities ?? []) {
      if (item.channel === 'sentence' && item.status === 'implemented') {
        if (item.operation === 'analyze') analyze.add(item.construction);
        else if (item.operation === 'realize') realize.add(item.construction);
      }
    }
    analyzeByCode.set(language.code, analyze);
    realizeByCode.set(language.code, realize);
    directionsByCode.set(language.code, Array.isArray(language.directions) ? language.directions : null);
  }
  const tuples = [];
  const seen = new Set();
  const codes = runtime.languages.map(language => language.code).sort((a, b) => a.localeCompare(b, 'en'));
  for (const from of codes) {
    for (const to of codes) {
      const direction = `${from}->${to}`;
      const scopeDirection = direction.replace('->', '-');
      // Only the canonical matrix scope counts as a declared translation tuple here.
      if (!ALLOWED_DIRECTIONS.has(scopeDirection)) continue;
      const limits = [from, to].map(code => directionsByCode.get(code)).filter(list => list !== null);
      if (limits.some(list => !list.includes(direction))) continue;
      for (const construction of [...analyzeByCode.get(from) ?? []].sort()) {
        if ((realizeByCode.get(to) ?? []).has(construction) &&
            !seen.has(`${direction}×${construction}`)) {
          seen.add(`${direction}×${construction}`);
          tuples.push({direction: scopeDirection, construction});
        }
      }
    }
  }
  return tuples;
}

/** Print the coverage section; returns the full coverage object (gate included). */
function printCoverage({runtime, matrix, outcomes, gapCount, notRunLabels = [], inventory = null}) {
  const coverage = buildCoverage({
    declaredTuples: extractDeclaredTuples(runtime),
    outcomes,
    requiredTargetIds: matrix.requiredIds?.requiredTargetIds ?? [],
    requiredDirections: ['en-pl', 'pl-en'],
    catalogTargetIds: (Array.isArray(matrix.catalog?.targets) ? matrix.catalog.targets : [])
      .map(target => target?.targetId).filter(id => typeof id === 'string'),
    catalogTargetCount: Array.isArray(matrix.catalog?.targets) ? matrix.catalog.targets.length : 0,
    gapsCount: gapCount,
    inventory
  });
  console.log('');
  console.log('COVERAGE (A1 canonical subset; witnesses only from approved PASSING cases):');
  console.log(`  translation_pass ${coverage.categories.translation_pass}/` +
    `${coverage.categories.required_translation}; refusal_pass ` +
    `${coverage.categories.refusal_pass}/${coverage.categories.required_refusal}; ` +
    `ambiguity_pass ${coverage.categories.ambiguity_pass}/` +
    `${coverage.categories.required_ambiguity}; infra_errors ` +
    `${coverage.categories.infra_errors}; not_run ${notRunLabels.length}` +
    (notRunLabels.length ? ` (${notRunLabels.join('; ')})` : ''));
  console.log(`  declared_implemented ${coverage.categories.declared_implemented} live tuples; ` +
    `implemented_with_positive_witness ${coverage.categories.implemented_with_positive_witness}`);
  if (coverage.declaredWithoutWitness.length) {
    console.log(`  declared without positive witness: ${coverage.declaredWithoutWitness.join(', ')} ` +
      '(each must be covered by a registered known gap or remain an explicit open point)');
  }
  console.log(`  project_a1_verified ${coverage.categories.project_a1_verified}/` +
    `${coverage.categories.project_a1_targets} catalog targets (authored subset — never full A1 coverage)`);
  for (const warning of coverage.warnings) console.log(`  WARN ${warning}`);
  console.log(`  required-target gate (positive witness in both ` +
    `${coverage.gate.requiredDirections.join(' and ')}):`);
  for (const target of coverage.gate.targets) {
    console.log(`    ${target.missing.length ? 'FAIL' : 'ok  '} ${target.targetId} witnessed in ` +
      `${target.witnessed.join(', ') || 'no direction'}` +
      (target.missing.length ? ` — missing ${target.missing.join(', ')}` : ''));
  }
  if (coverage.inventory) {
    const {intended, actual} = coverage.inventory;
    console.log(`  inventory CORE ${actual.concepts.total}/${intended.concepts} distinct IDs; ` +
      `typed edges ${actual.concepts.typedEdges}; semantic effects ${actual.concepts.semanticEffects}`);
    for (const language of ['pl', 'en']) {
      const count = actual.lemmas[language];
      console.log(`  inventory ${language.toUpperCase()} ${count.dataOnly}/${intended.lemmas[language]} ` +
        `data-only; morphology-ready ${count.morphologyReady}; ` +
        `sentence-licensed ${count.sentenceLicensed}; senses ${count.lexicalSenses}; ` +
        `polysemous lemmas ${count.polysemousLemmas}; excluded missing lemma ${count.excludedMissingLemma}`);
    }
    const pair = actual.approvedRequiredCases;
    console.log(`  approved EN↔PL cases ${pair.total}/${intended.approvedRequiredCases}; ` +
      `${pair.successfulTranslations}/${intended.successfulTranslationsMinimum} minimum successful translations; ` +
      `NOT RUN ${pair.notRun}; distinct inputs ${pair.distinctInputs}; ` +
      `semantic frames ${pair.distinctFrames}`);
    for (const [direction, count] of Object.entries(pair.byDirection)) {
      console.log(`    ${direction}: ${count.total}/${intended.byDirection[direction]} cases; ` +
        `${count.successfulTranslations} translations, ${count.refusals} refusals, ` +
        `${count.ambiguities} ambiguities, ${count.failed} FAIL, ${count.infra} INFRA, ` +
        `${count.notRun} NOT RUN`);
    }
    for (const [direction, count] of Object.entries(actual.otherRequiredCases.byDirection)) {
      console.log(`    ${direction} (outside EN↔PL target): ${count.total} required; ` +
        `${count.successfulTranslations} translations, ${count.refusals} refusals, ` +
        `${count.ambiguities} ambiguities, ${count.failed} FAIL, ${count.infra} INFRA`);
    }
  }
  return coverage;
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
