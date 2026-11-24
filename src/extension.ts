import * as path from 'node:path';
import * as vscode from 'vscode';
import { CURRENT_VERSION, SettingsSchema, type Settings, type StatusJSON } from '@powerline-dev/codex-powerline-core';
import { readAccount, type AccountSnapshot } from './account';
import { currentSelection, openLocalConversation, type Selection } from './conversation';
import { readGit, type GitStatus } from './git';
import { CodexHistory } from './history';
import { record } from './json';
import { layout, parseLayout, render } from './render';

const VIEW_IDS = ['codexPowerline.secondary', 'codexPowerline.primary'];
const ACCOUNT_INTERVAL = 60_000;

async function importLayout(): Promise<void> {
    const [file] = await vscode.window.showOpenDialog({
        title: 'Import Powerline Layout',
        openLabel: 'Import Layout',
        filters: { JSON: ['json'] }
    }) ?? [];
    if (!file) {
        return;
    }

    let bytes: Uint8Array;
    try {
        bytes = await vscode.workspace.fs.readFile(file);
    } catch {
        await vscode.window.showErrorMessage('Powerline could not read the selected file.');
        return;
    }

    let raw: unknown;
    try {
        raw = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        await vscode.window.showErrorMessage('The selected file is not valid JSON.');
        return;
    }

    const fields = record(raw);
    const hasSettings = Object.keys(fields).some(key => key !== 'version' && Object.hasOwn(SettingsSchema.shape, key));
    // Old layouts are migrated before validation, so check the shape of their rows first.
    const hasValidLines = !('lines' in fields) || (Array.isArray(fields.lines) && fields.lines.every(Array.isArray));
    const settings = hasSettings && hasValidLines ? parseLayout(fields) : undefined;
    if (!settings || settings.version > CURRENT_VERSION) {
        await vscode.window.showErrorMessage('The selected file is not a supported Powerline layout.');
        return;
    }

    try {
        await vscode.workspace.getConfiguration('codexPowerline').update('layout', settings, vscode.ConfigurationTarget.Global);
    } catch {
        await vscode.window.showErrorMessage('Powerline could not save the layout to User Settings.');
    }
}

class Powerline implements vscode.WebviewViewProvider, vscode.Disposable {
    private readonly history = new CodexHistory();
    private readonly views = new Set<vscode.WebviewView>();
    private readonly lifetime = new AbortController();
    private readonly timer = setInterval(() => this.update(), 1000);
    private settings = this.readSettings();
    private selection: Selection = {};
    private generation = 0;
    private historyRequest?: number;
    private nextHistoryRead = 0;
    private thread: StatusJSON = {};
    private recorded = false;
    private git?: GitStatus;
    private gitDirectory?: string;
    private gitRequest = 0;
    private nextGitRead = 0;
    private account: AccountSnapshot = {};
    private nextAccountRead = 0;

    constructor(private readonly extension: vscode.ExtensionContext) {
        extension.subscriptions.push(
            vscode.commands.registerCommand('codexPowerline.openSavedConversation', () => this.pickConversation()),
            vscode.commands.registerCommand('codexPowerline.importLayout', importLayout),
            vscode.window.tabGroups.onDidChangeTabs(() => this.update()),
            vscode.window.tabGroups.onDidChangeTabGroups(() => this.update()),
            vscode.workspace.onDidChangeWorkspaceFolders(() => this.update()),
            vscode.workspace.onDidGrantWorkspaceTrust(() => this.update()),
            vscode.workspace.onDidChangeConfiguration(event => {
                if (event.affectsConfiguration('codexPowerline.layout')) {
                    this.settings = this.readSettings();
                    this.paint();
                    this.update();
                }
            })
        );
    }

    private async pickConversation(): Promise<void> {
        const conversations = await this.history.listConversations();
        if (conversations.length === 0) {
            await vscode.window.showInformationMessage('Powerline found no saved conversations in the local Codex session index.');
            return;
        }
        const picked = await vscode.window.showQuickPick(
            conversations.map(({ id, title }) => ({ label: title.trim() || id, description: id, id })),
            { placeHolder: 'Open a saved Codex conversation in an editor tab', matchOnDescription: true }
        );
        if (picked) {
            await openLocalConversation(picked.id);
        }
    }

    private readSettings(): Settings {
        return layout(vscode.workspace.getConfiguration('codexPowerline').get('layout'));
    }

