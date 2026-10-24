export class StudioError extends Error {
  readonly code: string;
  readonly details: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'StudioError';
    this.code = code;
    this.details = details;
  }
}
export function requireCondition(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new StudioError(code, message);
}
