import { HslSyntaxError } from './errors';

export type TokenType = 'word' | 'int' | 'lparen' | 'rparen' | 'newline' | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

const WORD_START = /[A-Za-z_]/;
const WORD_CHAR = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;

/**
 * HSL 字句解析器。改行は文の区切りとして意味を持つので token にする。
 * `#` から行末まではコメント。
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let col = 1;
  let i = 0;
  const n = source.length;

  while (i < n) {
    const c = source[i]!;
    if (c === '\r') {
      i++;
      col++;
      continue;
    }
    if (c === '\n') {
      tokens.push({ type: 'newline', value: '\n', line, col });
      i++;
      line++;
      col = 1;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '　') {
      i++;
      col++;
      continue;
    }
    if (c === '#') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    if (c === '(') {
      tokens.push({ type: 'lparen', value: '(', line, col });
      i++;
      col++;
      continue;
    }
    if (c === ')') {
      tokens.push({ type: 'rparen', value: ')', line, col });
      i++;
      col++;
      continue;
    }
    if (DIGIT.test(c)) {
      const start = i;
      const startCol = col;
      while (i < n && DIGIT.test(source[i]!)) {
        i++;
        col++;
      }
      if (i < n && WORD_START.test(source[i]!)) {
        throw new HslSyntaxError(line, startCol, `数値の直後に文字が続いています: '${source.slice(start, i + 1)}'`);
      }
      tokens.push({ type: 'int', value: source.slice(start, i), line, col: startCol });
      continue;
    }
    if (WORD_START.test(c)) {
      const start = i;
      const startCol = col;
      while (i < n && WORD_CHAR.test(source[i]!)) {
        i++;
        col++;
      }
      tokens.push({ type: 'word', value: source.slice(start, i), line, col: startCol });
      continue;
    }
    throw new HslSyntaxError(line, col, `使用できない文字です: '${c}'`);
  }
  tokens.push({ type: 'newline', value: '\n', line, col });
  tokens.push({ type: 'eof', value: '', line, col });
  return tokens;
}
