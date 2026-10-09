import { expect, test as base, type BrowserContext } from '@playwright/test';

export * from '@playwright/test';

/**
 * Phase 11 "zero crashes" guard (TEST_PLAN G.14), applied to every E2E spec.
 *
 * A test fails when, in any page of any browser context it uses (including contexts a spec opens
 * itself with `browser.newContext`):
 *  - an exception is not caught by the app (`weberror`: uncaught errors and unhandled promise
 *    rejections), or
 *  - the page logs `console.error`, unless the message was allowed by the test.
 *
 * The app logs `console.error` for failures it handles (for example "Could not load the
 * catalog"), and Chromium logs every failed network request as "Failed to load resource". A test
 * that causes such a failure on purpose says so with `allowConsoleError(/pattern/)` (in the
 * test, or in a `test.beforeEach` for a whole file); every other test must run clean. Warnings are
 * not checked.
 *
 * Content-Security-Policy violations (SEC-09) always fail the test: the page reports every
 * `securitypolicyviolation` event, and a console message about a refused resource is checked
 * before, and independently of, any allow-list. No pattern a test allows can hide one.
 *
 * `E2E_LOG_ALLOWED=1` prints every console error an allow-list let through, to keep each list
 * down to the messages its test really causes.
 */
type Options = { allowedConsoleErrors: RegExp[] };
type Fixtures = {
  /** The patterns allowed in this test: the file-level option plus whatever the test adds. */
  consoleErrorAllowList: RegExp[];
  allowConsoleError: (...patterns: RegExp[]) => void;
  /** Applies the guard to a context the test launched itself (`launchPersistentContext`). */
  watchContext: (context: BrowserContext) => void;
  runtimeProblems: string[];
  runtimeGuard: void;
};

/** What Chromium logs when a request fails or the server answers with an error status. */
export const FAILED_REQUEST = /Failed to load resource/;

/** What Chromium logs when the Content-Security-Policy blocks something. Never allowed. */
export const CSP_MESSAGE = /Content[- ]Security[- ]Policy|Refused to (execute|load|apply|connect|frame|evaluate|compile|create|send|navigate|submit)/i;

/** Name of the binding the page calls for each `securitypolicyviolation` event. */
const CSP_BINDING = '__wkReportCspViolation';

export const test = base.extend<Options & Fixtures>({
  allowedConsoleErrors: [[], { option: true }],

  consoleErrorAllowList: async ({ allowedConsoleErrors }, provide) => {
    await provide([...allowedConsoleErrors]);
  },

  allowConsoleError: async ({ consoleErrorAllowList }, provide) => {
    await provide((...patterns) => {
      consoleErrorAllowList.push(...patterns);
    });
  },

  runtimeProblems: async ({}, provide) => {
    await provide([]);
  },

  watchContext: async ({ runtimeProblems, consoleErrorAllowList }, provide) => {
    await provide((context) => {
      context.on('weberror', (webError) => {
        runtimeProblems.push(`uncaught exception: ${webError.error().stack ?? webError.error().message}`);
      });
      context.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (CSP_MESSAGE.test(text)) {
          runtimeProblems.push(`CSP: ${text} (${message.location().url})`);
          return;
        }
        if (consoleErrorAllowList.some((pattern) => pattern.test(text))) {
          if (process.env.E2E_LOG_ALLOWED) console.log(`[allowed console.error] ${text}`);
          return;
        }
        runtimeProblems.push(`console.error: ${text} (${message.location().url})`);
      });
      void context
        .exposeBinding(CSP_BINDING, (_source, report: string) => {
          runtimeProblems.push(`CSP violation: ${report}`);
        })
        .catch((error: unknown) => runtimeProblems.push(`CSP guard could not be installed: ${String(error)}`));
      void context
        .addInitScript((binding: string) => {
          document.addEventListener('securitypolicyviolation', (event) => {
            const report = `${event.effectiveDirective} blocked ${event.blockedURI || 'inline'} (${event.sourceFile}:${event.lineNumber})`;
            (window as unknown as Record<string, (text: string) => void>)[binding]?.(report);
          });
        }, CSP_BINDING)
        .catch((error: unknown) => runtimeProblems.push(`CSP guard could not be installed: ${String(error)}`));
    });
  },

  runtimeGuard: [
    async ({ browser, watchContext, runtimeProblems }, provide) => {
      // Contexts created by the built-in `context` fixture and by specs themselves both go
      // through `browser.newContext`. Tests run one at a time in a worker, so patching it for the
      // duration of one test is safe.
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (...args: Parameters<typeof newContext>) => {
        const context = await newContext(...args);
        watchContext(context);
        return context;
      };

      await provide();

      browser.newContext = newContext;
      expect(runtimeProblems, 'the app must not crash or log unexpected errors').toEqual([]);
    },
    { auto: true },
  ],
});
