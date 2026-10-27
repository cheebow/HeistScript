import { useEffect, useRef } from 'react';
import type { HslError } from '../core/hsl/errors';
import { HSL_LANGUAGE, monaco, registerHslLanguage } from './monaco/setup';

export interface EditorProps {
  thiefId: string;
  value: string;
  onChange: (value: string) => void;
  errors: HslError[];
  /** 実行中の行（ハイライト） */
  activeLine: number | null;
  breakpoints: Set<number>;
  onToggleBreakpoint: (line: number) => void;
  readOnly: boolean;
}

/** Monaco ラッパー。怪盗ごとにモデルを保持する。 */
export function Editor({ thiefId, value, onChange, errors, activeLine, breakpoints, onToggleBreakpoint, readOnly }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const onChangeRef = useRef(onChange);
  const toggleRef = useRef(onToggleBreakpoint);
  onChangeRef.current = onChange;
  toggleRef.current = onToggleBreakpoint;

  useEffect(() => {
    registerHslLanguage();
    const el = containerRef.current;
    if (!el) return;
    const editor = monaco.editor.create(el, {
      value,
      language: HSL_LANGUAGE,
      theme: 'heist-dark',
      fontSize: 15,
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      lineNumbers: 'on',
      glyphMargin: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      insertSpaces: true,
      wordBasedSuggestions: 'off',
      renderLineHighlight: 'line',
      ariaLabel: 'HSL スクリプトエディタ',
    });
    editorRef.current = editor;
    decorationsRef.current = editor.createDecorationsCollection([]);
    const sub = editor.onDidChangeModelContent(() => onChangeRef.current(editor.getValue()));
    const mouse = editor.onMouseDown((e) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && e.target.position) {
        toggleRef.current(e.target.position.lineNumber);
      }
    });
    return () => {
      sub.dispose();
      mouse.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thiefId]);

  // 外部からの値更新（スクリプト初期化など）
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== value) editor.setValue(value);
  }, [value]);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  // エラーマーカー
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      'hsl',
      errors.map((e) => ({
        severity: monaco.MarkerSeverity.Error,
        message: e.message,
        startLineNumber: e.line,
        startColumn: e.col,
        endLineNumber: e.line,
        endColumn: Math.max(e.col + 1, model.getLineMaxColumn(Math.min(e.line, model.getLineCount()))),
      })),
    );
  }, [errors, value]);

  // 実行行・ブレークポイントの装飾
  useEffect(() => {
    const dec = decorationsRef.current;
    if (!dec) return;
    const list: monaco.editor.IModelDeltaDecoration[] = [];
    if (activeLine && activeLine > 0) {
      list.push({
        range: new monaco.Range(activeLine, 1, activeLine, 1),
        options: { isWholeLine: true, className: 'hsl-active-line', glyphMarginClassName: 'hsl-active-glyph' },
      });
    }
    for (const line of breakpoints) {
      list.push({ range: new monaco.Range(line, 1, line, 1), options: { glyphMarginClassName: 'hsl-breakpoint', glyphMarginHoverMessage: { value: 'ブレークポイント（この行の実行前に停止）' } } });
    }
    dec.set(list);
    if (activeLine && activeLine > 0) editorRef.current?.revealLineInCenterIfOutsideViewport(activeLine);
  }, [activeLine, breakpoints]);

  return <div ref={containerRef} className="editor" data-testid={`editor-${thiefId}`} />;
}
