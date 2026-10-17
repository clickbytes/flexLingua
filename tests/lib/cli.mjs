/**
 * CLI subprocess verifier for cliSmoke-tagged cases.
 *
 * The shipped command-line entry point (`node tools/translate.mjs --json`) must
 * agree with the in-process service: same approved expectations, the documented
 * exit-code policy (0 for ok, 2 for unsupported/invalid/ambiguous/resource_limit),
 * a single parseable JSON document on stdout, and no leaked `node:internal`
 * stack traces. Infrastructure failures (timeout, crash, unparseable output)
 * are reported as INFRA and never reinterpreted as expected refusals.
 */

import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {compareCase} from './assertions.mjs';

const CLI_TIMEOUT_MS = 30_000;
const CLI_MAX_BUFFER = 8 * 1024 * 1024;
const EXPECTED_EXIT = Object.freeze({ok: 0, unsupported: 2, invalid: 2,
  ambiguous: 2, resource_limit: 2});

function stable(value) {
  if (Array.isArray(value)) return value.map(entry => stable(entry));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort()
      .map(key => [key, stable(value[key])]));
  }
  return value;
}

function clip(value, limit = 240) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  const flat = text.replace(/\s+/gu, ' ').trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
}

/**
 * Run the CLI for each tagged case through the documented acceptance command.
 * Returns [{id, tier, pass, kind, lines[], durationMs}] — the runner prints and gates.
 */
export function runCliSmoke({cases, service, repoRoot}) {
  const results = [];
  for (const item of cases) {
    const started = Date.now();
    const result = {
      id: item.id,
      tier: item.tier,
      pass: false,
      kind: null,
      lines: [],
      durationMs: 0
    };
    try {
      const run = spawnSync(process.execPath,
        [join(repoRoot, 'tools', 'translate.mjs'), '--from', item.input.from,
          '--to', item.input.to, '--text', item.input.text, '--json'],
        {cwd: repoRoot, encoding: 'utf8', timeout: CLI_TIMEOUT_MS,
          maxBuffer: CLI_MAX_BUFFER, shell: false});
      result.durationMs = Date.now() - started;

      if (run.error || run.signal) {
        result.kind = 'infra';
        result.lines.push(`CLI INFRA: subprocess failed (${clip(run.error?.code) ??
          `signal ${run.signal}`}: ${clip(run.error?.message ?? 'no message')})`);
        results.push(result);
        continue;
      }

      const expectedExit = EXPECTED_EXIT[item.expected?.status];
      if (expectedExit === undefined || run.status !== expectedExit) {
        result.lines.push(`exit code: expected ${expectedExit ?? 'documented policy'}, ` +
          `observed ${String(run.status)}`);
      }

      if (/node:internal/u.test(run.stderr ?? '')) {
        result.lines.push('stderr leaks node:internal stack traces in the product path');
      }

      let document = null;
      try {
        document = JSON.parse((run.stdout ?? '').trim());
      } catch {
        result.kind = 'infra';
        result.lines.push('CLI INFRA: stdout is not a single parseable JSON document ' +
          `("${clip(run.stdout ?? '', 160)}")`);
        results.push(result);
        continue;
      }

      const comparison = compareCase(item, document);
      result.kind = comparison.kind;
      if (run.status !== expectedExit) {
        result.kind = run.status === 1 || run.status === undefined || run.status === null
          ? 'infra' : comparison.kind;
        if (result.kind === 'infra') {
          result.lines.push(`CLI INFRA: subprocess exited ${String(run.status)} instead of the documented ${expectedExit}`);
        }
      }
      for (const failure of comparison.failures) {
        result.lines.push(`${failure.path}: expected ${clip(failure.expected)}; ` +
          `observed ${clip(failure.actual)}`);
      }

      /* Same input through the in-process service must produce the same document. */
      const serviceDocument = service.translate({
        from: item.input.from, to: item.input.to, text: item.input.text});
      if (JSON.stringify(stable(serviceDocument)) !== JSON.stringify(stable(document))) {
        result.lines.push('document differs between CLI and the in-process service');
      }

      result.pass = result.lines.length === 0;
    } catch (error) {
      result.kind = 'infra';
      result.pass = false;
      result.durationMs = Date.now() - started;
      result.lines.push(`CLI INFRA: ${clip(error?.message ?? String(error))}`);
    }
    results.push(result);
  }
  return results;
}
