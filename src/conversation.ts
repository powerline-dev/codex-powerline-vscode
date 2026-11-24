import * as path from 'node:path';
import * as vscode from 'vscode';

export interface Selection {
    threadId?: string;
    tabTitle?: string;
    projectDirectory?: string;
}

// Codex owns this custom editor and its private URI format.
const CONVERSATION_EDITOR = 'chatgpt.conversationEditor';
const THREAD_ROUTE = /^\/local\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i;

export function localThreadId(input: unknown): string | undefined {
    if (!(input instanceof vscode.TabInputCustom) || input.viewType !== CONVERSATION_EDITOR) {
        return undefined;
    }
    const { scheme, authority, path: route } = input.uri;
    if (scheme !== 'openai-codex' || authority !== 'route') {
        return undefined;
    }
    return THREAD_ROUTE.exec(route)?.[1].toLowerCase();
}

export async function openLocalConversation(threadId: string): Promise<void> {
    const route = `/local/${threadId}`;
    if (THREAD_ROUTE.test(route)) {
        const uri = vscode.Uri.from({ scheme: 'openai-codex', authority: 'route', path: route });
        await vscode.commands.executeCommand('vscode.openWith', uri, CONVERSATION_EDITOR, { preview: false });
    }
}

export function currentSelection(): Selection {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    const threadId = localThreadId(tab?.input);
    const file = tab?.input instanceof vscode.TabInputText ? tab.input.uri : undefined;
    const folder = file && vscode.workspace.getWorkspaceFolder(file);
    const projectDirectory = folder?.uri.fsPath ?? (
        file?.scheme === 'file' || file?.scheme === 'vscode-remote'
            ? path.dirname(file.fsPath)
            : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    );
    return { threadId, tabTitle: threadId ? tab?.label : undefined, projectDirectory };
}
