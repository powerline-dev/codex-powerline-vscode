import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { createInterface } from 'node:readline';
import * as vscode from 'vscode';
import type { StatusJSON } from '@powerline-dev/codex-powerline-core';
import { codexHome } from './history';
import { jsonRecord, number, record, string } from './json';

export type AccountSnapshot = Pick<StatusJSON, 'codex' | 'rate_limits'>;

function executable(): string {
    const override = vscode.workspace.getConfiguration('chatgpt').get<string | null>('cliExecutable')?.trim();
    if (override) {
        return override;
    }
    const installation = vscode.extensions.getExtension('openai.chatgpt')?.extensionPath;
    const platform = { darwin: 'macos', linux: 'linux', win32: 'windows' }[process.platform as string];
    const architecture = { arm64: 'aarch64', x64: 'x86_64' }[process.arch as string];
    const command = process.platform === 'win32' ? 'codex.exe' : 'codex';
    if (installation && platform && architecture) {
        const bundled = path.join(installation, 'bin', `${platform}-${architecture}`, command);
        if (existsSync(bundled)) {
            return bundled;
        }
    }
    return command;
}

function parseLimits(input: unknown): StatusJSON['rate_limits'] {
    const result = record(input);
    const bucket = record(record(result.rateLimitsByLimitId).codex ?? result.rateLimits);
    const limits: NonNullable<StatusJSON['rate_limits']> = {};
    for (const value of [bucket.primary, bucket.secondary]) {
        const period = record(value);
        const used = number(period.usedPercent);
        const reset = number(period.resetsAt);
        const duration = period.windowDurationMins;
        if (used === undefined && reset === undefined) {
            continue;
        }
        if (duration === 300) {
            limits.five_hour = { used_percentage: used, resets_at: reset };
        } else if (duration === 10080) {
            limits.seven_day = { used_percentage: used, resets_at: reset };
        }
    }
    return limits.five_hour || limits.seven_day ? limits : undefined;
}

export function readAccount(signal: AbortSignal, version: string): Promise<AccountSnapshot> {
    if (!vscode.workspace.isTrusted || signal.aborted) {
        return Promise.resolve({});
    }
    return new Promise(resolve => {
        // App Server handles the signed-in account, including file or keychain auth.
        const child = spawn(executable(), ['app-server', '--listen', 'stdio://'], {
            cwd: homedir(),
            env: { ...process.env, CODEX_HOME: codexHome() },
            stdio: ['pipe', 'pipe', 'ignore'],
            windowsHide: true
        });
        const lines = createInterface({ input: child.stdout });
        const snapshot: AccountSnapshot = {};
        const pending = new Set([2, 3]);
        let finished = false;
        const finish = () => {
            if (finished) {
                return;
            }
            finished = true;
            clearTimeout(timeout);
            signal.removeEventListener('abort', finish);
            lines.close();
            child.stdin.destroy();
            child.kill();
            resolve(snapshot);
        };
        const timeout = setTimeout(finish, 15_000);
        signal.addEventListener('abort', finish, { once: true });
        child.once('error', finish);
        child.once('close', finish);
        child.stdin.on('error', finish);
        const send = (message: object) => child.stdin.write(JSON.stringify(message) + '\n');

        lines.on('line', line => {
            const response = jsonRecord(line);
            if (response.id === 1) {
                if (!response.result) {
                    finish();
                    return;
                }
                send({ method: 'initialized' });
                send({ id: 2, method: 'account/rateLimits/read' });
                send({ id: 3, method: 'account/read', params: { refreshToken: false } });
            } else if (typeof response.id === 'number' && pending.delete(response.id)) {
                if (response.id === 2) {
                    snapshot.rate_limits = parseLimits(response.result);
                } else {
                    const account = record(record(response.result).account);
                    if (account.type === 'chatgpt') {
                        snapshot.codex = {
                            account_email: string(account.email),
                            account_workspace_name: string(account.workspaceName)
                        };
                    }
                }
                if (pending.size === 0) {
                    finish();
                }
            }
        });
        send({
            id: 1,
            method: 'initialize',
            params: { clientInfo: { name: 'codex-powerline-vscode', version } }
        });
    });
}
