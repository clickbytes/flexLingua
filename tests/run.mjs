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
import {compareCase, comparePublicEntryPoints, evaluateSemanticRelations} from './lib/assertions.mjs';
import {ALLOWED_DIRECTIONS} from './lib/discover.mjs';
import {buildCoverage, buildInventoryCoverage} from './lib/coverage.mjs';
import {regenerateReports, writeReports} from './lib/report.mjs';
import {loadMatrix} from './lib/validate.mjs';

const RUNNER_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(RUNNER_DIR);

const USAGE = `Usage: node tests/run.mjs [--validate|--matrix|--cli|--all] [--help]
       [--verbosity=normal|verbose|quiet] [--color=auto|always|never]

  --validate   load and validate schemas, catalog, required-ids, gaps, cross rules
  --matrix     validate, execute the matrix, account for coverage and write reports
               through the production createTranslationService
  --cli        matrix, coverage and batched CLI smoke for cliSmoke-tagged cases
               (one success-path process check, shared command path, exit codes)
  --report     regenerate summary.md and junit.xml from an existing matrix.json
               without translating; without matrix.json it exits 3
  --all        validate + matrix + coverage accounting + CLI smoke + reports
               (this is what npm test and GitHub Actions run)
  --verbosity  normal (default) prints full source and observed target sentences;
               verbose adds expected/observed details; quiet shows totals and failures
  --color      auto (default; TTY only, disabled by NO_COLOR), always, or never

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
    report: false, help: false, verbosity: 'normal', color: 'auto'};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--validate') flags.validate = true;
    else if (arg === '--matrix') flags.matrix = true;
    else if (arg === '--cli') flags.cli = true;
    else if (arg === '--report') flags.report = true;
    else if (arg === '--all') flags.all = true;
    else if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg === '--verbosity' || arg.startsWith('--verbosity=')) {
      const value = arg === '--verbosity' ? argv[++index] : arg.slice('--verbosity='.length);
      if (!['normal', 'verbose', 'quiet'].includes(value)) return null;
      flags.verbosity = value;
    } else if (arg === '--color' || arg.startsWith('--color=')) {
      const value = arg === '--color' ? argv[++index] : arg.slice('--color='.length);
      if (!['auto', 'always', 'never'].includes(value)) return null;
      flags.color = value;
    }
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

function createColorizer(mode) {
  const enabled = mode === 'always' ||
    (mode === 'auto' && Boolean(process.stdout.isTTY) && !Object.hasOwn(process.env, 'NO_COLOR'));
  return (text, code) => enabled ? `\u001B[${code}m${text}\u001B[0m` : text;
}

function quotedSentence(value) {
  return typeof value === 'string' ? `“${value}”` : '(no sentence)';
}

function printVerboseCase({item, outcome, document, colorize}) {
  const expected = {
    status: item.expected?.status ?? null,
    text: item.expected?.text ?? null,
    meaning: item.expected?.meaning ?? null,
    graph: item.expected?.graph ?? null,
    context: item.expected?.context ?? null,
    alternatives: item.expected?.alternatives ?? null,
    diagnostics: item.expected?.diagnostics ?? null,
    informationLoss: item.expected?.informationLoss ?? null
  };
  const observed = {
    status: document?.status ?? outcome.observed?.status ?? null,
    text: document?.text ?? null,
    meaning: document?.meaning ?? null,
    typedGraph: outcome.observed?.typedGraph ?? null,
    context: outcome.observed?.context ?? null,
    alternatives: document?.alternatives ?? [],
    diagnostics: document?.diagnostics ?? [],
    informationLoss: document?.informationLoss ?? [],
    uncertainties: document?.uncertainties ?? [],
    interpretations: (document?.interpretations ?? []).map(interpretation => ({
      id: interpretation.id,
      status: interpretation.status,
      realizations: (interpretation.realizations ?? []).map(realization => ({
        id: realization.id,
        text: realization.text,
        kind: realization.kind,
        assumptions: realization.assumptions ?? []
      }))
    }))
  };
  console.log(`    ${colorize('expected:', '1')} ${JSON.stringify(expected)}`);
  console.log(`    ${colorize('observed:', '1')} ${JSON.stringify(observed)}`);
}

function printInterpretations(document, colorize) {
  const interpretations = Array.isArray(document?.interpretations) ? document.interpretations : [];
  let realizationCount = 0;
  for (const interpretation of interpretations) {
    const realizations = Array.isArray(interpretation.realizations) ? interpretation.realizations : [];
    if (!realizations.length) {
      console.log(`    ${interpretation.id ?? 'reading'}: no target realization (${interpretation.status ?? 'unavailable'})`);
    }
    for (const realization of realizations) {
      realizationCount += 1;
      const preview = realization.id === document?.previewId ? 'Preview' : 'Alternative';
      const style = preview === 'Preview' ? '1;36' : '2';
      const kindLabel = realization.kind ? ` [${realization.kind}]` : '';
      console.log(colorize(`    ${preview} ${realization.id}: ${quotedSentence(realization.text)}${kindLabel}`, style));
    }
  }
  if (!interpretations.length || realizationCount === 0) console.log('    No complete target sentence is available.');
}

function printCaseOutcome({item, outcome, document, durationMs, verbosity, colorize}) {
  const direction = item.direction.replace('-', ' -> ').toUpperCase();
  const kind = KIND_LABEL[outcome.kind] ?? outcome.kind ?? 'unknown';
  const label = outcome.pass ? `PASS [${kind}]` : outcome.kind === 'infra' ? 'INFRA' : `FAIL [${kind}]`;
  const color = !outcome.pass ? (outcome.kind === 'infra' ? '35;1' : '31;1')
    : outcome.kind === 'translation' ? '32'
      : outcome.kind === 'ambiguity' ? '33' : '36';
  const suffix = verbosity === 'verbose' ? ` (${durationMs} ms)` : '';
  const header = `${label} ${item.id} | ${direction} | ${quotedSentence(item.input.text)}`;

  if (!outcome.pass) {
    const observed = typeof document?.text === 'string' ? ` -> ${quotedSentence(document.text)}`
      : document?.status === 'ambiguous'
        ? ` -> ambiguous (${document.interpretations?.length ?? 0} readings; no resolved target)`
        : ` -> no target text (${document?.status ?? 'no service document'})`;
    console.log(colorize(`${header}${observed}${suffix}`, color));
    printFailures(outcome.failures, colorize);
    if (document?.status === 'ambiguous') printInterpretations(document, colorize);
    else if (Array.isArray(document?.diagnostics)) {
      for (const diagnostic of document.diagnostics) {
        console.log(`    Diagnostic: ${diagnostic.code ?? 'UNKNOWN'}${diagnostic.message ? ` — ${diagnostic.message}` : ''}`);
      }
    }
    if (verbosity === 'verbose') printVerboseCase({item, outcome, document, colorize});
    return;
  }
  if (verbosity === 'quiet') return;

  if (outcome.kind === 'translation') {
    const target = typeof document?.text === 'string' ? quotedSentence(document.text) : '(no target text observed)';
    console.log(colorize(`${header} -> ${target}${suffix}`, color));
  } else if (outcome.kind === 'ambiguity') {
    const interpretations = Array.isArray(document?.interpretations) ? document.interpretations : [];
    console.log(colorize(`${header} -> ambiguous (${interpretations.length} readings; no resolved target)${suffix}`, color));
    printInterpretations(document, colorize);
  } else {
    console.log(colorize(`${header} -> no target text (controlled refusal)${suffix}`, color));
    const diagnostics = Array.isArray(document?.diagnostics) ? document.diagnostics : [];
    if (diagnostics.length) {
      for (const diagnostic of diagnostics) {
        console.log(`    Diagnostic: ${diagnostic.code ?? 'UNKNOWN'}${diagnostic.message ? ` — ${diagnostic.message}` : ''}`);
      }
    } else {
      console.log(`    Diagnostic: ${document?.status ?? 'no diagnostic returned'}`);
    }
  }

  if (verbosity === 'verbose') printVerboseCase({item, outcome, document, colorize});
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
  const colorize = createColorizer(flags.color);
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
    const semanticRelations = evaluateSemanticRelations(matrix.surfaceEquivalence?.groups, []);
    await writeReports({testsRoot: RUNNER_DIR, sha, matrix, outcomes: [], coverage: null,
      cliSmoke: null, gates: {matrix: 'RED', coverage: 'NOT RUN', cli: 'NOT RUN',
        semanticRelations: 'NOT RUN'},
      semanticRelations,
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
    const semanticRelations = evaluateSemanticRelations(matrix.surfaceEquivalence?.groups, []);
    await writeReports({testsRoot: RUNNER_DIR, sha, matrix, outcomes: [], coverage: null,
      cliSmoke: null, gates: {matrix: 'RED', coverage: 'NOT RUN', cli: 'NOT RUN',
        semanticRelations: 'NOT RUN'},
      semanticRelations,
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
    if (flags.verbosity === 'verbose' &&
        (outcomes.length % 25 === 0 || outcomes.length === matrix.cases.length)) {
      console.log(`MATRIX progress: ${outcomes.length}/${matrix.cases.length}`);
    }
  }

  const counts = {translation: {pass: 0, run: 0}, refusal: {pass: 0, run: 0},
    ambiguity: {pass: 0, run: 0}, fail: {required: 0, exploratory: 0},
    infra: {required: 0, exploratory: 0}};
  for (const {item, outcome, document, durationMs} of outcomes) {
    const kind = outcome.kind in KIND_LABEL ? outcome.kind : null;
    printCaseOutcome({item, outcome, document, durationMs,
      verbosity: flags.verbosity, colorize});
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

  const semanticRelations = evaluateSemanticRelations(matrix.surfaceEquivalence?.groups, outcomes);
  console.log('');
  if (!semanticRelations.declared) {
    console.log('SEMANTIC RELATIONS: NOT RUN — no groups declared.');
    console.log('GATE (semantic relations): NOT RUN — no relation coverage is claimed.');
  } else {
    console.log(`SEMANTIC RELATIONS: ${semanticRelations.passed}/${semanticRelations.declared} PASS, ` +
      `${semanticRelations.failed} FAIL, ${semanticRelations.notRun} NOT RUN.`);
    for (const group of semanticRelations.groups.filter(entry => entry.status !== 'PASS')) {
      console.log(`  RELATION-${group.status} ${group.id} (${group.relation}): ` +
        `${group.reason ?? group.differences.slice(0, 4).map(entry =>
          `${entry.path} [${entry.caseIds.join(' / ')}]`).join(', ')}`);
    }
    console.log(semanticRelations.failed > 0 || semanticRelations.notRun > 0
      ? 'GATE (semantic relations): RED — every declared relation must run and pass.'
      : 'GATE (semantic relations): GREEN — all declared relations PASS.');
  }

  const gapCount = Array.isArray(matrix.gaps?.gaps) ? matrix.gaps.gaps.length : 0;
  console.log('');
  const hasMatrixErrors = counts.fail.required + counts.fail.exploratory +
    counts.infra.required + counts.infra.exploratory > 0;
  console.log(colorize(`Totals: translation ${counts.translation.pass}/${counts.translation.run}, ` +
    `refusal ${counts.refusal.pass}/${counts.refusal.run}, ` +
    `ambiguity ${counts.ambiguity.pass}/${counts.ambiguity.run}, ` +
    `FAIL ${counts.fail.required} required / ${counts.fail.exploratory} exploratory, ` +
    `INFRA ${counts.infra.required} required / ${counts.infra.exploratory} exploratory, ` +
    `matrix cases NOT-RUN 0`, hasMatrixErrors ? '31;1' : '32'));
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
          if (flags.verbosity === 'verbose' && (completed % 25 === 0 || completed === total)) {
            console.log(`CLI progress: ${completed}/${total}`);
          }
        }});
      let smokePassed = 0;
      for (const result of cliResults) {
        if (result.pass) {
          smokePassed += 1;
          if (flags.verbosity === 'verbose') {
            console.log(colorize(`CLI-PASS [${result.kind}] ${result.id} (${result.durationMs} ms)`, '32'));
          }
        } else {
          console.log(colorize(`${result.kind === 'infra' ? 'CLI-INFRA' : 'CLI-FAIL'} ${result.id} ` +
            `(${result.durationMs} ms):`, result.kind === 'infra' ? '35;1' : '31;1'));
          for (const line of result.lines) console.log(colorize(`    - ${line}`, '31'));
        }
      }
      console.log(colorize(`CLI smoke: ${smokePassed}/${cliResults.length} passed.`,
        smokePassed === cliResults.length ? '32' : '31;1'));
      cliFailed = smokePassed !== cliResults.length;
    }
  }

  const failedRequired = counts.fail.required + counts.infra.required;
  const semanticRelationFailed = semanticRelations.declared > 0 &&
    (semanticRelations.failed > 0 || semanticRelations.notRun > 0);
  const matrixRed = failedRequired > 0 || semanticRelationFailed;
  const gates = {
    matrix: matrixRed ? 'RED' : 'GREEN',
    coverage: coverageFailed ? 'RED' : 'GREEN',
    cli: (flags.cli || flags.all) ? (cliFailed ? 'RED' : 'GREEN') : 'NOT RUN',
    semanticRelations: !semanticRelations.declared ? 'NOT RUN' :
      semanticRelationFailed ? 'RED' : 'GREEN'
  };
  if (matrixRed) {
    console.log(`GATE: RED — ${failedRequired} required case(s) did not pass; ` +
      `${semanticRelations.failed} semantic relation(s) FAIL, ${semanticRelations.notRun} NOT RUN. ` +
      'Merge to main stays blocked.');
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
      coverage: coverageResult, cliSmoke: cliResults, semanticRelations, gates, notRun: notRunLabels,
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

function printFailures(failures, colorize = text => text) {
  for (const failure of failures) {
    console.log(colorize(`    - ${failure.path}: expected ${clip(failure.expected)}; observed ${clip(failure.actual)}`, '31'));
  }
}

main().catch(error => {
  console.error(`INFRA runner crashed: ${clip(error?.message ?? String(error))}`);
  process.exitCode = 1;
});
