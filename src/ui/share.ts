import type { StageDefinition } from '../core/model/stage';
import type { WorldState } from '../core/model/types';

export interface ShareInfo {
  text: string;
  url: string;
  /** X（Twitter）の投稿画面 */
  xUrl: string;
  /** Bluesky の投稿画面 */
  blueskyUrl: string;
  /** コピー用（本文 + URL） */
  full: string;
}

/** このステージへの直リンク（公開先でもローカルでも、いま開いている場所を基準にする） */
export function stageUrl(stageId: string): string {
  if (typeof location === 'undefined') return `#stage=${stageId}`;
  return `${location.origin}${location.pathname}#stage=${stageId}`;
}

/** クリア結果を SNS 向けの短い文にする。プレイヤーのコードは含めない */
export function buildShareInfo(stage: StageDefinition, index: number, world: WorldState, earned: string[]): ShareInfo {
  const s = world.stats;
  const badges: string[] = [];
  if (s.spottedCount === 0) badges.push('未発見');
  if (s.knockoutCount === 0) badges.push('誰も眠らせず');
  if (s.alarmCount === 0 && (stage.cameras.length > 0 || stage.objects.some((o) => o.type === 'laser'))) badges.push('警報ゼロ');
  const stars = stage.challenges.length > 0 ? ` ★${earned.length}/${stage.challenges.length}` : '';
  const num = index >= 0 ? `ステージ${index + 1}` : 'カスタムステージ';
  const text = `HeistScript ${num}「${stage.title}」を ${world.tick} tick でクリア！${badges.length ? `（${badges.join('・')}）` : ''}${stars}\n怪盗団にスクリプトで指令を出すステルスパズル #HeistScript`;
  const url = stageUrl(stage.id);
  return {
    text,
    url,
    xUrl: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    blueskyUrl: `https://bsky.app/intent/compose?text=${encodeURIComponent(`${text}\n${url}`)}`,
    full: `${text}\n${url}`,
  };
}
