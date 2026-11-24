import { homedir } from 'node:os';
import stringWidth from 'string-width';
import {
    ChatStatusWidget,
    CodexAccountEmailWidget,
    CodexThreadIdWidget,
    ContextLengthWidget,
    CURRENT_VERSION,
    ModelWidget,
    NO_GIT_HIDEABLE_STATE,
    NO_UPSTREAM_HIDEABLE_STATE,
    PermissionsWidget,
    SessionCostWidget,
    SessionNameWidget,
    SettingsSchema,
    WorkspaceWidget,
    formatPercent,
    formatRawOrLabeledValue,
    formatTokens,
    formatUsageResetAt,
    getContextWindowMetrics,
    isHidden,
    isMetadataFlagEnabled,
    migrateConfig,
    needsMigration,
    normalizeVersionlessConfig,
    resolveLegacyWidgetType,
    resolveNumberFormat,
    type Settings,
    type StatusJSON,
    type WidgetDefinition,
    type WidgetItem
} from '@powerline-dev/codex-powerline-core';
import authorsFavorite from '@powerline-dev/codex-powerline-core/configTemplates/authors-favorite.json';
import type { GitStatus } from './git';

const sharedWidgets = new Map<string, WidgetDefinition>([
    ['model', new ModelWidget()],
    ['context-length', new ContextLengthWidget()],
    ['codex-thread-id', new CodexThreadIdWidget()],
    ['session-name', new SessionNameWidget()],
    ['session-cost', new SessionCostWidget()],
    ['chat-status', new ChatStatusWidget()],
    ['permissions', new PermissionsWidget()],
    ['workspace', new WorkspaceWidget()],
    ['codex-account-email', new CodexAccountEmailWidget()]
]);

function item(type: string, backgroundColor: string, rawValue = false): WidgetItem {
    return { id: type, type, backgroundColor, rawValue };
}

const favorite = SettingsSchema.parse(authorsFavorite);
// Keep the preset rows and add the conversation and token details needed in the editor.
const defaultSettings: Settings = {
    ...favorite,
    lines: [
        favorite.lines[0],
        [item('session-name', 'bgBrightBlack', true), item('codex-thread-id', 'bgBrightBlack', true)],
        ...favorite.lines.slice(1),
        [item('tokens-input', 'bgBlue'), item('tokens-output', 'bgBlue'), item('tokens-total', 'bgBrightBlue')],
        [item('tokens-cached', 'bgMagenta'), item('cache-read', 'bgMagenta'), item('cache-write', 'bgMagenta')],
        [item('session-cost', 'bgGreen')]
    ]
};

export function parseLayout(value: unknown): Settings | undefined {
    const normalized = needsMigration(value, CURRENT_VERSION)
        ? migrateConfig(value, CURRENT_VERSION)
        : normalizeVersionlessConfig(value);
    const result = SettingsSchema.safeParse(normalized);
    return result.success ? result.data : undefined;
}

export function layout(value: unknown): Settings {
    return parseLayout(value) ?? defaultSettings;
}

interface Segment {
    text: string;
    label?: string;
    percent?: number;
}

// Render these values through the same widget formatters to measure empty slots.
const preview: StatusJSON = {
    cwd: `${homedir()}/Documents/Projects/my-project`,
    session_id: '00000000-0000-0000-0000-000000000000',
    model: 'gpt-6.2-sol',
    effort: { level: 'xhigh' },
    chat_status: 'waiting_for_approval',
    fast_mode: true,
    cost: { total_cost_usd: 2.45 },
    context_window: { current_usage: 50_000, context_window_size: 200_000 },
    codex: {
        session_name: 'my-session',
        account_email: 'you@example.com',
        account_workspace_name: 'Example Company',
        sandbox: 'workspace-write',
        approval_policy: 'on-request',
        compactions: 2,
        total_tokens: 152_000,
        input_tokens: 150_000,
        output_tokens: 2_000,
        cached_input_tokens: 67_000,
        cache_write_input_tokens: 5_000,
        last_cached_input_tokens: 23_000,
        last_cache_write_input_tokens: 3_000
    },
    rate_limits: {
        five_hour: { used_percentage: 48, resets_at: 1795554540 },
        seven_day: { used_percentage: 53, resets_at: 1796030820 }
    }
};
const previewGit: GitStatus = {
    branch: 'feature/example', changedFiles: 2, insertions: 42, deletions: 10, ahead: 2, behind: 3, identity: 'you@work.com'
};

