import { useEffect, useRef, useState } from 'react';
import type { WorldState } from '../core/model/types';
import { createGame, type GameHandle } from '../game/createGame';
import type { RenderOptions } from '../game/HeistScene';

export interface TileInfo {
  title: string;
  lines: string[];
}

export interface GameViewProps {
  world: WorldState;
  options: RenderOptions;
  /** world は同一オブジェクトが更新されるため、tick ごとに変わる値で再描画を促す */
  version: number;
  /** false のとき、tick が進んでも演出（フラッシュ等）を出さない（シーク中） */
  effects?: boolean;
  onSelect: (id: string | null) => void;
  /** マウス位置のタイルの説明（なければ null） */
  describeTile: (x: number, y: number) => TileInfo | null;
  /** 0 = 自動 */
  zoom: number;
  /** 実際の倍率が決まったとき */
  onZoomApplied?: (zoom: number, maxFit: number) => void;
  /** バナー表示要求（key が変わるたびに表示） */
  banner?: { key: number; text: string; color?: string } | null;
  /** 成功演出の要求（key が変わるたびに再生） */
  celebrate?: number;
  /** マップのダブルクリック（タイル座標） */
  onDoubleClickTile?: (x: number, y: number) => void;
}

/** Phaser キャンバスを保持する React コンテナ */
export function GameView({ world, options, version, effects = true, onSelect, describeTile, zoom, onZoomApplied, banner, celebrate = 0, onDoubleClickTile }: GameViewProps) {
  const dblRef = useRef(onDoubleClickTile);
  dblRef.current = onDoubleClickTile;
  const onZoomRef = useRef(onZoomApplied);
  onZoomRef.current = onZoomApplied;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const [tip, setTip] = useState<{ x: number; y: number; info: TileInfo } | null>(null);
  const describeRef = useRef(describeTile);
  describeRef.current = describeTile;
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<GameHandle | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const key = `${world.stageId}:${world.width}x${world.height}`;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handle = createGame(el, world.width, world.height, { onSelect: (id) => onSelectRef.current(id) });
    handleRef.current = handle;
    const resize = () => {
      const applied = handle.setZoom(zoomRef.current, el.clientWidth, el.clientHeight);
      onZoomRef.current?.(applied, handle.fitZoom(el.clientWidth, el.clientHeight));
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    return () => {
      ro.disconnect();
      handle.destroy();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    handleRef.current?.setWorld(world, options, effects);
  }, [world, options, version, effects]);

  useEffect(() => {
    if (banner && banner.key > 0) handleRef.current?.showBanner(banner.text, banner.color);
  }, [banner]);

  useEffect(() => {
    if (celebrate > 0) handleRef.current?.celebrate();
  }, [celebrate]);

  useEffect(() => {
    const el = containerRef.current;
    const handle = handleRef.current;
    if (!el || !handle) return;
    const applied = handle.setZoom(zoom, el.clientWidth, el.clientHeight);
    onZoomRef.current?.(applied, handle.fitZoom(el.clientWidth, el.clientHeight));
  }, [zoom]);

  const onMove = (e: React.MouseEvent) => {
    const handle = handleRef.current;
    const el = containerRef.current;
    if (!handle || !el) return;
    const tile = handle.tileAt(e.clientX, e.clientY);
    const info = tile ? describeRef.current(tile.x, tile.y) : null;
    if (!info) {
      setTip(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setTip({ x: e.clientX - rect.left + 14, y: e.clientY - rect.top + 14, info });
  };

  return (
    <div
      ref={containerRef}
      className="game-view"
      data-testid="game-view"
      onMouseMove={onMove}
      onMouseLeave={() => setTip(null)}
      onDoubleClick={(e) => {
        const tile = handleRef.current?.tileAt(e.clientX, e.clientY);
        if (tile) dblRef.current?.(tile.x, tile.y);
      }}
    >
      {tip && (
        <div className="tile-tip" style={{ left: tip.x, top: tip.y }} role="tooltip" data-testid="tile-tip">
          <div className="tile-tip-title">{tip.info.title}</div>
          {tip.info.lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
