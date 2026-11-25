import { test as base, type BrowserContext, type Page } from '@playwright/test';
import { openCaptureContext, type CaptureContext } from './capture.helpers';

type CaptureProfile = { context: BrowserContext; page: Page };
type Fixtures = { capture: (surface: CaptureContext) => Promise<CaptureProfile> };

/** Every test owns and closes its isolated synthetic capture profiles. */
export const test = base.extend<Fixtures>({
  capture: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (surface) => {
      const profile = await openCaptureContext(browser, surface);
      contexts.push(profile.context);
      return profile;
    });
    await Promise.all(contexts.map(async (context) => {
      if (context.browser()) await context.close();
    }));
  },
});

export { expect } from '@playwright/test';
