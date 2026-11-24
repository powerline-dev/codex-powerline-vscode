export interface TerminalSize {
    cols: number;
    rows: number;
}

export type TerminalInput =
    | { type: 'resize'; size: TerminalSize }
    | { type: 'input'; text: string };

export type TerminalOutput = { type: 'output'; text: string };
