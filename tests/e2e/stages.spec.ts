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

test.describe('ステージ2〜5', () => {
  for (const stageId of ['stage_02', 'stage_03', 'stage_04', 'stage_05']) {
    test(`${stageId}: サンプル解答で UI 上クリアできる`, async ({ page }) => {
      await page.goto('/#play');
      await waitHook(page);
      await page.getByTestId('stage-select').selectOption(stageId);
      for (const [tid, src] of Object.entries(solution(stageId))) await setScript(page, tid, src);
      await page.getByRole('button', { name: 'x4' }).click();
      await page.getByTestId('btn-play').click();
      await expect(page.getByTestId('result-dialog')).toBeVisible({ timeout: 40_000 });
      await expect(page.getByTestId('result-dialog')).toContainText('ミッション成功');
    });
  }

  test('stage_02: 無策だと捕まり、失敗画面に理由が出る', async ({ page }) => {
    await page.goto('/#play');
    await waitHook(page);
    await page.getByTestId('stage-select').selectOption('stage_02');
    await setScript(page, 'thief_a', 'move jewel\nsteal jewel\nmove exit\n');
    await page.getByRole('button', { name: 'x4' }).click();
    await page.getByTestId('btn-play').click();
    await expect(page.getByTestId('result-dialog')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId('result-dialog')).toContainText('ミッション失敗');
    await expect(page.getByTestId('result-reason')).toContainText('逮捕');
  });

  test('ヒントの最終段階はサンプルコードをエディタに入れられる', async ({ page }) => {
    await page.goto('/#play');
    await waitHook(page);
    await page.getByTestId('stage-select').selectOption('stage_05');
    await page.getByTestId('hint-next').click();
    await page.getByTestId('hint-next').click();
    await page.getByTestId('hint-next').click();
    await page.getByRole('button', { name: 'このコードをエディタに入れる' }).click();
    await expect
      .poll(async () => page.evaluate(() => (window as unknown as { __heistTest: TestHook }).__heistTest.getScript('thief_b')))
      .toContain('on spotted');
    await page.getByRole('button', { name: 'x4' }).click();
    await page.getByTestId('btn-play').click();
    await expect(page.getByTestId('result-dialog')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId('result-dialog')).toContainText('ミッション成功');
  });

  test('ブレークポイントで実行前に停止する', async ({ page }) => {
    await page.goto('/#play');
    await waitHook(page);
    await setScript(page, 'thief_a', 'move jewel\nsteal jewel\nmove exit\n');
    // 2行目のグリフマージンをクリックしてブレークポイント設定
    const margin = page.locator('.editor .monaco-editor .margin-view-overlays .line-numbers').nth(1);
    const box = await margin.boundingBox();
    await page.mouse.click(box!.x - 14, box!.y + box!.height / 2);
    await page.getByRole('button', { name: 'x4' }).click();
    await page.getByTestId('btn-play').click();
    await expect(page.locator('.notice')).toContainText('2 行目', { timeout: 20_000 });
    await expect(page.getByTestId('run-status')).toContainText('一時停止');
  });
});
