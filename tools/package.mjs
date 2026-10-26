// Builds dist/redirectory-<version>.zip, ready for the Chrome Web Store.
// Usage: npm run package
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const out = path.join(root, 'dist', `redirectory-${version}.zip`);
mkdirSync(path.dirname(out), { recursive: true });
rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', '-q', out, 'manifest.json', 'src', '-x', '*.DS_Store'], { cwd: root, stdio: 'inherit' });
console.log('packaged', path.relative(root, out));
