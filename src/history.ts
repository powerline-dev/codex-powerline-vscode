import { createReadStream, type Stats } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { Decompress } from 'fzstd';
import { StatusJSONSchema, type StatusJSON } from '@powerline-dev/codex-powerline-core';
import { jsonRecord, number, record, string } from './json';

type Patch = Partial<StatusJSON>;
type SessionFields = NonNullable<StatusJSON['codex']>;

interface Rollout {
    status: StatusJSON;
    offset: number;
    stamp: Stats;
    filename: string;
}

export function codexHome(): string {
    return path.resolve(process.env.CODEX_HOME || path.join(homedir(), '.codex'));
}

async function findRollout(directory: string, id: string): Promise<string | undefined> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
        if (entry.isFile() && entry.name.startsWith('rollout-')
            && (entry.name.endsWith(`-${id}.jsonl`) || entry.name.endsWith(`-${id}.jsonl.zst`))) {
            return path.join(directory, entry.name);
        }
    }
    const subdirectories = entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort().reverse();
    for (const name of subdirectories) {
        const found = await findRollout(path.join(directory, name), id);
        if (found) {
            return found;
        }
    }
    return undefined;
}

// Keep the offset at the last newline. An app server may be in the middle of appending a record.
async function scanLines(
    filename: string,
    size: number,
    offset: number,
    onLine: (line: string) => void
): Promise<number> {
    if (size <= offset) {
        return offset;
    }
    const decoder = new StringDecoder();
    let pending = '';
    const consume = (data: Uint8Array) => {
        const text = pending + decoder.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
        let start = 0;
        for (let end = text.indexOf('\n'); end !== -1; end = text.indexOf('\n', start)) {
            onLine(text.slice(start, end));
            start = end + 1;
        }
        if (start) {
            offset += Buffer.byteLength(text.slice(0, start));
        }
        pending = text.slice(start);
    };
    const compressed = filename.endsWith('.zst');
    const decompressor = compressed ? new Decompress(consume) : undefined;
    for await (const chunk of createReadStream(filename, { start: offset, end: size - 1 })) {
        if (decompressor) {
            decompressor.push(chunk);
        } else {
            consume(chunk);
        }
    }
    decompressor?.push(new Uint8Array(), true);
    return offset;
}

function matchingFile(a: Stats, b: Stats): boolean {
    return a.dev === b.dev && a.ino === b.ino && a.birthtimeMs === b.birthtimeMs;
}

function unchanged(a: Stats, b: Stats): boolean {
    return matchingFile(a, b) && a.size === b.size && a.mtimeMs === b.mtimeMs;
}

function turnPatch(p: Record<string, unknown>): Patch {
    const tier = p.service_tier;
    const fast = tier === 'priority' || tier === 'fast' ? true
        : tier === 'default' || tier === 'standard' || tier === 'flex' || tier === null ? false : undefined;
    const approvalPolicy = string(p.approval_policy) ?? ('granular' in record(p.approval_policy) ? 'granular' : undefined);
    const settings = record(record(p.collaboration_mode).settings);
    const effort = string(p.effort) ?? string(settings.reasoning_effort);
    return {
        cwd: string(p.cwd),
        model: string(p.model) ?? string(settings.model),
        effort: effort ? { level: effort } : undefined,
        fast_mode: fast,
        codex: {
            permission_profile: string(record(p.active_permission_profile).id) ?? string(p.active_permission_profile),
            sandbox: string(record(p.sandbox_policy).type) ?? string(p.sandbox_policy),
            approval_policy: approvalPolicy,
            approvals_reviewer: string(p.approvals_reviewer)
        }
    };
}

function tokenPatch(info: Record<string, unknown>): Patch {
    const total = record(info.total_token_usage);
    const last = record(info.last_token_usage);
    const input = number(last.input_tokens);
    const output = number(last.output_tokens);
    const current = number(last.total_tokens) ?? (input !== undefined && output !== undefined ? input + output : undefined);
    // Codex reports cached tokens within input_tokens. The last total is the usage shown by Codex.
    return {
        codex: {
            total_tokens: number(total.total_tokens),
            input_tokens: number(total.input_tokens),
            output_tokens: number(total.output_tokens),
            cached_input_tokens: number(total.cached_input_tokens),
            cache_write_input_tokens: number(total.cache_write_input_tokens),
            last_input_tokens: input,
            last_cached_input_tokens: number(last.cached_input_tokens),
            last_cache_write_input_tokens: number(last.cache_write_input_tokens)
        },
        context_window: {
            context_window_size: number(info.model_context_window),
            current_usage: current,
            total_input_tokens: number(total.input_tokens),
            total_output_tokens: number(total.output_tokens)
        }
    };
}

function merge<T extends object>(base: T, patch: Partial<T> | undefined | null): T {
    return { ...base, ...Object.fromEntries(Object.entries(patch ?? {}).filter(([, value]) => value !== undefined)) };
}

