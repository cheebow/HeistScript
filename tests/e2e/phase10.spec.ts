import { expect, test, type Page } from '@playwright/test';

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

test.describe('Phase 10 学習体験', () => {
  test('構文エラー→修正→実行時エラー→修正→成功 が UI で完結する', async ({ page }) => {
    await page.goto('/');
    await waitHook(page);
    // 1) 構文エラー（end 忘れ）
    await setScript(page, 'thief_a', 'if safe\nmove jewel\n');
    await expect(page.getByTestId('error-list')).toContainText('end');
    await expect(page.getByTestId('btn-play')).toBeDisabled();
    // 2) 意味エラー（もしかして）
    await setScript(page, 'thief_a', 'move jewl\nsteal jewel\nmove exit\n');
    await expect(page.getByTestId('error-list')).toContainText('もしかして: jewel');
    // 3) 実行時エラー（隣接していない steal）
    await setScript(page, 'thief_a', 'steal jewel\nmove exit\n');
    await page.getByRole('button', { name: 'x4' }).click();
    await page.getByTestId('btn-play').click();
    await expect(page.getByTestId('result-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('result-reason')).toContainText('対処');
    await page.getByTestId('result-close').click();
    await expect(page.getByTestId('thief-explain')).toContainText('エラーで停止');
    // 4) 修正して成功
    await setScript(page, 'thief_a', 'move jewel\nsteal jewel\nmove exit\n');
    await page.getByTestId('btn-play').click();
    await expect(page.getByTestId('result-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('result-dialog')).toContainText('ミッション成功');
  });

  test('整形ボタンでインデントが整う', async ({ page }) => {
    await page.goto('/');
    await waitHook(page);
    await page.getByTestId('stage-select').selectOption('stage_05');
    await setScript(page, 'thief_a', 'on spotted\nmove safe_room\nresume\nend\nmove exit\n');
    await page.getByTestId('btn-format').click();
    await expect.poll(() => getScript(page, 'thief_a')).toBe('on spotted\n  move safe_room\n  resume\nend\nmove exit\n');
  });

  test('条件待ちの理由と述語の値が状態パネルに出る', async ({ page }) => {
    await page.goto('/');
    await waitHook(page);
    await page.getByTestId('stage-select').selectOption('stage_05');
    await page.getByTestId('btn-step').click();
    await page.getByTestId('btn-step').click();
    await page.getByRole('button', { name: '怪盗B' }).first().click();
    await expect(page.getByTestId('thief-explain')).toContainText('条件待ち');
    await expect(page.getByTestId('thief-explain')).toContainText('合図 ready');
    await expect(page.getByTestId('thief-explain')).toContainText('guard_away');
  });

  test('学習パネルとホバーヘルプ', async ({ page }) => {
    await page.goto('/');
    await waitHook(page);
    await expect(page.getByTestId('learn-panel')).toContainText('学ぶ命令');
    await expect(page.getByTestId('learn-panel')).toContainText('最初の一歩');
    await setScript(page, 'thief_a', 'move jewel\n');
    const word = page.locator('.editor .view-line span', { hasText: 'jewel' }).first();
    await word.hover();
    await expect(page.locator('.monaco-hover', { hasText: '宝石' }).first()).toBeVisible({ timeout: 10_000 });
  });
});
