import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { TerminalInput, TerminalOutput, TerminalSize } from './messages';
import '@xterm/xterm/css/xterm.css';
import './webview.css';

declare function acquireVsCodeApi(): { postMessage(message: TerminalInput): void };

const vscode = acquireVsCodeApi();
const container = document.querySelector<HTMLDivElement>('#terminal')!;
const ansiColors = [
    'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
    'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue',
    'brightMagenta', 'brightCyan', 'brightWhite'
] as const;

function readTheme(): ITheme {
    const style = getComputedStyle(document.body);
    const color = (name: string) => style.getPropertyValue(`--vscode-${name}`).trim() || undefined;
    const foreground = color('terminal-foreground') ?? color('foreground');
    const theme: ITheme = {
        foreground,
        background: color('terminal-background') ?? color('sideBar-background'),
        cursor: color('terminalCursor-foreground') ?? foreground,
        cursorAccent: color('terminalCursor-background'),
        selectionBackground: color('terminal-selectionBackground')
    };
    for (const key of ansiColors) {
        theme[key] = color(`terminal-ansi${key[0].toUpperCase()}${key.slice(1)}`);
    }
    return theme;
}

const terminal = new Terminal({
    fontFamily: container.dataset.fontFamily,
    fontSize: Number(container.dataset.fontSize) || 14,
    theme: readTheme()
});
const fit = new FitAddon();
terminal.loadAddon(fit);
terminal.open(container);

let size: TerminalSize | undefined;
function resize(): void {
    if (!container.clientWidth || !container.clientHeight) {
        return;
    }
    fit.fit();
    const { cols, rows } = terminal;
    if (cols !== size?.cols || rows !== size?.rows) {
        size = { cols, rows };
        vscode.postMessage({ type: 'resize', size });
    }
}

new ResizeObserver(resize).observe(container);
new MutationObserver(() => {
    terminal.options.theme = readTheme();
    resize();
}).observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
void document.fonts.ready.then(resize);
window.addEventListener('message', (event: MessageEvent<TerminalOutput>) => {
    if (event.data?.type === 'output' && typeof event.data.text === 'string') {
        terminal.write(event.data.text);
    }
});
terminal.onData(text => vscode.postMessage({ type: 'input', text }));
terminal.onBinary(text => vscode.postMessage({ type: 'input', text }));
resize();
