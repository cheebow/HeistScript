import { useEffect, useRef } from 'react';
import type { WorldState } from '../core/model/types';
import { createGame, type GameHandle } from '../game/createGame';
import type { RenderOptions } from '../game/HeistScene';

export interface GameViewProps {
  world: WorldState;
  options: RenderOptions;
  /** world は同一オブジェクトが更新されるため、tick ごとに変わる値で再描画を促す */
  version: number;
  onSelect: (id: string | null) => void;
}

/** Phaser キャンバスを保持する React コンテナ */
export function GameView({ world, options, version, onSelect }: GameViewProps) {
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
    const resize = () => handle.resize(el.clientWidth, el.clientHeight);
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
    handleRef.current?.setWorld(world, options);
  }, [world, options, version]);

  return <div ref={containerRef} className="game-view" data-testid="game-view" />;
}
