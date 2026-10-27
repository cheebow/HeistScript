export type HslErrorKind = 'syntax' | 'semantic';

export interface HslError {
  kind: HslErrorKind;
  line: number;
  col: number;
  message: string;
}

export class HslSyntaxError extends Error {
  readonly line: number;
  readonly col: number;
  constructor(line: number, col: number, message: string) {
    super(message);
    this.name = 'HslSyntaxError';
    this.line = line;
    this.col = col;
  }
  toError(): HslError {
    return { kind: 'syntax', line: this.line, col: this.col, message: this.message };
  }
}

export function formatHslError(e: HslError): string {
  return `${e.line}行目 ${e.col}列: ${e.message}`;
}