function applyRecord(data: StatusJSON, line: string, id: string): StatusJSON {
    // Most rollout lines are conversation content. Parse only records with supported metrics.
    if (!/"(?:session_meta|turn_context|token_count|thread_name_updated|task_started|task_complete|turn_aborted|compacted)"/.test(line)) {
        return data;
    }
    const { type, payload } = jsonRecord(line);
    const p = record(payload);
    if (type === 'session_meta' && p.id === id) {
        return {
            ...data,
            session_id: id,
            cwd: string(p.cwd) ?? data.cwd,
            context_window: merge(data.context_window ?? {}, { context_window_size: number(p.context_window) })
        };
    }
    if (data.session_id !== id) {
        return data;
    }
    let patch: Patch = {};
    if (type === 'turn_context') {
        patch = turnPatch(p);
    } else if (type === 'compacted') {
        patch.codex = { compactions: (data.codex?.compactions ?? 0) + 1 };
    } else if (type === 'event_msg') {
        switch (p.type) {
            case 'task_started':
                patch.chat_status = 'running';
                patch.context_window = { context_window_size: number(p.model_context_window) };
                break;
            case 'task_complete':
                patch.chat_status = p.error == null ? 'completed' : 'failed';
                break;
            case 'turn_aborted':
                patch.chat_status = 'interrupted';
                break;
            case 'thread_name_updated':
                if (p.thread_id === id) {
                    patch.codex = { session_name: string(p.thread_name) };
                }
                break;
            case 'token_count':
                if (p.info) {
                    patch = tokenPatch(record(p.info));
                }
                break;
        }
    }
    return {
        ...merge(data, patch),
        codex: merge<SessionFields>(data.codex ?? {}, patch.codex),
        context_window: merge(data.context_window ?? {}, patch.context_window)
    };
}

class SessionIndex {
    private titles = new Map<string, string>();
    private position?: { stamp: Stats; offset: number };

    constructor(private readonly filename: string) {}

    private async refresh(): Promise<void> {
        const stamp = await stat(this.filename).catch(() => undefined);
        if (!stamp?.isFile()) {
            this.titles.clear();
            this.position = undefined;
            return;
        }
        const previous = this.position;
        if (!previous || !unchanged(stamp, previous.stamp)) {
            const appended = previous && matchingFile(stamp, previous.stamp) && stamp.size > previous.stamp.size;
            const titles = appended ? new Map(this.titles) : new Map<string, string>();
            const offset = await scanLines(this.filename, stamp.size, appended ? previous.offset : 0, line => {
                const row = jsonRecord(line);
                if (typeof row.id === 'string' && typeof row.thread_name === 'string') {
                    titles.delete(row.id);
                    titles.set(row.id, row.thread_name);
                }
            });
            this.position = { stamp, offset };
            this.titles = titles;
        }
    }

    async title(id: string): Promise<string | undefined> {
        await this.refresh();
        return this.titles.get(id);
    }

    async list(): Promise<Array<{ id: string; title: string }>> {
        await this.refresh();
        return [...this.titles].reverse().map(([id, title]) => ({ id, title }));
    }
}

export class CodexHistory {
    private readonly index: SessionIndex;
    private readonly rollouts = new Map<string, Rollout>();

    constructor(private readonly home = codexHome()) {
        this.index = new SessionIndex(path.join(home, 'session_index.jsonl'));
    }

    listConversations(): Promise<Array<{ id: string; title: string }>> {
        return this.index.list().catch(() => []);
    }

    private async readRollout(id: string): Promise<StatusJSON | undefined> {
        const previous = this.rollouts.get(id);
        let filename = previous?.filename;
        let stamp = filename ? await stat(filename).catch(() => undefined) : undefined;
        if (!stamp?.isFile()) {
            filename = await findRollout(path.join(this.home, 'sessions'), id)
                ?? await findRollout(path.join(this.home, 'archived_sessions'), id);
            stamp = filename ? await stat(filename).catch(() => undefined) : undefined;
        }
        if (!filename || !stamp?.isFile()) {
            this.rollouts.delete(id);
            return undefined;
        }
        if (previous?.filename === filename && unchanged(stamp, previous.stamp)) {
            return previous.status;
        }
        const appended = previous?.filename === filename && !filename.endsWith('.zst')
            && matchingFile(stamp, previous.stamp) && stamp.size > previous.stamp.size;
        let status = appended ? previous.status : {};
        const offset = await scanLines(filename, stamp.size, appended ? previous.offset : 0, line => {
            status = applyRecord(status, line, id);
        });
        if (status.session_id !== id) {
            return undefined;
        }
        this.rollouts.delete(id);
        this.rollouts.set(id, { status, offset, stamp, filename });
        if (this.rollouts.size > 8) {
            const oldest = this.rollouts.keys().next();
            if (!oldest.done) {
                this.rollouts.delete(oldest.value);
            }
        }
        return status;
    }

    async read(id: string): Promise<{ status: StatusJSON; recorded: boolean }> {
        const [rollout, title] = await Promise.all([
            this.readRollout(id).catch(() => undefined),
            this.index.title(id).catch(() => undefined)
        ]);
        const status = StatusJSONSchema.parse({
            ...rollout,
            session_id: id,
            codex: { ...rollout?.codex, session_name: title ?? rollout?.codex?.session_name }
        });
        return { status, recorded: !!rollout || !!title };
    }
}
