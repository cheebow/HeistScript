import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type TestHook = { setScript: (s: string, thiefId?: string) => void };
async function waitHook(page: Page) {
  await page.waitForFunction(() => !!(window as unknown as { __heistTest?: unknown }).__heistTest);
}
async function setScript(page: Page, thiefId: string, text: string) {
  await page.evaluate(([t, s]) => (window as unknown as { __heistTest: TestHook }).__heistTest.setScript(s!, t), [thiefId, text]);
}

test('新ステージ 12〜23 がサンプル解答で UI 上クリアできる', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/#play');
  await waitHook(page);
  await page.getByRole('button', { name: 'x4' }).click();
  for (const id of ['stage_12', 'stage_13', 'stage_14', 'stage_15', 'stage_16', 'stage_17', 'stage_18', 'stage_19', 'stage_20', 'stage_21', 'stage_22', 'stage_23']) {
    await page.getByTestId('stage-select').selectOption(id);
    const sol = JSON.parse(readFileSync(`stages/${id}.json`, 'utf8')).solution as Record<string, string>;
    for (const [tid, src] of Object.entries(sol)) await setScript(page, tid, src);
    await page.getByTestId('btn-play').click();
    await expect(page.getByTestId('result-dialog')).toContainText('ミッション成功', { timeout: 90_000 });
    await page.getByTestId('result-close').click();
  }
});
