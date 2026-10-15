import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const python = path.join(projectDir, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

if (!existsSync(python)) {
  console.error(`RL virtual environment not found at ${python}. Create it and install requirements.txt first.`);
  process.exit(1);
}

const result = spawnSync(python, process.argv.slice(2), { cwd: projectDir, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
