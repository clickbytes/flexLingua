/**
 * Batched CLI verifier for cliSmoke-tagged cases. One case exercises the shipped
 * process entry point; the remaining cases reuse the same CLI command function
 * and a runtime per direction.
 */

import {execFile} from 'node:child_process';
import {join} from 'node:path';
import {createAppRuntime} from '../../js/app/runtime.js';
import {executeCli} from '../../tools/translate.mjs';
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
export async function runCliSmoke({cases, serviceDocuments, engine, repoRoot, onProgress}) {
  const results = new Array(cases.length);
  const runtimes = new Map();
  let completed = 0;

  function argumentsFor(item) {
    return ['--from', item.input.from, '--to', item.input.to,
      '--text', item.input.text, '--json'];
  }

  async function runtimeFor(item) {
    const key = `${item.input.from}->${item.input.to}`;
    let runtimePromise = runtimes.get(key);
    if (!runtimePromise) {
      runtimePromise = createAppRuntime({root: repoRoot,
        pluginCodes: [...new Set([item.input.from, item.input.to])]});
      runtimes.set(key, runtimePromise);
    }
    return runtimePromise;
  }

  async function runProcess(item) {
    return new Promise(resolve => {
      execFile(process.execPath,
        [join(repoRoot, 'tools', 'translate.mjs'), ...argumentsFor(item)],
        {cwd: repoRoot, encoding: 'utf8', timeout: CLI_TIMEOUT_MS,
          maxBuffer: CLI_MAX_BUFFER, shell: false},
        (error, stdout, stderr) => resolve({stdout, stderr,
          status: error ? (Number.isInteger(error.code) ? error.code : null) : 0,
          signal: error?.signal,
          error: error && (error.killed || error.signal || !Number.isInteger(error.code))
            ? error : null}));
    });
  }

  async function runCase(item, {processSmoke = false} = {}) {
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
      if (!serviceDocuments.has(item.id) || serviceDocuments.get(item.id) == null) {
        throw new Error(`Missing matrix service document for ${item.id}`);
      }

      const command = processSmoke ? null : await executeCli(argumentsFor(item), {
        runtime: await runtimeFor(item)
      });
      const run = processSmoke ? await runProcess(item) : {
        document: command.document,
        status: command.exitCode,
        signal: null,
        error: null,
        stderr: '',
        json: command.options?.json === true
      };
      result.durationMs = Date.now() - started;

      if (run.error || run.signal) {
        result.kind = 'infra';
        result.lines.push(`CLI INFRA: subprocess failed (${clip(run.error?.code) ??
          `signal ${run.signal}`}: ${clip(run.error?.message ?? 'no message')})`);
        return result;
      }

      const expectedExit = EXPECTED_EXIT[item.expected?.status];
      if (expectedExit === undefined || run.status !== expectedExit) {
        result.lines.push(`exit code: expected ${expectedExit ?? 'documented policy'}, ` +
          `observed ${String(run.status)}`);
      }

      if (/node:internal/u.test(run.stderr ?? '')) {
        result.lines.push('stderr leaks node:internal stack traces in the product path');
      }

      let document;
      if (processSmoke) {
        try {
          document = JSON.parse((run.stdout ?? '').trim());
        } catch {
          result.kind = 'infra';
          result.lines.push('CLI INFRA: stdout is not a single parseable JSON document ' +
            `("${clip(run.stdout ?? '', 160)}")`);
          return result;
        }
      } else {
        document = run.document;
        if (!run.json) result.lines.push('batch CLI request did not select JSON output');
      }

      const comparison = compareCase(item, document, {engine});
      result.kind = comparison.kind;
      if (run.status !== expectedExit) {
        result.kind = run.status === 1 || run.status === undefined || run.status === null
          ? 'infra' : comparison.kind;
        if (result.kind === 'infra') {
          result.lines.push(`CLI INFRA: command exited ${String(run.status)} instead of the documented ${expectedExit}`);
        }
      }
      for (const failure of comparison.failures) {
        result.lines.push(`${failure.path}: expected ${clip(failure.expected)}; ` +
          `observed ${clip(failure.actual)}`);
      }

      const serviceDocument = serviceDocuments.get(item.id);
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
    result.durationMs = Date.now() - started;
    return result;
  }

  const processSmokeIndex = Math.max(0, cases.findIndex(item => item.expected?.status === 'ok'));
  for (let index = 0; index < cases.length; index += 1) {
    results[index] = await runCase(cases[index], {processSmoke: index === processSmokeIndex});
    completed += 1;
    onProgress?.(completed, cases.length);
  }
  return results;
}
