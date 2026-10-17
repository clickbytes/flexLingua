import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const git=(...args)=>execFileSync('git',['-c',`safe.directory=${root}`,...args],
  {cwd:root,encoding:'utf8'}).trim();

if(git('rev-parse','--show-toplevel').replaceAll('\\','/').toLowerCase()!==
   root.replaceAll('\\','/').replace(/\/$/u,'').toLowerCase())
  throw new Error('Run hook setup from the flexLingua checkout.');
git('config','--local','core.hooksPath','.githooks');
process.stdout.write('Local Git hooks installed: .githooks/pre-commit and pre-push.\n');
