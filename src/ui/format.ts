/**
 * HSL の整形: 各行を trim し、ブロックの深さに応じて 2 スペースでインデントする。
 * 字句的な整形のみで、意味は変えない（構文エラーのあるコードでも最善を尽くす）。
 */
export function formatHsl(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let depth = 0;
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') {
      out.push('');
      continue;
    }
    const code = line.split('#')[0]!.trim();
    const first = code.split(/\s+/)[0] ?? '';
    if (first === 'end' || first === 'else') depth = Math.max(0, depth - 1);
    out.push('  '.repeat(depth) + line);
    if (first === 'if' || first === 'while' || first === 'on' || first === 'else') depth++;
  }
  // 末尾の空行は 1 つに
  while (out.length > 1 && out[out.length - 1] === '' && out[out.length - 2] === '') out.pop();
  const text = out.join('\n');
  return text.endsWith('\n') ? text : text + '\n';
}
