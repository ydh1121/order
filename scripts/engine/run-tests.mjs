import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
async function discover(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const files = await Promise.all(entries.map(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? discover(file) : entry.name.endsWith('.test.mjs') ? [file] : [];
  }));
  return files.flat().sort();
}
const all = process.argv.slice(2).includes('--all');
const files = await discover(path.join(root, all ? 'test' : 'test/engine'));
if (!files.length) throw new Error('No engine tests discovered');
console.log(`${all ? 'ALL' : 'ENGINE'}_TEST_DISCOVERY ${files.length} .test.mjs files (recursive, fixtures excluded)`);
// Bound worker fan-out so full discovery has the same coverage in a constrained
// workspace and on CI. No case or assertion is excluded.
const run = spawnSync(process.execPath, ['--test', '--test-concurrency=4', ...files], {cwd: root, stdio: 'inherit'});
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
