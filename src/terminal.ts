import { accessSync, chmodSync, constants, statSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { spawn, type IPty } from 'node-pty';
import * as vscode from 'vscode';
import type { TerminalInput, TerminalOutput, TerminalSize } from './messages';

const OUTPUT_HIGH_WATER = 1024 * 1024;

function workingDirectory(): string {
    const file = vscode.window.activeTextEditor?.document.uri;
    const folder = (file && vscode.workspace.getWorkspaceFolder(file)) ?? vscode.workspace.workspaceFolders?.[0];
    return folder?.uri.fsPath ?? (file?.scheme === 'file' ? path.dirname(file.fsPath) : homedir());
}

function fixMacSpawnHelper(): void {
    if (process.platform !== 'darwin') {
        return;
    }
    // node-pty 1.1.0 ships its macOS prebuilt helper without the execute bit.
    const utilsPath = require.resolve('node-pty/lib/utils');
    const { loadNativeModule } = require(utilsPath) as { loadNativeModule(name: string): { dir: string } };
    const helper = path.resolve(path.dirname(utilsPath), loadNativeModule('pty').dir, 'spawn-helper');
    try {
        accessSync(helper, constants.X_OK);
    } catch {
        chmodSync(helper, statSync(helper).mode | 0o100);
    }
}

function startPowerline(size: TerminalSize): IPty {
    fixMacSpawnHelper();
    // On Windows npm installs a .cmd shim which needs the Windows command interpreter.
    const windows = process.platform === 'win32';
    const file = windows ? process.env.ComSpec ?? 'cmd.exe' : 'codex-powerline';
    const args = windows ? ['/d', '/c', 'codex-powerline', 'run'] : ['run'];
    return spawn(file, args, {
        ...size,
        cwd: workingDirectory(),
        env: {
            ...process.env,
            ...(windows ? { NoDefaultCurrentDirectoryInExePath: '1' } : {}),
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor'
        },
        name: 'xterm-256color'
    });
}

export class TerminalSession implements vscode.Disposable {
    private readonly subscriptions: vscode.Disposable[];
    private process?: IPty;
    private size?: TerminalSize;
    private attempted = false;
    private disposed = false;
    private pending = '';
    private sending = false;
    private paused = false;
    private generation = 0;

    constructor(private readonly view: vscode.WebviewView) {
        this.subscriptions = [
            view.webview.onDidReceiveMessage((message: TerminalInput) => this.receive(message)),
            view.onDidChangeVisibility(() => {
                this.start();
                this.flush();
            }),
            view.onDidDispose(() => this.dispose())
        ];
    }

    private receive(message: TerminalInput): void {
        if (message?.type === 'input' && typeof message.text === 'string') {
            this.process?.write(message.text);
        } else if (message?.type === 'resize' && message.size) {
            const { cols, rows } = message.size;
            if (![cols, rows].every(value => Number.isInteger(value) && value > 0 && value <= 65535)) {
                return;
            }
            this.size = { cols, rows };
            if (this.process) {
                this.process.resize(cols, rows);
            } else {
                this.start();
            }
        }
    }

    private start(): void {
        if (this.attempted || !this.size || !this.view.visible || this.disposed) {
            return;
        }
        this.attempted = true;
        let child: IPty;
        try {
            child = startPowerline(this.size);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.write(`Could not start codex-powerline run.\r\n${message}\r\n`);
            this.write('Check that Codex Powerline CLI is installed and on PATH, then use Restart Terminal.\r\n');
            return;
        }
        this.process = child;
        child.onData(text => {
            if (this.process === child) {
                this.write(text);
            }
        });
        child.onExit(({ exitCode, signal }) => {
            if (this.process === child) {
                this.process = undefined;
                this.paused = false;
                const result = signal ? `signal ${signal}` : `code ${exitCode}`;
                this.write(`\r\nCodex Powerline exited with ${result}. Use Restart Terminal to run it again.\r\n`);
            }
        });
    }

    private write(text: string): void {
        this.pending += text;
        if (this.process && this.pending.length >= OUTPUT_HIGH_WATER && !this.paused) {
            this.paused = true;
            this.process.pause();
        }
        this.flush();
    }

    private flush(): void {
        if (this.sending || !this.pending || !this.view.visible || this.disposed) {
            return;
        }
        const text = this.pending;
        const generation = this.generation;
        this.pending = '';
        this.sending = true;
        const message: TerminalOutput = { type: 'output', text };
        const finish = (delivered: boolean) => {
            this.sending = false;
            if (this.disposed) {
                return;
            }
            if (!delivered && generation === this.generation) {
                // VS Code may hide the view while a message is in flight.
                this.pending = text + this.pending;
                if (this.view.visible) {
                    setTimeout(() => this.flush(), 100);
                }
                return;
            }
            this.flush();
            if (this.paused && this.pending.length < OUTPUT_HIGH_WATER) {
                this.paused = false;
                this.process?.resume();
            }
        };
        void this.view.webview.postMessage(message).then(finish, () => finish(false));
    }

    restart(): void {
        if (this.disposed) {
            return;
        }
        this.stop();
        this.attempted = false;
        this.write('\x1bc');
        this.start();
    }

    private stop(): void {
        const child = this.process;
        this.process = undefined;
        this.pending = '';
        if (this.paused) {
            child?.resume();
        }
        this.paused = false;
        this.generation++;
        if (!child) {
            return;
        }
        if (process.platform === 'win32') {
            child.kill();
            return;
        }
        // Let the CLI shut down its inner Codex terminal and App Server.
        const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
        timeout.unref();
        child.onExit(() => clearTimeout(timeout));
        child.kill('SIGTERM');
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.stop();
        for (const subscription of this.subscriptions) {
            subscription.dispose();
        }
    }
}