    resolveWebviewView(view: vscode.WebviewView): void {
        const media = vscode.Uri.joinPath(this.extension.extensionUri, 'media');
        view.webview.options = { enableScripts: false, localResourceRoots: [media] };
        this.views.add(view);
        const visibility = view.onDidChangeVisibility(() => {
            if (view.visible) {
                this.update();
                this.paint();
            }
        });
        view.onDidDispose(() => {
            visibility.dispose();
            this.views.delete(view);
        });
        this.update();
        this.paint();
    }

    private update(): void {
        if (this.lifetime.signal.aborted || ![...this.views].some(view => view.visible)) {
            return;
        }
        const selection = currentSelection();
        if (selection.threadId !== this.selection.threadId || selection.tabTitle !== this.selection.tabTitle
            || selection.projectDirectory !== this.selection.projectDirectory
            || selection.codexDraft !== this.selection.codexDraft) {
            this.selection = selection;
            this.thread = {};
            this.recorded = false;
            this.generation++;
            this.nextHistoryRead = 0;
            this.refreshGit();
            this.paint();
        }

        const now = Date.now();
        if (selection.threadId && now >= this.nextHistoryRead && this.historyRequest !== this.generation) {
            const generation = this.generation;
            this.historyRequest = generation;
            this.nextHistoryRead = now + this.settings.refreshIntervalSeconds * 1000;
            void this.history.read(selection.threadId).then(result => {
                if (this.generation === generation && !this.lifetime.signal.aborted) {
                    this.thread = result.status;
                    this.recorded = result.recorded;
                    this.refreshGit();
                    this.paint();
                }
            }).finally(() => {
                if (this.historyRequest === generation) {
                    this.historyRequest = undefined;
                }
            });
        }
        this.refreshGit();
        if (vscode.workspace.isTrusted && now >= this.nextAccountRead) {
            this.nextAccountRead = now + ACCOUNT_INTERVAL;
            void readAccount(this.lifetime.signal, this.extension.extension.packageJSON.version).then(account => {
                this.account = account;
                this.paint();
            });
        }
    }

    private directory(): string | undefined {
        const cwd = this.thread.cwd;
        return cwd && path.isAbsolute(cwd) ? cwd : this.selection.projectDirectory;
    }

    private refreshGit(): void {
        const directory = this.directory();
        if (directory !== this.gitDirectory) {
            this.gitDirectory = directory;
            this.git = undefined;
            this.nextGitRead = 0;
            this.gitRequest++;
        }
        if (!directory || !vscode.workspace.isTrusted || Date.now() < this.nextGitRead) {
            return;
        }
        const request = ++this.gitRequest;
        this.nextGitRead = Infinity;
        void readGit(directory).then(git => {
            if (request === this.gitRequest && !this.lifetime.signal.aborted) {
                this.git = git;
                this.nextGitRead = Date.now() + this.settings.gitCacheTtlSeconds * 1000;
                this.paint();
            }
        });
    }

    private paint(): void {
        if (this.lifetime.signal.aborted) {
            return;
        }
        const { threadId, tabTitle, codexDraft } = this.selection;
        const title = tabTitle && !/^(Codex( Chat)?|New (Chat|Conversation))$/i.test(tabTitle) ? tabTitle : undefined;
        const data: StatusJSON = {
            ...this.thread,
            cwd: this.directory(),
            session_id: threadId,
            codex: { ...this.account.codex, ...this.thread.codex, session_name: this.thread.codex?.session_name ?? title },
            rate_limits: this.account.rate_limits
        };
        for (const view of this.views) {
            if (view.visible) {
                const uri = vscode.Uri.joinPath(this.extension.extensionUri, 'media', 'powerline.css');
                const css = view.webview.asWebviewUri(uri).toString();
                const html = render(css, view.webview.cspSource, this.settings, data, this.git, this.recorded, codexDraft);
                if (view.webview.html !== html) {
                    view.webview.html = html;
                }
            }
        }
    }

    dispose(): void {
        this.lifetime.abort();
        clearInterval(this.timer);
        this.views.clear();
    }
}

export function activate(context: vscode.ExtensionContext): void {
    const provider = new Powerline(context);
    context.subscriptions.push(provider);
    for (const viewId of VIEW_IDS) {
        context.subscriptions.push(vscode.window.registerWebviewViewProvider(viewId, provider));
    }
}
