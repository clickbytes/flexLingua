import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildFileManifest, createReleaseReport, parseNodeTestSummaries} from '../tools/check-core-gates.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');

test('REL-03 file manifest sorts paths and hashes the complete stable inventory', () => {
  const entries = [
    {path: 'z/data.json', mode: '100644', sha256: digest('z')},
    {path: 'a/index.js', mode: '100755', sha256: digest('a')}
  ];
  const manifest = buildFileManifest(entries);
  assert.deepEqual(manifest.files.map(entry => entry.path), ['a/index.js', 'z/data.json']);
  assert.equal(manifest.fileCount, 2);
  assert.equal(manifest.sha256, digest(JSON.stringify(manifest.files)));
  assert.deepEqual(buildFileManifest([...entries].reverse()), manifest);
  assert.throws(() => buildFileManifest([...entries, entries[0]]), /duplicate/);
});

test('REL-03 parses stable Node test totals while ignoring ANSI color and durations', () => {
  const output = '\u001b[32m✔ one (4.2ms)\u001b[0m\r\n' +
    'ℹ tests 2\r\nℹ suites 0\r\nℹ pass 2\r\nℹ fail 0\r\n' +
    'ℹ duration_ms 4.2\r\n' +
    'ℹ tests 1\nℹ suites 0\nℹ pass 0\nℹ fail 1\n';
  assert.deepEqual(parseNodeTestSummaries(output), [
    {tests: 2, suites: 0, passed: 2, failed: 0},
    {tests: 1, suites: 0, passed: 0, failed: 1}
  ]);
});

test('REL-03 report is deterministic and release eligibility fails closed', () => {
  const input = {
    checkoutSha: 'a'.repeat(40), sourceSha: 'b'.repeat(40), version: '1.12.0',
    runtime: {node: 'v22.0.0', npm: '10.0.0'},
    manifest: buildFileManifest([{path: 'package.json', mode: '100644', sha256: digest('{}')}]),
    gateResults: {nodeUnitTests: 'success', lexicalAndReleaseAudits: 'success'},
    nodeTestResults: [{tests: 1, suites: 0, passed: 1, failed: 0}], dirtyFiles: []
  };
  const first = createReleaseReport(input);
  const second = createReleaseReport(structuredClone(input));
  assert.deepEqual(first, second);
  assert.equal(first.eligible, true);
  assert.equal(createReleaseReport({...input, gateResults: {...input.gateResults,
    nodeUnitTests: 'failure'}}).eligible, false);
  assert.equal(createReleaseReport({...input, dirtyFiles: [' M package.json']}).eligible, false);
  assert.equal(createReleaseReport({...input, nodeTestResults: []}).eligible, false);
});
