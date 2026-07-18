import { expect, test, type Page } from 'playwright/test';
import { startMockProvider } from './mockProvider';

let mockProvider: Awaited<ReturnType<typeof startMockProvider>>;

test.beforeAll(async () => {
  mockProvider = await startMockProvider();
});

test.afterAll(async () => {
  await mockProvider.close();
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function configureProvider(page: Page, path = '/fast/v1'): Promise<void> {
  await page
    .getByLabel('Provider endpoint')
    .first()
    .fill(`${mockProvider.baseUrl}${path}`);
  await page.getByLabel('Provider model ID').first().fill('chat-model');
  await expect(page.getByText('Provider ready').last()).toBeVisible();
}

test('first-run readiness rejects a missing model and recovers explicitly', async ({
  page,
}) => {
  await configureProvider(page);
  await page.getByRole('button', { name: 'Advanced checks' }).click();
  await page.getByLabel('Provider model ID').last().fill('missing-model');

  await expect(page.getByText('Provider needs setup').last()).toBeVisible();
  await expect(
    page.getByText('Configured model "missing-model" is not available').last(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Rewrite', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('missing-model');

  await page.getByLabel('Provider model ID').last().fill('chat-model');
  await expect(page.getByText('Provider ready').last()).toBeVisible();
});

test('voice examples persist and are used by a successful versioned rewrite', async ({
  page,
}) => {
  await configureProvider(page);
  await page.getByRole('button', { name: 'Add examples' }).click();
  await page.getByRole('button', { name: 'Create voice' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Release voice');
  page.once('dialog', (dialog) =>
    dialog.accept('Ship the smallest verified change.'),
  );
  await page.getByRole('button', { name: 'Add example', exact: true }).click();
  await page
    .getByRole('button', { name: 'Close voice manager' })
    .last()
    .click();

  await page
    .getByLabel('Source text')
    .last()
    .fill(
      'The June 2026 pilot included 42 participants. The wording is vague.',
    );
  await page.getByRole('button', { name: 'Rewrite', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Rewrite', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Rewrite version').last()).toHaveValue(/.+/);
  await expect(page.getByLabel('Rewritten text').last()).toHaveValue(
    /June 2026/,
  );
  await expect(page.getByText('Saving…').last()).toBeVisible();
  await expect(page.getByText('Saved').last()).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('option', { name: 'Release voice' }),
  ).toBeAttached();
  await expect(page.getByLabel('Rewritten text').last()).toHaveValue(
    /42 participants/,
  );
});

test('a long rewrite can be cancelled without applying a stale result', async ({
  page,
}) => {
  await configureProvider(page, '/slow/v1');
  const previous = await page.getByLabel('Rewritten text').inputValue();
  await page
    .getByLabel('Source text')
    .last()
    .fill(
      'The June 2026 pilot included 42 participants and needs a clearer explanation.',
    );
  await page.getByRole('button', { name: 'Rewrite', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText('previous version');
  await expect(page.getByLabel('Rewritten text')).toHaveValue(previous);
  await page.waitForTimeout(2_300);
  await expect(page.getByLabel('Rewritten text')).toHaveValue(previous);
});

test('documents can be searched, duplicated, deleted, and restored', async ({
  page,
}) => {
  await configureProvider(page);
  await page.getByLabel('Search documents').fill('Launch');
  await expect(
    page.getByRole('button', { name: /Launch Announcement/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Q2 Product Strategy/ }),
  ).toBeHidden();
  await page.getByLabel('Search documents').fill('');

  await page
    .getByRole('button', { name: 'Duplicate', exact: true })
    .first()
    .click();
  await expect(page.getByLabel('Document title')).toHaveValue(/copy$/);
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'Delete', exact: true })
    .first()
    .click();
  await expect(
    page.getByText('Document moved to recent deletions.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Document title')).toHaveValue(/copy$/);
});

test('mobile sheets trap focus, close with Escape, and restore the trigger', async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Open document switcher' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'documents sheet' });

  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Close sheet' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('Voice Coach calibrates a local voice, requires review, and survives reload', async ({
  page,
}) => {
  await page.getByRole('button', { name: /Style Lab/ }).click();
  await expect(page.getByRole('dialog', { name: 'Style Lab' })).toBeVisible();
  await page.getByRole('button', { name: 'Start Voice Coach' }).click();
  await page.screenshot({
    path: 'output/playwright-e2e/style-lab-desktop.png',
  });

  for (let index = 0; index < 7; index += 1) {
    await expect(
      page.getByRole('heading', {
        name: 'Which version sounds more like you?',
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Choose A/ }).click();
  }

  await expect(
    page.getByRole('heading', { name: 'Does this sound like your voice?' }),
  ).toBeVisible();
  await expect(page.getByText('Nothing is active yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Save without comparison' }).click();
  await expect(
    page.getByRole('heading', { name: 'Keep shaping your voice' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Learned preferences' }),
  ).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('stylemakar.voices') ?? '[]').length,
      ),
    )
    .toBeGreaterThan(0);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('stylemakar.voices') ?? '[]'),
  );
  expect(stored[0].schemaVersion).toBe(2);
  expect(stored[0].preferences).toHaveLength(7);
  expect(stored[0].rules).toContain(
    'Lead with the main point or requested action.',
  );

  await page.getByRole('button', { name: 'Close Style Lab' }).click();
  await page.reload();
  await page.getByRole('button', { name: /Style Lab/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Keep shaping your voice' }),
  ).toBeVisible();
});

test('Fine-tune My Voice can prove a proposed change with a blinded rewrite', async ({
  page,
}) => {
  await configureProvider(page);
  await page.getByRole('button', { name: /Style Lab/ }).click();
  await page.getByLabel('Fine-tune focus').selectOption('warmth');
  await page.getByRole('button', { name: 'Fine-tune this voice' }).click();
  await page.getByRole('button', { name: 'Try an adaptive example' }).click();
  await expect(
    page.getByText('Adaptive pair generated and meaning-checked.'),
  ).toBeVisible();
  await page.getByRole('button', { name: /Choose B/ }).click();
  await page.getByRole('button', { name: 'Compare before saving' }).click();

  await expect(
    page.getByRole('heading', { name: 'Which result would you rather use?' }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Choose A/ }).click();
  await expect(page.getByText(/preferred|Neither result/)).toBeVisible();
  await page.getByRole('button', { name: /Save/ }).last().click();
  await expect(
    page.getByRole('heading', { name: 'Keep shaping your voice' }),
  ).toBeVisible();
});

test('Voice Coach remains focused and keyboard-dismissable on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.getByRole('button', { name: 'Style Lab' }).click();
  await page.getByRole('button', { name: 'Start Voice Coach' }).click();
  await expect(
    page.getByRole('heading', { name: 'Which version sounds more like you?' }),
  ).toBeVisible();
  await page.screenshot({
    path: 'output/playwright-e2e/style-lab-mobile.png',
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Style Lab' })).toBeHidden();
});

test('cancelling an adaptive example preserves the curated fallback', async ({
  page,
}) => {
  await configureProvider(page, '/slow/v1');
  await page.getByRole('button', { name: /Style Lab/ }).click();
  await page.getByLabel('Fine-tune focus').selectOption('directness');
  await page.getByRole('button', { name: 'Fine-tune this voice' }).click();
  await page.getByRole('button', { name: 'Try an adaptive example' }).click();
  const cancel = page.getByRole('button', {
    name: 'Cancel adaptive example',
  });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(
    page.getByRole('button', { name: 'Try an adaptive example' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Choose A/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Does this sound like your voice?' }),
  ).toBeVisible();
});

test('accepted edits become explicit, reversible voice suggestions', async ({
  page,
}) => {
  await configureProvider(page);
  await page
    .getByLabel('Source text')
    .last()
    .fill(
      'The June 2026 pilot included 42 participants and needs a clear summary.',
    );
  await page.getByRole('button', { name: 'Rewrite', exact: true }).click();
  await expect(page.getByLabel('Rewritten text').last()).toHaveValue(/42/);
  await page
    .getByLabel('Rewritten text')
    .last()
    .fill('The June 2026 pilot had 42 participants.');
  await page.getByRole('button', { name: 'Accept', exact: true }).click();

  const desktopWorkspace = page.getByLabel('Rewrite workspace', {
    exact: true,
  });
  await expect(
    desktopWorkspace.getByText('Write more concisely'),
  ).toBeVisible();
  await desktopWorkspace
    .getByRole('button', { name: 'Save preference' })
    .click();
  await page.getByRole('button', { name: /Style Lab/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Learned preferences' }),
  ).toBeVisible();
  await expect(page.getByLabel('Edit Concision preference')).toHaveValue(
    /Prefer concise phrasing/,
  );
  await expect(
    page.getByRole('button', { name: 'Remove Concision preference' }),
  ).toBeVisible();
});
