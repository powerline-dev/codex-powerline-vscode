import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { name, version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const targets = process.argv.slice(2);
if (!targets.length) targets.push(`${process.platform}-${process.arch}`);
const available = new Set(['win32-x64', 'win32-arm64', 'darwin-x64', 'darwin-arm64']);
for (const target of targets) {
    if (!available.has(target) || !existsSync(path.join(root, 'node_modules/node-pty/prebuilds', target))) {
        throw new Error(`No bundled node-pty prebuild for ${target}. Build on that platform with npm run package instead.`);
    }
}

const output = path.join(root, 'releases', version);
mkdirSync(output, { recursive: true });
for (const target of targets) {
    const result = spawnSync(process.execPath, [
        path.join(root, 'node_modules/@vscode/vsce/vsce'), 'package',
        '--target', target, '--out', path.join(output, `${name}-${target}-${version}.vsix`)
    ], { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}

const checksums = readdirSync(output).filter(file => file.endsWith('.vsix')).sort().map(file => {
    const hash = createHash('sha256').update(readFileSync(path.join(output, file))).digest('hex');
    return `${hash}  ${file}`;
});
writeFileSync(path.join(output, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`);
console.log(`Release packages and SHA-256 checksums: ${output}`);
