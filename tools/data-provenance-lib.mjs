import {readdir, readFile} from 'node:fs/promises';
import {join, relative, sep} from 'node:path';

const REQUIRED_FIELDS = ['author','source','license','reviewedAt','permittedUse'];
const VALID_STATUSES = new Set(['project-authored','legacy-review-required']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp=Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10) === value;
}

export async function readDataPackageInventory(dataRoot,pathPrefix='data') {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory,{withFileTypes:true})) {
      const fullPath = join(directory,entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'provenance.json') {
        const packageData = JSON.parse(await readFile(fullPath,'utf8'));
        const path = relative(dataRoot,fullPath).split(sep).join('/');
        files.push({path:`${pathPrefix}/${path}`,version:packageData.version ?? packageData.schemaVersion});
      }
    }
  }
  await visit(dataRoot);
  return files.sort((a,b)=>a.path.localeCompare(b.path));
}

export function validateDataProvenance(manifest, inventory) {
  if (!isRecord(manifest) || manifest.schemaVersion !== 1 ||
      !Array.isArray(manifest.packages) || !validDate(manifest.reviewedAt)) {
    throw new Error('Invalid data provenance manifest header.');
  }
  const actualByPath = new Map(inventory.map(item=>[item.path,item]));
  if (actualByPath.size !== inventory.length) throw new Error('Duplicate data package path in inventory.');
  const declaredByPath = new Map();
  const ids = new Set();

  for (const entry of manifest.packages) {
    if (!isRecord(entry) || typeof entry.path !== 'string' || !entry.path.startsWith('data/')) {
      throw new Error('Invalid data provenance package path.');
    }
    if (declaredByPath.has(entry.path)) throw new Error(`Duplicate provenance record: ${entry.path}`);
    if (typeof entry.id === 'string') {
      if (ids.has(entry.id)) throw new Error(`Duplicate provenance id: ${entry.id}`);
      ids.add(entry.id);
    }
    declaredByPath.set(entry.path,entry);

    const actual = actualByPath.get(entry.path);
    if (!actual) throw new Error(`Provenance record points to a missing data package: ${entry.path}`);
    if (entry.version !== actual.version || actual.version === undefined || actual.version === null) {
      throw new Error(`Provenance version does not match ${entry.path}.`);
    }
    for (const field of REQUIRED_FIELDS) {
      if (typeof entry[field] !== 'string' || !entry[field].trim()) {
        throw new Error(`Missing ${field} in data provenance for ${entry.path}.`);
      }
    }
    if (!VALID_STATUSES.has(entry.status)) throw new Error(`Invalid provenance status for ${entry.path}.`);
    if (!validDate(entry.reviewedAt)) throw new Error(`Invalid review date for ${entry.path}.`);
    if (entry.status === 'legacy-review-required' &&
        (typeof entry.migrationNote !== 'string' || !entry.migrationNote.trim())) {
      throw new Error(`Legacy data package needs a migration note: ${entry.path}`);
    }
  }

  for (const path of actualByPath.keys()) {
    if (!declaredByPath.has(path)) throw new Error(`No provenance record for data package: ${path}`);
  }
  return {
    packages: inventory.length,
    projectAuthored: manifest.packages.filter(x=>x.status==='project-authored').length,
    legacyReviewRequired: manifest.packages.filter(x=>x.status==='legacy-review-required').length
  };
}
