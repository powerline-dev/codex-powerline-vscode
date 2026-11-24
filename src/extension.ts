import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { TerminalSession } from './terminal';

const VIEW_ID = 'codexPowerline.terminal';

const escapeAttribute = (value: string) => value
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function terminalHtml(webview: vscode.Webview, assets: vscode.Uri): string {
    const terminal = vscode.workspace.getConfiguration('terminal.integrated');
    const editor = vscode.workspace.getConfiguration('editor');
    const fontFamily = terminal.get<string>('fontFamily') || editor.get<string>('fontFamily') || 'monospace';
    const fontSize = terminal.get<number>('fontSize') ?? 14;
    const nonce = randomBytes(16).toString('base64');
    const css = webview.asWebviewUri(vscode.Uri.joinPath(assets, 'terminal.css'));
    const js = webview.asWebviewUri(vscode.Uri.joinPath(assets, 'terminal.js'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <link rel="stylesheet" href="${escapeAttribute(css.toString())}">
    <title>Codex Powerline Terminal</title>
</head>
<body>
    <div id="terminal" data-font-family="${escapeAttribute(fontFamily)}" data-font-size="${Number(fontSize)}"></div>
    <script nonce="${nonce}" src="${escapeAttribute(js.toString())}"></script>
</body>
</html>`;
}

export function activate(context: vscode.ExtensionContext): void {
    const assets = vscode.Uri.joinPath(context.extensionUri, 'dist');
    let session: TerminalSession | undefined;
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(VIEW_ID, {
            resolveWebviewView(view) {
                session?.dispose();
                view.webview.options = { enableScripts: true, localResourceRoots: [assets] };
                session = new TerminalSession(view);
                view.webview.html = terminalHtml(view.webview, assets);
            }
        }, { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.commands.registerCommand('codexPowerline.restartTerminal', async () => {
            const loaded = session;
            await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
            if (loaded === session) {
                session?.restart();
            }
        }),
        new vscode.Disposable(() => session?.dispose())
    );
}
