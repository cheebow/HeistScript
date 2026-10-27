import type { EventType } from '../model/types';
import { MAIN_BLOCK, PREDICATE_NAMES, type Expr, type PredicateName, type Program, type Statement } from './ast';
import { HslSyntaxError } from './errors';
import { tokenize, type Token } from './lexer';

const KEYWORDS = new Set([
  'move', 'steal', 'hide', 'knockout', 'carry', 'drop', 'open',
  'wait', 'until', 'signal', 'resume', 'if', 'else', 'end', 'while', 'on',
  'and', 'or', 'not', 'true', 'false', 'spotted', 'alarm', ...PREDICATE_NAMES,
]);

export function isKeyword(w: string): boolean {
  return KEYWORDS.has(w);
}

class Parser {
  private pos = 0;
  readonly blocks: Statement[][] = [];
  readonly handlers: Program['handlers'] = {};
  statementCount = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos]!;
  }
  private next(): Token {
    const t = this.tokens[this.pos]!;
    if (t.type !== 'eof') this.pos++;
    return t;
  }
  private isWord(value: string): boolean {
    const t = this.peek();
    return t.type === 'word' && t.value === value;
  }
  private skipNewlines(): void {
    while (this.peek().type === 'newline') this.next();
  }
  private expectNewline(context: string): void {
    const t = this.peek();
    if (t.type === 'newline' || t.type === 'eof') {
      if (t.type === 'newline') this.next();
      return;
    }
    throw new HslSyntaxError(t.line, t.col, `${context} の後に余分な記述があります: '${t.value}'。1行に書けるのは1つの命令だけです`);
  }
  private expectIdentifier(context: string): string {
    const t = this.peek();
    if (t.type !== 'word') {
      if (t.type === 'newline' || t.type === 'eof') {
        throw new HslSyntaxError(t.line, t.col, `${context} には対象のIDが必要です（例: ${context} jewel）`);
      }
      throw new HslSyntaxError(t.line, t.col, `${context} の対象IDが不正です: '${t.value}'`);
    }
    if (KEYWORDS.has(t.value)) {
      throw new HslSyntaxError(t.line, t.col, `'${t.value}' は予約語なので ${context} の対象には使えません`);
    }
    this.next();
    return t.value;
  }
  private newBlock(): number {
    this.blocks.push([]);
    return this.blocks.length - 1;
  }

  parseProgram(): Program {
    const main = this.newBlock();
    if (main !== MAIN_BLOCK) throw new Error('internal: main block id');
    while (true) {
      this.skipNewlines();
      const t = this.peek();
      if (t.type === 'eof') break;
      if (t.type === 'word' && t.value === 'on') {
        this.parseHandler();
        continue;
      }
      const stmt = this.parseStatement(false);
      this.blocks[main]!.push(stmt);
    }
    return { blocks: this.blocks, handlers: this.handlers, statementCount: this.statementCount };
  }

  private parseHandler(): void {
    const onTok = this.next();
    const nameTok = this.peek();
    if (nameTok.type !== 'word' || (nameTok.value !== 'spotted' && nameTok.value !== 'alarm')) {
      throw new HslSyntaxError(
        nameTok.line,
        nameTok.col,
        `on の後にはイベント名 spotted または alarm が必要です${nameTok.type === 'word' ? `: '${nameTok.value}'` : ''}`,
      );
    }
    this.next();
    const event = nameTok.value as EventType;
    this.expectNewline(`on ${event}`);
    if (this.handlers[event]) {
      throw new HslSyntaxError(onTok.line, onTok.col, `on ${event} は1つのスクリプトに1つだけ定義できます（${this.handlers[event]!.line}行目で定義済み）`);
    }
    const blockId = this.newBlock();
    this.parseBlock(blockId, ['end'], true, `on ${event}`, onTok);
    this.next(); // end
    this.expectNewline('end');
    this.handlers[event] = { event, blockId, line: onTok.line };
  }

  /** 終端語（end / else）が現れるまで文を読み、終端語の手前で止まる */
  private parseBlock(blockId: number, terminators: string[], inHandler: boolean, opener: string, openTok: Token): string {
    while (true) {
      this.skipNewlines();
      const t = this.peek();
      if (t.type === 'eof') {
        throw new HslSyntaxError(openTok.line, openTok.col, `${opener} に対応する end がありません。ブロックの最後の行に end を書いてください`);
      }
      if (t.type === 'word' && terminators.includes(t.value)) return t.value;
      if (t.type === 'word' && t.value === 'on') {
        throw new HslSyntaxError(t.line, t.col, 'on はブロックの外（トップレベル）でのみ定義できます');
      }
      this.blocks[blockId]!.push(this.parseStatement(inHandler));
    }
  }

  private parseStatement(inHandler: boolean): Statement {
    const t = this.peek();
    if (t.type !== 'word') {
      throw new HslSyntaxError(t.line, t.col, `命令が必要です: '${t.value}'`);
    }
    this.statementCount++;
    const { line, col } = t;
    switch (t.value) {
      case 'move':
      case 'steal':
      case 'knockout':
      case 'carry':
      case 'open': {
        this.next();
        const target = this.expectIdentifier(t.value);
        this.expectNewline(`${t.value} ${target}`);
        return { kind: 'action', command: t.value, target, line, col };
      }
      case 'hide':
      case 'drop': {
        this.next();
        this.expectNewline(t.value);
        return { kind: 'action', command: t.value, target: null, line, col };
      }
      case 'wait': {
        this.next();
        if (this.isWord('until')) {
          this.next();
          const cond = this.parseExpr();
          this.expectNewline('wait until の条件');
          return { kind: 'waitUntil', cond, line, col };
        }
        const n = this.peek();
        if (n.type !== 'int') {
          throw new HslSyntaxError(n.line, n.col, 'wait の後には 0 以上の整数 または until 条件 が必要です（例: wait 5 / wait until guard_away）');
        }
        this.next();
        this.expectNewline(`wait ${n.value}`);
        return { kind: 'wait', ticks: Number(n.value), line, col };
      }
      case 'signal': {
        this.next();
        const name = this.expectIdentifier('signal');
        this.expectNewline(`signal ${name}`);
        return { kind: 'signal', name, line, col };
      }
      case 'resume': {
        this.next();
        this.expectNewline('resume');
        if (!inHandler) {
          throw new HslSyntaxError(line, col, 'resume はイベントハンドラ（on spotted / on alarm）の中でのみ使えます');
        }
        return { kind: 'resume', line, col };
      }
      case 'if': {
        this.next();
        const cond = this.parseExpr();
        this.expectNewline('if の条件');
        const thenBlock = this.newBlock();
        const term = this.parseBlock(thenBlock, ['else', 'end'], inHandler, 'if', t);
        let elseBlock: number | null = null;
        if (term === 'else') {
          this.next();
          this.expectNewline('else');
          elseBlock = this.newBlock();
          this.parseBlock(elseBlock, ['end'], inHandler, 'else', t);
        }
        this.next(); // end
        this.expectNewline('end');
        return { kind: 'if', cond, thenBlock, elseBlock, line, col };
      }
      case 'while': {
        this.next();
        const cond = this.parseExpr();
        this.expectNewline('while の条件');
        const body = this.newBlock();
        this.parseBlock(body, ['end'], inHandler, 'while', t);
        this.next();
        this.expectNewline('end');
        return { kind: 'while', cond, body, line, col };
      }
      case 'end':
        throw new HslSyntaxError(line, col, '対応する if / while / on がない end です');
      case 'else':
        throw new HslSyntaxError(line, col, '対応する if がない else です');
      case 'until':
        throw new HslSyntaxError(line, col, 'until は wait until の形で使います');
      case 'on':
        throw new HslSyntaxError(line, col, 'on はトップレベルでのみ定義できます');
      default:
        if (PREDICATE_NAMES.includes(t.value as PredicateName) || ['and', 'or', 'not', 'true', 'false'].includes(t.value)) {
          throw new HslSyntaxError(line, col, `'${t.value}' は条件式なので単独では使えません（if や wait until と組み合わせます）`);
        }
        throw new HslSyntaxError(line, col, `不明な命令です: '${t.value}'。使える命令は move / steal / wait / hide / knockout / carry / drop / open / signal / if / while / on です（小文字で書きます）`);
    }
  }

  private parseExpr(): Expr {
    return this.parseOr();
  }
  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.isWord('or')) {
      const t = this.next();
      const right = this.parseAnd();
      left = { kind: 'or', left, right, line: t.line, col: t.col };
    }
    return left;
  }
  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.isWord('and')) {
      const t = this.next();
      const right = this.parseNot();
      left = { kind: 'and', left, right, line: t.line, col: t.col };
    }
    return left;
  }
  private parseNot(): Expr {
    if (this.isWord('not')) {
      const t = this.next();
      const expr = this.parseNot();
      return { kind: 'not', expr, line: t.line, col: t.col };
    }
    return this.parsePrimary();
  }
  private parsePrimary(): Expr {
    const t = this.peek();
    if (t.type === 'lparen') {
      this.next();
      const e = this.parseExpr();
      const close = this.peek();
      if (close.type !== 'rparen') throw new HslSyntaxError(close.line, close.col, "')' が必要です");
      this.next();
      return e;
    }
    if (t.type === 'word') {
      if (t.value === 'true' || t.value === 'false') {
        this.next();
        return { kind: 'bool', value: t.value === 'true', line: t.line, col: t.col };
      }
      if (t.value === 'signal_received') {
        this.next();
        const lp = this.peek();
        if (lp.type !== 'lparen') throw new HslSyntaxError(lp.line, lp.col, 'signal_received にはカッコでシグナル名を指定します（例: signal_received(ready)）');
        this.next();
        const arg = this.expectIdentifier('signal_received');
        const rp = this.peek();
        if (rp.type !== 'rparen') throw new HslSyntaxError(rp.line, rp.col, "signal_received(...) の ')' が必要です");
        this.next();
        return { kind: 'pred', name: 'signal_received', arg, line: t.line, col: t.col };
      }
      if (PREDICATE_NAMES.includes(t.value as PredicateName)) {
        this.next();
        if (this.peek().type === 'lparen') {
          throw new HslSyntaxError(t.line, t.col, `${t.value} は引数を取りません`);
        }
        return { kind: 'pred', name: t.value as PredicateName, arg: null, line: t.line, col: t.col };
      }
      throw new HslSyntaxError(
        t.line,
        t.col,
        `条件式に使えない語です: '${t.value}'（使用可能: ${PREDICATE_NAMES.join(', ')}, true, false）`,
      );
    }
    if (t.type === 'newline' || t.type === 'eof') {
      throw new HslSyntaxError(t.line, t.col, '条件式が必要です');
    }
    throw new HslSyntaxError(t.line, t.col, `条件式が不正です: '${t.value}'`);
  }
}

/** ソースを解析して Program を返す。構文エラーは HslSyntaxError を投げる。 */
export function parse(source: string): Program {
  const tokens = tokenize(source);
  return new Parser(tokens).parseProgram();
}
