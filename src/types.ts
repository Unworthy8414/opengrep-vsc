export interface OpenGrepFinding {
    check_id: string;
    path: string;
    start: {
        line: number;
        col: number;
    };
    end: {
        line: number;
        col: number;
    };
    extra: {
        message: string;
        severity: 'INFO' | 'WARNING' | 'ERROR';
        metadata?: Record<string, unknown>;
        lines?: string;
    };
}

export interface OpenGrepResult {
    results: OpenGrepFinding[];
    errors: unknown[];
    version: string;
}