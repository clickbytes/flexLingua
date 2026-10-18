/** Deterministic discovery of canonical test envelopes under tests/cases/<from>-<to>/. */

import {readdir, readFile} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
export const CASES_DIR = join(TESTS_DIR, '..', 'cases');

export const ALLOWED_DIRECTIONS = Object.freeze(new Set([
  'en-pl', 'pl-en', 'en-fi', 'fi-en', 'tr-en', 'it-en', 'en-it', 'en-ar', 'ar-en'
]));

export const DISCOVERY_LIMITS = Object.freeze({
  maxDirectories: 32,
  maxFiles: 64,
  maxFileBytes: 131072,
  maxTotalBytes: 2621440,
  maxCases: 600
});

const DIRECTION_NAME = /^[a-z]{2,8}-[a-z]{2,8}$/u;
const FILE_NAME = /^[a-z0-9][a-z0-9._-]{0,63}\.json$/u;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function compareIds(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Read every allowed `<from>-<to>/*.json` envelope once, validating names, sizes,
 * and readability. Structural JSON parsing happens here; schema and cross-file
 * validation belongs to validate.mjs. Never executes statement logic.
 */
export async function discoverCases({root = CASES_DIR, limits = DISCOVERY_LIMITS} = {}) {
  const envelopes = [];
  const issues = [];
  let directories = [];
  try {
    directories = (await readdir(root, {withFileTypes: true})).filter(entry => entry.isDirectory())
      .map(entry => entry.name).sort();
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    issues.push({kind: 'discovery', file: 'cases', message: `No cases directory at ${root}.`});
    return {envelopes, cases: [], issues};
  }
  if (directories.length > limits.maxDirectories) {
    issues.push({kind: 'limit', file: 'cases', message: `Too many cases directories: ${directories.length} > ${limits.maxDirectories}.`});
  }
  let totalBytes = 0;
  for (const directory of directories.slice(0, limits.maxDirectories)) {
    if (!DIRECTION_NAME.test(directory) || !ALLOWED_DIRECTIONS.has(directory)) {
      issues.push({kind: 'direction', file: directory,
        message: `Directory '${directory}' is not a canonical translation direction ` +
          `(allowed ${[...ALLOWED_DIRECTIONS].join(', ')}).`});
      continue;
    }
    let files = [];
    try {
      files = (await readdir(join(root, directory), {withFileTypes: true})).filter(entry =>
        entry.isFile() && entry.name.endsWith('.json')).map(entry => entry.name).sort();
    } catch (error) {
      issues.push({kind: 'unreadable', file: `${directory}/`,
        message: `Cannot read directory: ${error.message}`});
      continue;
    }
    for (const file of files) {
      if (envelopes.length >= limits.maxFiles) {
        issues.push({kind: 'limit', file: `${directory}/${file}`,
          message: `More than ${limits.maxFiles} case files; overflow ignored (never silent).`});
        break;
      }
      const relative = `${directory}/${file}`;
      if (!FILE_NAME.test(file)) {
        issues.push({kind: 'name', file: relative, message: `Unsafe case file name '${file}'.`});
        continue;
      }
      const path = join(root, directory, file);
      let raw;
      try {
        raw = await readFile(path);
      } catch (error) {
        issues.push({kind: 'unreadable', file: relative, message: `Cannot read file: ${error.message}`});
        continue;
      }
      if (raw.byteLength > limits.maxFileBytes) {
        issues.push({kind: 'limit', file: relative,
          message: `File exceeds ${limits.maxFileBytes} bytes.`});
        continue;
      }
      totalBytes += raw.byteLength;
      if (totalBytes > limits.maxTotalBytes) {
        issues.push({kind: 'limit', file: relative,
          message: `Combined case data exceeds ${limits.maxTotalBytes} bytes.`});
        break;
      }
      let parsed;
      try {
        parsed = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(raw));
      } catch (error) {
        issues.push({kind: 'json', file: relative, message: `Invalid UTF-8 or JSON: ${error.message}`});
        continue;
      }
      envelopes.push({file: relative, direction: directory, envelope: parsed});
    }
  }
  const cases = [];
  const seenIds = new Map();
  for (const record of envelopes) {
    const items = isRecord(record.envelope) && Array.isArray(record.envelope.cases)
      ? record.envelope.cases : null;
    if (!items) continue;
    if (items.length > 12) {
      issues.push({kind: 'limit', file: record.file, message: `Envelope holds ${items.length} cases (max 12).`});
      continue;
    }
    for (const item of items) {
      if (!isRecord(item) || typeof item.id !== 'string') continue;
      if (seenIds.has(item.id)) {
        issues.push({kind: 'duplicate', file: record.file, id: item.id,
          message: `Duplicate case id '${item.id}' (also in ${seenIds.get(item.id).file}).`});
        continue;
      }
      const [source, target] = record.direction.split('-');
      if (typeof item.input?.from !== 'string' || typeof item.input?.to !== 'string') continue;
      if (item.input.from !== source || item.input.to !== target) {
        issues.push({kind: 'direction', file: record.file, id: item.id,
          message: `Case input ${item.input.from}->${item.input.to} does not match folder ${record.direction}.`});
      }
      seenIds.set(item.id, record);
      cases.push({...item, file: record.file, direction: record.direction});
    }
  }
  cases.sort(compareIds);
  return {envelopes, cases, issues};
}