const shortPath = (value: string) => {
    const home = homedir();
    return value === home || value.startsWith(home + '/') || value.startsWith(home + '\\')
        ? '~' + value.slice(home.length)
        : value;
};

function renderWidget(item: WidgetItem, data: StatusJSON, git: GitStatus | undefined, settings: Settings): Segment | undefined {
    const type = item.type;
    const metrics = getContextWindowMetrics(data);
    const format = resolveNumberFormat('token', item, settings);
    const pct = (value: number) => formatPercent(value, resolveNumberFormat('percent', item, settings), 0);
    const labeled = (label: string, value: string | number | null | undefined): Segment | undefined => {
        if (value == null || value === '') {
            return undefined;
        }
        return { text: formatRawOrLabeledValue(item, label ? label + ': ' : '', String(value)), label };
    };
    const tokens = (label: string, value: number | null | undefined) =>
        labeled(label, value == null ? undefined : formatTokens(value, format));

    const widget = sharedWidgets.get(type);
    if (widget) {
        const text = widget.render(item, { data }, settings);
        return text ? { text, label: widget.getDisplayName() } : undefined;
    }

    const codex = data.codex;
    const missingGit = isHidden(item, NO_GIT_HIDEABLE_STATE.key) ? undefined : '(no git)';
    switch (type) {
        case 'current-working-dir':
            return data.cwd ? labeled('Working directory', shortPath(data.cwd)) : undefined;
        case 'git-branch':
            return git ? labeled('Branch', git.branch === '(detached)' ? 'Detached HEAD' : git.branch)
                : missingGit ? { text: '⎇ no git', label: 'Git branch' } : undefined;
        case 'git-changes': {
            if (!git) {
                return missingGit ? { text: missingGit, label: 'Git changes' } : undefined;
            }
            const files = git.changedFiles;
            if (files === undefined || (files === 0 && isHidden(item, 'zero'))) {
                return undefined;
            }
            const count = `${files} ${files === 1 ? 'file' : 'files'}`;
            const lines = git?.insertions !== undefined && git.deletions !== undefined
                ? `+${git.insertions} −${git.deletions} · ` : '';
            return { text: lines + count, label: 'Git changes' };
        }
        case 'git-ahead-behind': {
            const label = 'Ahead / behind upstream';
            if (!git) {
                return missingGit ? { text: missingGit, label } : undefined;
            }
            const { ahead, behind } = git;
            if (ahead === undefined || behind === undefined) {
                return isHidden(item, NO_UPSTREAM_HIDEABLE_STATE.key) ? undefined : { text: '(no upstream)', label };
            }
            if (ahead === 0 && behind === 0 && isHidden(item, 'zero', true)) {
                return undefined;
            }
            return { text: item.rawValue ? `${ahead},${behind}` : `↑${ahead} ↓${behind}`, label };
        }
        case 'git-account':
            return git ? labeled('Git', git.identity) : missingGit ? { text: missingGit, label: 'Git account' } : undefined;
        case 'thinking-effort': {
            const effort = data.effort?.level;
            const brackets = item.metadata?.brackets;
            return labeled('Thinking', effort && brackets?.length === 2 ? brackets[0] + effort + brackets[1] : effort);
        }
        case 'context-window':
            return tokens('Win', metrics.windowSize);
        case 'context-bar':
        case 'context-percentage': {
            if (metrics.usedPercentage === null) {
                return tokens('Context', metrics.contextLengthTokens);
            }
            const text = (metrics.contextLengthTokens == null ? '' : formatTokens(metrics.contextLengthTokens, format) + ' · ')
                + pct(metrics.usedPercentage);
            return { text: `Context ${text}`, label: 'Context used', percent: type === 'context-bar' ? metrics.usedPercentage : undefined };
        }
        case 'compaction-counter':
            return labeled('Compactions', codex?.compactions);
        case 'fast-mode':
            return typeof data.fast_mode === 'boolean' && (data.fast_mode || !isHidden(item, 'off'))
                ? { text: data.fast_mode ? 'Fast on' : 'Fast off', label: 'Fast Mode' } : undefined;
        case 'tokens-input':
            return tokens('In', codex?.input_tokens);
        case 'tokens-output':
            return tokens('Out', codex?.output_tokens);
        case 'tokens-total':
            return tokens('Total', codex?.total_tokens);
        case 'tokens-cached':
            return tokens('Cached', codex?.cached_input_tokens);
        case 'cache-read':
        case 'cache-write': {
            const session = isMetadataFlagEnabled(item, 'cacheScopeSession');
            const read = type === 'cache-read';
            const value = read
                ? (session ? codex?.cached_input_tokens : codex?.last_cached_input_tokens)
                : (session ? codex?.cache_write_input_tokens : codex?.last_cache_write_input_tokens);
            return value === 0 && isHidden(item, 'empty') ? undefined : tokens(read ? 'Cache read' : 'Cache write', value);
        }
        case 'session-usage':
        case 'weekly-usage': {
            const weekly = type === 'weekly-usage';
            const period = weekly ? data.rate_limits?.seven_day : data.rate_limits?.five_hour;
            if (period?.used_percentage == null) {
                return undefined;
            }
            const invert = isMetadataFlagEnabled(item, 'invert');
            const value = Math.min(100, Math.max(0, period.used_percentage));
            const name = weekly ? '7d' : '5h';
            return { text: `${name} ${pct(invert ? 100 - value : value)} ${invert ? 'left' : 'used'}`, label: `${name} account limit` };
        }
        case 'reset-timer':
        case 'weekly-reset-timer': {
            const weekly = type === 'weekly-reset-timer';
            const reset = (weekly ? data.rate_limits?.seven_day : data.rate_limits?.five_hour)?.resets_at;
            const date = new Date((reset ?? NaN) * 1000);
            const time = Number.isFinite(date.valueOf())
                ? formatUsageResetAt(date.toISOString(), true, 'local', undefined, false, weekly) : null;
            return time ? { text: `${weekly ? '7d' : '5h'} reset ${time}`, label: date.toLocaleString() } : undefined;
        }
    }
}

