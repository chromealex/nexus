// Runs every tests/*.mjs file (except this one) in its own Node process, in alphabetical order.
// New test files are picked up automatically; no need to list them in package.json.
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const files = readdirSync(dir)
  .filter(f => f.endsWith('.mjs') && f !== 'run-all.mjs')
  .filter(f => !only.length || only.some(o => f.includes(o)))
  .sort();
const failed = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [join(dir, f)], {stdio: 'inherit'});
  if (r.status !== 0) failed.push(f);
}
console.log(`\n${files.length - failed.length}/${files.length} test files passed.`);
if (failed.length) {
  console.error('Failed: ' + failed.join(', '));
  process.exit(1);
}
