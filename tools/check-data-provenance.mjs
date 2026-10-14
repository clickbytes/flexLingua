import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDataPackageInventory,validateDataProvenance} from './data-provenance-lib.mjs';

const dataRoot=join(dirname(fileURLToPath(import.meta.url)),'..','data');
const manifest=JSON.parse(await readFile(join(dataRoot,'provenance.json'),'utf8'));
const inventory=await readDataPackageInventory(dataRoot);
const result=validateDataProvenance(manifest,inventory);
console.log(`Data provenance: ${result.packages} packages checked; ${result.projectAuthored} project-authored; ${result.legacyReviewRequired} require source/license migration.`);
