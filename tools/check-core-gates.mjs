import {createHash} from 'node:crypto';
import {appendFile, readFile, readlink} from 'node:fs/promises';
import {execFileSync, spawnSync} from 'node:child_process';
import {join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const GENERATED_INDEX = '.codegraph/';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function comparePath(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function buildFileManifest(entries) {
  if (!Array.isArray(entries)) throw new Error('File manifest must be an array.');
  const sorted = entries.map(entry => ({
    path: entry?.path, mode: entry?.mode || '100644', sha256: entry?.sha256
  })).sort((left, right) => comparePath(left.path, right.path));
  const paths = new Set();
  for (const entry of sorted) {
    if (!entry || typeof entry.path !== 'string' || !entry.path ||
        !['100644', '100755', '120000'].includes(entry.mode) ||
        typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(entry.sha256) ||
        paths.has(entry.path)) {
      throw new Error('Invalid or duplicate file manifest entry.');
    }
    paths.add(entry.path);
  }
  return {fileCount: sorted.length, sha256: sha256(JSON.stringify(sorted)), files: sorted};
}

export function parseNodeTestSummaries(output) {
  const clean = String(output).replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, '').replace(/\r/gu, '');
  const lines = clean.split('\n');
  const summaries = [];
  for (let index = 0; index < lines.length; index++) {
    const tests = /^\s*ℹ tests (\d+)\s*$/u.exec(lines[index]);
    if (!tests) continue;
    const suites = /^\s*ℹ suites (\d+)\s*$/u.exec(lines[index + 1] || '');
    const passed = /^\s*ℹ pass (\d+)\s*$/u.exec(lines[index + 2] || '');
    const failed = /^\s*ℹ fail (\d+)\s*$/u.exec(lines[index + 3] || '');
    if (suites && passed && failed) {
      summaries.push({tests: Number(tests[1]), suites: Number(suites[1]),
        passed: Number(passed[1]), failed: Number(failed[1])});
      index += 3;
    }
  }
  return summaries;
}

export function createReleaseReport({
  checkoutSha, sourceSha, version, runtime, manifest, gateResults,
  nodeTestResults = [], dirtyFiles = []
}) {
  const allGatesPassed = Object.values(gateResults).length > 0 &&
    Object.values(gateResults).every(result => result === 'success');
  const testsParsed = nodeTestResults.length > 0;
  const testsPassed = testsParsed && nodeTestResults.every(result =>
    Number.isInteger(result.tests) && result.tests > 0 && result.failed === 0 &&
    result.passed === result.tests);
  const clean = dirtyFiles.length === 0;
  return {
    schemaVersion: 1,
    checkoutSha,
    sourceSha,
    packageVersion: version,
    fileManifest: manifest,
    runtime,
    gateResults,
    nodeTestResults,
    worktree: {clean, changes: dirtyFiles, ignoredGeneratedPaths: [GENERATED_INDEX]},
    eligible: allGatesPassed && testsPassed && clean
  };
}

function git(args) {
  return execFileSync('git', args, {cwd: ROOT, encoding: 'utf8'}).trimEnd();
}

async function readManifest() {
  const files = git(['ls-files', '--stage', '-z']).split('\0').filter(Boolean).map(record => {
    const tab = record.indexOf('\t');
    const [mode, , stage] = record.slice(0, tab).split(' ');
    if (stage !== '0') throw new Error('Release manifest found an unresolved index stage.');
    return {mode, path: record.slice(tab + 1)};
  }).sort((left, right) => comparePath(left.path, right.path));
  const entries = [];
  for (const file of files) {
    const bytes = file.mode === '120000' ? Buffer.from(await readlink(join(ROOT, file.path))) :
      await readFile(join(ROOT, file.path));
    entries.push({path: file.path.replaceAll(sep, '/'), mode: file.mode, sha256: sha256(bytes)});
  }
  return buildFileManifest(entries);
}

function changedFiles() {
  return git(['status', '--porcelain=v1', '--untracked-files=all'])
    .split('\n').filter(Boolean).map(line => {
      const path = line.slice(3).replace(/^"|"$/gu, '');
      return {status: line.slice(0, 2), path};
    }).filter(({status, path}) => {
      const generated = status === '??' &&
        (path === GENERATED_INDEX.slice(0, -1) || path.startsWith(GENERATED_INDEX));
      return !generated;
    })
    .map(({status, path}) => `${status} ${path}`);
}

function run(command, args, {shell = false} = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    shell
  });
  if (result.error) throw result.error;
  return {status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || ''};
}

