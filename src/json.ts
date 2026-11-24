export function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function jsonRecord(line: string): Record<string, unknown> {
    try {
        return record(JSON.parse(line));
    } catch {
        return {};
    }
}

export function string(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
}

export function number(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
