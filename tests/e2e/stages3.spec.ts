import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type TestHook = { setScript: (s: string, thiefId?: string) => void };
async function waitHook(page: Page) {
  await page.waitForFunction(() => !!(window as unknown as { __heistTest?: unknown }).__heistTest);
}
async function setScript(page: Page, thiefId: string, text: string) {
  await page.evaluate(([t, s]) => (window as unknown as { __heistTest: TestHook }).__heistTest.setScript(s!, t), [thiefId, text]);
}

test('追加ステージ（24〜57 の抜粋）がサンプル解答で UI 上クリアでき、共有ボックスが出る', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/#play');
  await waitHook(page);
  await page.getByRole('button', { name: 'x4' }).click();
  for (const id of ['stage_24', 'stage_31', 'stage_35', 'stage_42', 'stage_45', 'stage_48', 'stage_52', 'stage_56']) {
    await page.getByTestId('stage-select').selectOption(id);
    const sol = JSON.parse(readFileSync(`stages/${id}.json`, 'utf8')).solution as Record<string, string>;
    for (const [tid, src] of Object.entries(sol)) await setScript(page, tid, src);
    await page.getByTestId('btn-play').click();
    await expect(page.getByTestId('result-dialog')).toContainText('ミッション成功', { timeout: 90_000 });
    await expect(page.getByTestId('share-box')).toContainText('HeistScript');
    const href = await page.getByTestId('share-x').getAttribute('href');
    expect(href).toContain('twitter.com/intent/tweet');
    expect(href).toContain(encodeURIComponent(`#stage=${id}`));
    await page.getByTestId('result-close').click();
  }
});

test('ステージ選択は章ごとに見出しが出て、難しさの★が表示される', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('title-start').click();
  await expect(page.getByTestId('stage-select-screen')).toBeVisible();
  await expect(page.locator('.chapter-head').first()).toContainText('第1章');
  await expect(page.locator('.chapter-head')).toHaveCount(7);
  await expect(page.getByTestId('stage-card-stage_24').locator('.stage-diff')).toHaveText('★☆☆☆☆');
});

test('周期のある設備は「N tick 後に」が表示され、成功時は演出のあとに結果が出てバッジが付く', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/#stage=stage_29');
  await waitHook(page);
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#stage=stage_29');
  await waitHook(page);
  const sol = JSON.parse(readFileSync('stages/stage_29.json', 'utf8')).solution as Record<string, string>;
  await setScript(page, 'thief_a', sol.thief_a!);
  await page.getByRole('button', { name: 'x4' }).click();
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('periodic-list')).toContainText('tick 後に');
  await expect(page.getByTestId('result-dialog')).toContainText('ミッション成功', { timeout: 60_000 });
  await expect(page.getByTestId('clear-badges')).toContainText('初クリア');
  await expect(page.getByTestId('share-box')).toBeVisible();
});

test('マップをダブルクリックすると move 命令がエディタに入る', async ({ page }) => {
  await page.goto('/#stage=stage_24');
  await waitHook(page);
  await setScript(page, 'thief_a', '');
  const canvas = page.locator('.game-view canvas');
  const box = (await canvas.boundingBox())!;
  const tileW = box.width / 14; // stage_24 は 14×7
  const tileH = box.height / 7;
  // 宝石 jewel_a (5,2) → move jewel_a
  await canvas.dblclick({ position: { x: tileW * 5.5, y: tileH * 2.5 } });
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __heistTest: { getScript: () => string } }).__heistTest.getScript())).toContain('move jewel_a');
  // ただの床 (2,3) → move 2,3
  await canvas.dblclick({ position: { x: tileW * 2.5, y: tileH * 3.5 } });
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __heistTest: { getScript: () => string } }).__heistTest.getScript())).toContain('move 2,3');
});