function npm(args) {
  return run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args,
    {shell: process.platform === 'win32'});
}

function parseSummaryFile(path) {
  return readFile(path, 'utf8').then(parseNodeTestSummaries);
}

async function writeSummary(report) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const tests = report.nodeTestResults.map((result, index) =>
    `- Node test run ${index + 1}: ${result.passed}/${result.tests} passed, ${result.failed} failed.`).join('\n');
  const body = [
    '## Deterministic release evidence',
    `- Source SHA: \`${report.sourceSha}\``,
    `- Checked out SHA: \`${report.checkoutSha}\``,
    `- Package version: \`${report.packageVersion}\``,
    `- Tracked file manifest: ${report.fileManifest.fileCount} files, SHA-256 \`${report.fileManifest.sha256}\``,
    `- Release-gate runtime: Node \`${report.runtime.releaseGate.node}\`; npm \`${report.runtime.releaseGate.npm}\``,
    `- Unit-test runtime: Node \`${report.runtime.nodeUnitTests.node}\`; npm \`${report.runtime.nodeUnitTests.npm}\``,
    `- Audit runtime: Node \`${report.runtime.lexicalAndReleaseAudits.node}\`; npm \`${report.runtime.lexicalAndReleaseAudits.npm}\``,
    ...Object.entries(report.gateResults).map(([name, result]) => `- ${name}: \`${result}\``),
    ...(report.nodeTestResults.length ? [tests] : ['- Node test summary: unavailable.']),
    `- Release eligible: **${report.eligible ? 'yes' : 'no'}**`, ''
  ].join('\n');
  await appendFile(process.env.GITHUB_STEP_SUMMARY, body, 'utf8');
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--test-summary') {
    const summaries = await parseSummaryFile(args[1]);
    process.stdout.write(`summary=${JSON.stringify(summaries[0] || null)}\n`);
    if (!summaries.length) process.exitCode = 1;
    return;
  }

  const ciMode = args[0] === '--ci';
  const dirty = changedFiles();
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const nodeVersion = run(process.execPath, ['--version']);
  const npmVersion = npm(['--version']);
  const runtime = {
    releaseGate: {node: nodeVersion.stdout.trim(), npm: npmVersion.stdout.trim()},
    nodeUnitTests: {
      node: process.env.RELEASE_UNIT_TEST_NODE || nodeVersion.stdout.trim(),
      npm: process.env.RELEASE_UNIT_TEST_NPM || npmVersion.stdout.trim()
    },
    lexicalAndReleaseAudits: {
      node: process.env.RELEASE_AUDIT_NODE || nodeVersion.stdout.trim(),
      npm: process.env.RELEASE_AUDIT_NPM || npmVersion.stdout.trim()
    }
  };
  const manifest = await readManifest();
  const checkoutSha = git(['rev-parse', 'HEAD']);
  const sourceSha = ciMode ?
    (process.env.RELEASE_SOURCE_SHA || process.env.GITHUB_SHA || checkoutSha) : checkoutSha;
  let gateResults;
  let nodeTestResults;

  if (ciMode) {
    gateResults = {
      nodeUnitTests: process.env.RELEASE_UNIT_TEST_RESULT || 'unavailable',
      lexicalAndReleaseAudits: process.env.RELEASE_AUDIT_RESULT || 'unavailable'
    };
    try {
      const summary = process.env.RELEASE_UNIT_TEST_SUMMARY ?
        JSON.parse(process.env.RELEASE_UNIT_TEST_SUMMARY) : null;
      nodeTestResults = summary && Number.isInteger(summary.tests) ? [summary] : [];
      if (!nodeTestResults.length) gateResults.nodeUnitTests = 'missing-test-summary';
    } catch {
      nodeTestResults = [];
      gateResults.nodeUnitTests = 'invalid-test-summary';
    }
  } else if (dirty.length) {
    gateResults = {localReleaseChecks: 'not-run-dirty-worktree'};
    nodeTestResults = [];
  } else {
    const result = npm(['run', 'check:release']);
    gateResults = {localReleaseChecks: result.status === 0 ? 'success' : 'failure'};
    nodeTestResults = parseNodeTestSummaries(result.stdout + '\n' + result.stderr);
    if (result.status !== 0 && result.stderr.trim()) {
      gateResults.localReleaseChecks = 'failure';
    }
  }

  const report = createReleaseReport({
    checkoutSha, sourceSha, version: pkg.version,
    runtime,
    manifest, gateResults, nodeTestResults, dirtyFiles: dirty
  });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  await writeSummary(report);
  if (!report.eligible) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`Release gate evidence failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