// CLI truecolor palette. Only validated hex values are interpolated into CSS.
const palette: Record<string, string> = {
    black: '#000000', red: '#cc0000', green: '#4e9a06', yellow: '#c4a000',
    blue: '#3465a4', magenta: '#75507b', cyan: '#06989a', white: '#d3d7cf',
    brightBlack: '#555753', brightRed: '#ef2929', brightGreen: '#8ae234', brightYellow: '#fce94f',
    brightBlue: '#729fcf', brightMagenta: '#ad7fa8', brightCyan: '#34e2e2', brightWhite: '#eeeeec'
};

function color(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }
    const hex = /^(?:hex:|#)([a-f\d]{6})$/i.exec(value)?.[1];
    const key = value.replace(/^bg([A-Z])/, (_, first: string) => first.toLowerCase());
    return hex ? '#' + hex : Object.hasOwn(palette, key) ? palette[key] : undefined;
}

function textColor(background: string): string {
    const channels = background.slice(1).match(/../g)!.map(hex => parseInt(hex, 16) / 255);
    const luminance = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * luminance[0] + 0.7152 * luminance[1] + 0.0722 * luminance[2] > 0.179 ? '#000000' : '#ffffff';
}

const escape = (value: string) => value
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

interface Cell {
    item: WidgetItem;
    value?: Segment;
    width: number;
    fixed: boolean;
    paddingStart: number;
    paddingEnd: number;
}

