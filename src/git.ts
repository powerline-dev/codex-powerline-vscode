import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';

export interface GitStatus {
    branch?: string;
    ahead?: number;
    behind?: number;
    changedFiles?: number;
    insertions?: number;
    deletions?: number;
    identity?: string;
}

const exec = promisify(execFile);

export async function readGit(cwd: string): Promise<GitStatus | undefined> {
    if (!path.isAbsolute(cwd)) {
        return undefined;
    }
    const run = async (args: string[]) => {
        const { stdout } = await exec('git', ['-c', 'core.fsmonitor=', '-c', 'safe.bareRepository=explicit', ...args], {
            cwd,
            env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
            timeout: 5000,
            windowsHide: true
        });
        return stdout;
    };

    // As in the CLI, disable worktree filters before commands that inspect files.
    const config = await run(['config', '--null', '--name-only', '--includes', '--get-regexp', '^filter\\..*\\.(clean|process|smudge|required)$'])
        .catch(error => error.code === 1 ? '' : undefined);
    if (config === undefined) {
        return undefined;
    }
    const filterNames = new Set(config.split('\0').filter(Boolean).map(key => key.slice(0, key.lastIndexOf('.'))));
    if ([...filterNames].some(name => name.includes('='))) {
        return undefined;
    }
    const overrides = [...filterNames].flatMap(name => [
        '-c', `${name}.clean=`, '-c', `${name}.process=`, '-c', `${name}.smudge=`, '-c', `${name}.required=false`
    ]);
    const status = await run([...overrides, 'status', '--porcelain=v2', '--branch', '-z', '--ignore-submodules=dirty', '--untracked-files=all'])
        .catch(() => undefined);
    if (status === undefined) {
        return undefined;
    }

    const result: GitStatus = {};
    let changedFiles = 0;
    const entries = status.split('\0');
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (entry.startsWith('# branch.head ')) {
            result.branch = entry.slice('# branch.head '.length);
        } else if (entry.startsWith('# branch.ab ')) {
            const counts = /\+(\d+) -(\d+)$/.exec(entry);
            if (counts) {
                result.ahead = Number(counts[1]);
                result.behind = Number(counts[2]);
            }
        } else if (/^[12u?] /.test(entry)) {
            changedFiles++;
            if (entry.startsWith('2 ')) {
                i++; // The prior path in a rename is a separate NUL-delimited field.
            }
        }
    }
    result.changedFiles = changedFiles;

    const diff = ['diff', '--numstat', '--no-ext-diff', '--no-textconv', '--ignore-submodules=dirty'];
    const [staged, unstaged, email] = await Promise.all([
        run([...overrides, ...diff, '--cached', '--']).catch(() => undefined),
        run([...overrides, ...diff, '--']).catch(() => undefined),
        run(['config', '--get', 'user.email']).catch(() => undefined)
    ]);
    if (staged !== undefined && unstaged !== undefined) {
        result.insertions = 0;
        result.deletions = 0;
        for (const row of (staged + unstaged).split('\n')) {
            const match = /^(\d+)\t(\d+)\t/.exec(row);
            if (match) {
                result.insertions += Number(match[1]);
                result.deletions += Number(match[2]);
            }
        }
    }
    result.identity = email?.trim() || (await run(['config', '--get', 'user.name']).catch(() => undefined))?.trim();
    return result;
}
