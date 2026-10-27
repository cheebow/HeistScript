import { expect, test, type Page } from '@playwright/test';

type TestHook = { setScript: (s: string, thiefId?: string) => void; getScript: (thiefId?: string) => string };
async function waitHook(page: Page) {
  await page.waitForFunction(() => !!(window as unknown as { __heistTest?: unknown }).__heistTest);
}
async function setScript(page: Page, thiefId: string, text: string) {
  await page.evaluate(([t, s]) => (window as unknown as { __heistTest: TestHook }).__heistTest.setScript(s!, t), [thiefId, text]);
}

test.describe('Phase 12 仕上げ', () => {
  test('初回起動: タイトル → ステージ選択 → ブリーフィング → Stage 1 クリア → 次のステージ', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('title-screen')).toBeVisible();
    await expect(page.getByTestId('title-continue')).toHaveCount(0); // 初回は「つづきから」なし
    await page.getByTestId('title-start').click();
    await expect(page.getByTestId('stage-select-screen')).toBeVisible();
    await page.getByTestId('stage-card-stage_01').click();
    await expect(page.getByTestId('briefing')).toBeVisible();
    await expect(page.getByTestId('briefing')).toContainText('はじめての盗み');
    await expect(page.getByTestId('briefing')).toContainText('怪盗A');
    await page.getByTestId('briefing-start').click();
    await expect(page.getByTestId('briefing')).toBeHidden();
    await waitHook(page);
    await setScript(page, 'thief_a', 'move jewel\nsteal jewel\nmove exit\n');
    await page.getByRole('button', { name: 'x4' }).click();
    await page.getByTestId('btn-play').click();
    await expect(page.getByTestId('result-dialog')).toContainText('ミッション成功', { timeout: 30_000 });
    await page.getByTestId('result-next').click();
    await expect(page.getByTestId('briefing')).toContainText('巡回警備員');
    await page.getByTestId('briefing-start').click();
    // 戻るとステージ選択にクリア済みが反映
    await page.getByTestId('btn-to-select').click();
    await expect(page.getByTestId('stage-card-stage_01')).toContainText('済');
    // タイトルに戻ると「つづきから」が出る
    await page.getByRole('button', { name: '← タイトル' }).click();
    await expect(page.getByTestId('title-continue')).toBeVisible();
  });

  test('キーボード操作: Space 実行/一時停止、N 1コマ、R 最初に戻す、Esc で閉じる', async ({ page }) => {
    await page.goto('/#play');
    await waitHook(page);
    await setScript(page, 'thief_a', 'move jewel\nsteal jewel\nmove exit\n');
    await page.locator('.game-view').click({ position: { x: 5, y: 5 } }); // エディタ外にフォーカス
    await page.keyboard.press('n');
    await expect(page.getByTestId('tick-label')).toHaveText('tick 1/1');
    await page.keyboard.press('n');
    await expect(page.getByTestId('tick-label')).toHaveText('tick 2/2');
    await page.keyboard.press(' ');
    await expect(page.getByTestId('run-status')).toContainText('実行中');
    await page.keyboard.press(' ');
    await expect(page.getByTestId('run-status')).toContainText('一時停止');
    await page.keyboard.press('r');
    await expect(page.getByTestId('tick-label')).toHaveText('tick 0/0');
    await page.getByTestId('btn-briefing').click();
    await expect(page.getByTestId('briefing')).toBeVisible();
    await page.getByTestId('briefing-start').click();
    await expect(page.getByTestId('btn-stage-io')).toHaveCount(0); // 読込/書出はエディタ実装まで無効
  });

  test('#stage= で直接ステージを開ける', async ({ page }) => {
    await page.goto('/#stage=stage_05');
    await waitHook(page);
    await expect(page.locator('.game-header h1')).toHaveText('二人の怪盗');
  });
});
