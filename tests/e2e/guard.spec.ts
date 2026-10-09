import { expect, test } from './support/test';

// The runtime guard itself (support/test.ts, SEC-09): a Content-Security-Policy violation fails a
// test even when that test allows every console error. Checked once; it does not depend on the viewport.
test.skip(({ viewport }) => viewport?.width !== 360, 'checked once, on the 360px project');

const GUARD_PAGE = 'http://csp-guard.test/';

test('a CSP violation is recorded even when every console error is allowed', async ({ page, allowConsoleError, runtimeProblems }) => {
  allowConsoleError(/./);
  await page.route(GUARD_PAGE, (route) =>
    route.fulfill({
      contentType: 'text/html',
      headers: { 'Content-Security-Policy': "default-src 'none'" },
      body: '<!doctype html><title>guard</title><script>document.title = "ran"</script><p>guard</p>',
    }),
  );

  await page.goto(GUARD_PAGE);
  await expect(page.getByText('guard', { exact: true })).toBeVisible();
  expect(await page.title()).toBe('guard'); // the inline script was blocked

  await expect.poll(() => runtimeProblems.filter((problem) => problem.startsWith('CSP violation:'))).toHaveLength(1);
  expect(runtimeProblems.some((problem) => problem.startsWith('CSP:') && /Content Security Policy/.test(problem))).toBe(true);

  // Expected here; cleared so the guard does not fail this test.
  runtimeProblems.length = 0;
});
