import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type TestHook = { setScript: (s: string, thiefId?: string) => void; getScript: (thiefId?: string) => string };

async function waitHook(page: Page) {
  await page.waitForFunction(() => !!(window as unknown as { __heistTest?: unknown }).__heistTest);
}
async function setScript(page: Page, thiefId: string, text: string) {
  await page.evaluate(([t, s]) => (window as unknown as { __heistTest: TestHook }).__heistTest.setScript(s!, t), [thiefId, text]);
}
function solution(stageId: string): Record<string, string> {
  return JSON.parse(readFileSync(`stages/${stageId}.json`, 'utf8')).solution;
}
function stageDef(stageId: string): { width: number; height: number; thieves: { id: string; x: number; y: number }[] } {
  return JSON.parse(readFileSync(`stages/${stageId}.json`, 'utf8'));
}

for (const [w, h] of [
  [1280, 720],
  [1920, 1080],
] as const) {
  test.describe(`ウィンドウ ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h } });
    for (const stageId of ['stage_01', 'stage_05']) {
      test(`${stageId}: マップが領域内に収まり、怪盗をクリックすると選択される`, async ({ page }) => {
        await page.goto('/#play');
        await waitHook(page);
        await page.getByTestId('stage-select').selectOption(stageId);
        await page.waitForTimeout(300);
        const view = page.locator('.game-view');
        const canvas = page.locator('.game-view canvas');
        await expect(canvas).toBeVisible();
        const vb = (await view.boundingBox())!;
        let cb = (await canvas.boundingBox())!;
        if (cb.height > vb.height + 1) {
          // 低い画面では下部パネルを最小化すれば収まる
          await page.getByRole('button', { name: '最小化' }).click();
          await page.waitForTimeout(300);
          cb = (await canvas.boundingBox())!;
          const vb2 = (await view.boundingBox())!;
          expect(cb.height).toBeLessThanOrEqual(vb2.height + 1);
          expect(cb.width).toBeLessThanOrEqual(vb2.width + 1);
        } else {
          expect(cb.width).toBeLessThanOrEqual(vb.width + 1);
        }
        // 倍率は整数
        const def = stageDef(stageId);
        const zoom = cb.width / (def.width * 32);
        expect(Math.abs(zoom - Math.round(zoom))).toBeLessThan(0.01);
        expect(Math.round(zoom)).toBeGreaterThanOrEqual(1);
        // 2人目の怪盗（いれば）をクリック → 選択とエディタタブが切り替わる
        const thief = def.thieves[def.thieves.length - 1]!;
        const scale = cb.width / (def.width * 32);
        await page.mouse.click(cb.x + (thief.x + 0.5) * 32 * scale, cb.y + (thief.y + 0.5) * 32 * scale);
        await expect(page.locator('.editor-panel .tabs button[role=tab].active')).toContainText(thief.id);
        if (await page.getByTestId('bottom-restore').count()) await page.getByTestId('bottom-restore').click();
        await expect(page.getByTestId('thief-info')).toContainText(thief.id);
      });
    }
  });
}

test.describe('Phase 8 操作', () => {
  test('オーバーレイを切り替えても結果と tick は変わらない', async ({ page }) => {
    await page.goto('/#play');
    await waitHook(page);
    await page.getByTestId('stage-select').selectOption('stage_02');
    for (const [tid, src] of Object.entries(solution('stage_02'))) await setScript(page, tid, src);
    await page.getByRole('button', { name: 'x4' }).click();
    await page.getByTestId('btn-play').click();
    await page.waitForTimeout(300);
    await page.locator('.menu summary').click();
    await page.getByTestId('toggle-guard-vision').uncheck();
    await page.getByTestId('toggle-camera-vision').uncheck();
    await page.getByTestId('toggle-paths').uncheck();
    await page.getByTestId('zoom-select').selectOption('1');
    await expect(page.getByTestId('result-dialog')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId('result-dialog')).toContainText('ミッション成功');
    await expect(page.getByTestId('result-dialog')).toContainText('92'); // 経過 tick は CLI と同じ
  });

  test('失敗画面から原因の直前へ移動でき、ログ行クリックでシークできる', async ({ page }) => {
    await page.goto('/#play');
    await waitHook(page);
    await page.getByTestId('stage-select').selectOption('stage_02');
    await setScript(page, 'thief_a', 'move jewel\nsteal jewel\nmove exit\n');
    await page.getByRole('button', { name: 'x4' }).click();
    await page.getByTestId('btn-play').click();
    await expect(page.getByTestId('result-dialog')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId('result-dialog')).toContainText('発生 tick: 19');
    await page.getByTestId('result-jump').click();
    await expect(page.getByTestId('tick-label')).toHaveText('tick 14/19');
    await expect(page.getByTestId('run-status')).toContainText('過去');
    await page.getByRole('button', { name: '重要' }).click();
    await page.locator('.log-list li', { hasText: 'SPOTTED' }).first().click();
    await expect(page.getByTestId('tick-label')).toHaveText('tick 18/19');
  });

  test('下部パネルの最小化と復元、演出を減らす設定の保存', async ({ page }) => {
    await page.goto('/#play');
    await waitHook(page);
    await page.getByRole('button', { name: '最小化' }).click();
    await expect(page.getByTestId('bottom-restore')).toBeVisible();
    await page.getByTestId('bottom-restore').click();
    await expect(page.getByTestId('log-list')).toBeVisible();
    await page.locator('.menu summary').click();
    await page.getByTestId('toggle-reduced-motion').check();
    await expect.poll(async () => page.evaluate(() => localStorage.getItem('heistscript.save') ?? '')).toContain('"reducedMotion":true');
    await page.reload();
    await waitHook(page);
    await page.locator('.menu summary').click();
    await expect(page.getByTestId('toggle-reduced-motion')).toBeChecked();
  });
});
