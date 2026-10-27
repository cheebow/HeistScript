import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type TestHook = { setScript: (s: string, thiefId?: string) => void; getScript: (thiefId?: string) => string };
async function waitHook(page: Page) {
  await page.waitForFunction(() => !!(window as unknown as { __heistTest?: unknown }).__heistTest);
}
async function setScript(page: Page, thiefId: string, text: string) {
  await page.evaluate(([t, s]) => (window as unknown as { __heistTest: TestHook }).__heistTest.setScript(s!, t), [thiefId, text]);
}
async function getScript(page: Page, thiefId: string) {
  return page.evaluate((t) => (window as unknown as { __heistTest: TestHook }).__heistTest.getScript(t), thiefId);
}

test.describe('Phase 11 やり込み・カスタムステージ', () => {
  test('クリア後にベストのコードを読み込める', async ({ page }) => {
    await page.goto('/');
    await waitHook(page);
    await setScript(page, 'thief_a', 'move jewel\nsteal jewel\nmove exit\n');
    await page.getByRole('button', { name: 'x4' }).click();
    await page.getByTestId('btn-play').click();
    await expect(page.getByTestId('result-dialog')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('result-close').click();
    await setScript(page, 'thief_a', 'move hall\n');
    page.on('dialog', (d) => d.accept());
    await page.getByTestId('btn-load-best').click();
    await expect.poll(() => getScript(page, 'thief_a')).toBe('move jewel\nsteal jewel\nmove exit\n');
    await page.reload();
    await waitHook(page);
    await expect(page.getByTestId('btn-load-best')).toBeVisible();
  });

  test('カスタムステージを読み込んで試遊できる。不正な JSON は理由を表示', async ({ page }) => {
    await page.goto('/');
    await waitHook(page);
    await page.getByTestId('btn-stage-io').click();
    // 不正: 出口が壁
    const bad = JSON.parse(readFileSync('stages/stage_01.json', 'utf8'));
    bad.id = 'custom_bad';
    bad.exit = { x: 0, y: 0 };
    await page.getByTestId('stage-import').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
    await expect(page.getByTestId('import-errors')).toContainText('exit');
    // 正常: stage_01 のコピー（id 変更）
    const good = JSON.parse(readFileSync('stages/stage_01.json', 'utf8'));
    good.id = 'custom_test';
    good.title = 'テスト用カスタム';
    await page.getByTestId('stage-import').setInputFiles({ name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(good)) });
    await expect(page.getByTestId('stage-io-dialog')).toBeHidden();
    await expect(page.locator('.game-header h1')).toHaveText('テスト用カスタム');
    await setScript(page, 'thief_a', 'move jewel\nsteal jewel\nmove exit\n');
    await page.getByRole('button', { name: 'x4' }).click();
    await page.getByTestId('btn-play').click();
    await expect(page.getByTestId('result-dialog')).toContainText('ミッション成功', { timeout: 30_000 });
    await page.reload();
    await waitHook(page);
    await expect(page.getByTestId('stage-select')).toContainText('テスト用カスタム');
  });

  test('新ステージ 7〜11 がサンプル解答で UI 上クリアできる', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await waitHook(page);
    await page.getByRole('button', { name: 'x4' }).click();
    for (const id of ['stage_07', 'stage_09', 'stage_10', 'stage_11']) {
      await page.getByTestId('stage-select').selectOption(id);
      const sol = JSON.parse(readFileSync(`stages/${id}.json`, 'utf8')).solution as Record<string, string>;
      for (const [tid, src] of Object.entries(sol)) await setScript(page, tid, src);
      await page.getByTestId('btn-play').click();
      await expect(page.getByTestId('result-dialog')).toContainText('ミッション成功', { timeout: 60_000 });
      await page.getByTestId('result-close').click();
    }
  });
});
