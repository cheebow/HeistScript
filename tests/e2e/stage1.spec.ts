import { expect, test, type Page } from '@playwright/test';

/** Monaco にキーボードで入力する（補完確定を避けるため各行で Escape） */
async function typeInEditor(page: Page, text: string) {
  await page.waitForFunction(() => !!(window as unknown as { __heistTest?: unknown }).__heistTest);
  const editor = page.locator('.editor .monaco-editor .view-lines').first();
  await editor.click({ position: { x: 150, y: 10 } });
  await expect.poll(async () => page.evaluate(() => document.activeElement?.className ?? '')).toContain('edit-context');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await expect
    .poll(async () => page.evaluate(() => (window as unknown as { __heistTest: { getScript: () => string } }).__heistTest.getScript()))
    .toBe('');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    await page.keyboard.type(lines[i]!);
    await page.waitForTimeout(350); // 補完ウィジェットの表示を待ってから閉じる（高負荷時の取りこぼし防止）
    await page.keyboard.press('Escape');
    if (i < lines.length - 1) await page.keyboard.press('Enter');
  }
}

/** テストフック経由でスクリプトを設定する（入力検証ではなく実行検証に使う） */
async function setEditorText(page: Page, text: string) {
  await page.waitForFunction(() => !!(window as unknown as { __heistTest?: unknown }).__heistTest);
  await page.evaluate((t) => (window as unknown as { __heistTest: { setScript: (s: string) => void } }).__heistTest.setScript(t), text);
}

test.describe('Stage 1', () => {
  test('エディタで修正→再生→クリア→結果画面', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('btn-play')).toBeVisible();
    await expect(page.locator('.editor .monaco-editor')).toBeVisible();
    await typeInEditor(page, 'move jewel\nsteal jewel\nmove exit');
    await expect
      .poll(async () => page.evaluate(() => (window as unknown as { __heistTest: { getScript: () => string } }).__heistTest.getScript()))
      .toContain('move exit');
    await page.getByRole('button', { name: 'x4' }).click();
    await page.getByTestId('btn-play').click();
    await expect(page.getByTestId('result-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('result-dialog')).toContainText('ミッション成功');
    await expect(page.getByTestId('result-reason')).toContainText('脱出');
  });

  test('エラーのあるコードは実行禁止で分かりやすいメッセージ', async ({ page }) => {
    await page.goto('/');
    await setEditorText(page, 'move vault\nsteal jewel');
    await expect(page.getByTestId('error-list')).toBeVisible();
    await expect(page.getByTestId('error-list')).toContainText('vault');
    await expect(page.getByTestId('error-list')).toContainText('1行目');
    await expect(page.getByTestId('btn-play')).toBeDisabled();
  });

  test('一時停止→ステップ→巻き戻し→再再生で同じ状態', async ({ page }) => {
    await page.goto('/');
    await setEditorText(page, 'move jewel\nsteal jewel\nmove exit');
    // 1tick ずつ 5 回
    for (let i = 0; i < 5; i++) await page.getByTestId('btn-step').click();
    await expect(page.getByTestId('tick-label')).toHaveText('tick 5/5');
    const infoAt5 = await page.getByTestId('thief-info').innerText();
    // 巻き戻し
    await page.getByTestId('timeline').fill('2');
    await expect(page.getByTestId('tick-label')).toHaveText('tick 2/5');
    await expect(page.getByTestId('run-status')).toContainText('過去のコマ');
    const infoAt2 = await page.getByTestId('thief-info').innerText();
    expect(infoAt2).not.toEqual(infoAt5);
    // 初期状態から再実行して 5tick
    await page.getByTestId('btn-restart').click();
    for (let i = 0; i < 5; i++) await page.getByTestId('btn-step').click();
    await expect(page.getByTestId('tick-label')).toHaveText('tick 5/5');
    expect(await page.getByTestId('thief-info').innerText()).toEqual(infoAt5);
  });

  test('リロード後もコードとクリア記録が残る', async ({ page }) => {
    await page.goto('/');
    await setEditorText(page, 'move jewel\nsteal jewel\nmove exit');
    await page.getByRole('button', { name: 'x4' }).click();
    await page.getByTestId('btn-play').click();
    await expect(page.getByTestId('result-dialog')).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.locator('.editor .monaco-editor')).toContainText('move exit');
    await expect(page.locator('.badge')).toContainText('クリア済み');
  });
});