function segmentWidth(value?: Segment): number {
    return value ? stringWidth(value.text) + (value.percent === undefined ? 0 : 6) : 0;
}

function layoutRows(settings: Settings, data: StatusJSON, git?: GitStatus): Cell[][] {
    const padding = stringWidth(settings.defaultPadding ?? '');
    const rows = settings.lines.map(line => line.flatMap(original => {
        const item = {
            ...original,
            rawValue: settings.minimalistMode || original.rawValue,
            type: resolveLegacyWidgetType(original.type)
        };
        const empty = item.type === 'empty';
        const value = renderWidget(item, data, git, settings);
        const sample = item.reserveSpace ? renderWidget(item, preview, previewGit, settings) : undefined;
        if (!value?.text.trim() && !sample && !empty) {
            return [];
        }
        const maxWidth = item.maxWidth ?? 0;
        const fixed = !!sample || empty || maxWidth > 0;
        const width = Math.max(segmentWidth(value), sample ? Math.max(1, segmentWidth(sample)) : 0, empty ? 1 : 0);
        return [{
            item, value, fixed,
            width: maxWidth > 0 ? Math.min(width, maxWidth) : width,
            paddingStart: settings.defaultPaddingSide === 'right' ? 0 : padding,
            paddingEnd: settings.defaultPaddingSide === 'left' ? 0 : padding
        }];
    }));

    if (settings.powerline.autoAlign) {
        const alignable = rows.map(row => {
            const excluded = row.findIndex(cell => cell.item.excludeFromAutoAlign);
            return excluded === -1 ? row : row.slice(0, excluded);
        });
        const columnWidths: number[] = [];
        for (const row of alignable) {
            row.forEach((cell, column) => {
                columnWidths[column] = Math.max(columnWidths[column] ?? 0, cell.width);
            });
        }
        for (const row of alignable) {
            row.forEach((cell, column) => {
                cell.width = columnWidths[column];
                cell.fixed = true;
            });
        }
    }
    return rows;
}

export function render(css: string, source: string, settings: Settings, data: StatusJSON, git: GitStatus | undefined, recorded: boolean): string {
    const rows = layoutRows(settings, data, git).map(line => {
        const segments = line.map(({ item, value, width, fixed, paddingStart, paddingEnd }) => {
            const empty = item.type === 'empty';
            const background = settings.colorLevel === 0 ? undefined
                : color(settings.overrideBackgroundColor ?? item.backgroundColor);
            const foreground = settings.colorLevel === 0 ? undefined
                : color(settings.overrideForegroundColor ?? item.color) ?? (background ? textColor(background) : undefined);
            const style = [
                fixed && `--segment-content-width:${width}ch`,
                `--segment-pad-start:${paddingStart}ch`,
                `--segment-pad-end:${paddingEnd}ch`,
                background && `--segment-background:${background}`,
                foreground && `--segment-foreground:${foreground}`,
                (item.bold ?? settings.globalBold) && 'font-weight:600'
            ].filter(Boolean).join(';');
            const title = value ? [value.label, value.text].filter(Boolean).join(' · ') : '';
            const meter = value?.percent === undefined ? ''
                : `<progress value="${value.percent}" max="100" aria-label="Context used"></progress>`;
            const state = empty ? ' empty' : !value ? ' reserved' : '';
            const accessible = value ? ` title="${escape(title)}"` : ' aria-hidden="true"';
            return `<div class="segment${state}" data-widget="${escape(item.type)}"${accessible} style="${style}"><span>${escape(value?.text ?? '')}</span>${meter}</div>`;
        }).join('');
        return segments ? `<div class="row">${segments}</div>` : '';
    }).join('');
    const note = !data.session_id ? 'Open a Codex conversation as an editor tab to see its metrics.'
        : recorded ? 'Conversation metrics reflect the last recorded values.'
            : 'No local history metrics are available for this conversation.';
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${escape(source)} 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${escape(css)}">
<title>Powerline</title>
</head>
<body>
<main>${rows}<p class="note">${note}</p></main>
</body>
</html>`;
}
