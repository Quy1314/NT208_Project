import { expect, test, type Page } from '@playwright/test';

const project = {
  id: 'project-streaming-e2e',
  title: 'Streaming Scroll E2E',
  prompt: 'Seed prompt',
  content: Array.from({ length: 24 }, (_, i) => `Đoạn nền ${i + 1}: câu chuyện đã có trước đó.`).join('\n\n'),
};

const defaultStreamChunks = Array.from(
  { length: 70 },
  (_, i) => `\n\nPhần stream ${i + 1}: nội dung mới mở rộng khung truyện với nhiều chi tiết.`,
);

const longStreamChunks = Array.from(
  { length: 220 },
  (_, i) => `\n\nPhần stream dài ${i + 1}: nội dung typewriter cần render mượt và không khóa tương tác UI.`,
);

function streamBody(chunks: string[]) {
  return [
    ...chunks.map((chunk) => `event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`),
    'event: done\ndata: {}\n\n',
  ].join('');
}

async function setupStreamingPage(page: Page, chunks = defaultStreamChunks) {
  await page.addInitScript(() => {
    window.localStorage.setItem('access_token', 'e2e-token');
    window.localStorage.setItem('user_email', 'e2e@example.test');
    window.localStorage.setItem('theme', 'light');
  });

  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { email: 'e2e@example.test' } })
  );
  await page.route('**/api/teams/', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/projects**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname.replace(/\/$/, '');

    if (request.method() === 'GET' && pathname.endsWith('/api/projects')) {
      return route.fulfill({ json: [project] });
    }

    if (request.method() === 'GET' && pathname.endsWith(`/api/projects/${project.id}`)) {
      return route.fulfill({ json: project });
    }

    if (
      request.method() === 'POST' &&
      pathname.endsWith(`/api/projects/${project.id}/continue`) &&
      url.searchParams.get('stream') === 'true'
    ) {
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: streamBody(chunks),
      });
    }

    return route.abort('failed');
  });

  await page.goto('/workspace');
  await page.getByRole('button', { name: /Streaming Scroll E2E/ }).click();
  await expect(page.getByTestId('workspace-composer-input')).toBeVisible();
}

async function scrollToBottom(page: Page) {
  const scroll = page.getByTestId('workspace-scroll-container');
  await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  return scroll;
}

test('auto-scrolls while streaming when user is near bottom', async ({ page }) => {
  await setupStreamingPage(page);
  const scroll = await scrollToBottom(page);
  const before = await scroll.evaluate((el) => el.scrollTop);

  await page.getByTestId('workspace-composer-input').fill('Viết tiếp thật dài');
  await page.getByTestId('workspace-submit-button').click();

  await expect.poll(async () => scroll.evaluate((el) => el.scrollTop), {
    message: 'scrollTop should increase as streamed content grows',
  }).toBeGreaterThan(before);

  await expect(page.getByTestId('workspace-submit-button')).toBeEnabled();
  const gap = await scroll.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
  expect(gap).toBeLessThanOrEqual(160);
});

test('does not force scroll while streaming after user scrolls upward', async ({ page }) => {
  await setupStreamingPage(page);
  const scroll = await scrollToBottom(page);

  await page.getByTestId('workspace-composer-input').fill('Viết tiếp thật dài');
  await page.getByTestId('workspace-submit-button').click();

  await expect.poll(async () => scroll.evaluate((el) => el.scrollHeight), {
    message: 'stream should grow the document before user scrolls upward',
  }).toBeGreaterThan(await scroll.evaluate((el) => el.clientHeight));

  await scroll.evaluate((el) => {
    el.scrollTop = Math.max(0, el.scrollTop - 420);
    el.dispatchEvent(new Event('scroll'));
  });
  const userPosition = await scroll.evaluate((el) => el.scrollTop);

  await page.waitForTimeout(250);

  const after = await scroll.evaluate((el) => el.scrollTop);
  expect(after).toBeLessThanOrEqual(userPosition + 60);
});

test('resumes auto-scroll when user returns to the bottom during streaming', async ({ page }) => {
  await setupStreamingPage(page, longStreamChunks);
  const scroll = await scrollToBottom(page);

  await page.getByTestId('workspace-composer-input').fill('Viết tiếp rồi resume scroll');
  await page.getByTestId('workspace-submit-button').click();

  await expect.poll(async () => scroll.evaluate((el) => el.scrollHeight), {
    message: 'long stream should grow before toggling the sticky-bottom state',
  }).toBeGreaterThan(await scroll.evaluate((el) => el.clientHeight + 300));

  await scroll.evaluate((el) => {
    el.scrollTop = Math.max(0, el.scrollTop - 520);
    el.dispatchEvent(new Event('scroll'));
  });
  const pausedPosition = await scroll.evaluate((el) => el.scrollTop);

  await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });

  await expect(page.getByTestId('workspace-submit-button')).toBeEnabled();
  const finalGap = await scroll.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
  const finalPosition = await scroll.evaluate((el) => el.scrollTop);

  expect(finalPosition).toBeGreaterThan(pausedPosition);
  expect(finalGap).toBeLessThanOrEqual(160);
});

test('keeps the UI responsive while rendering a long typewriter stream', async ({ page }) => {
  await setupStreamingPage(page, longStreamChunks);
  const scroll = await scrollToBottom(page);
  const input = page.getByTestId('workspace-composer-input');

  await input.fill('Viết tiếp với stream rất dài');
  await page.getByTestId('workspace-submit-button').click();

  await expect.poll(async () => scroll.evaluate((el) => el.scrollHeight), {
    message: 'long typewriter stream should start rendering content',
  }).toBeGreaterThan(await scroll.evaluate((el) => el.clientHeight + 300));

  await input.fill('UI vẫn nhận input trong lúc stream dài');
  await expect(input).toHaveValue('UI vẫn nhận input trong lúc stream dài');

  await scroll.evaluate((el) => {
    el.scrollTop = Math.max(0, el.scrollTop - 360);
    el.dispatchEvent(new Event('scroll'));
  });

  const positionAfterInteraction = await scroll.evaluate((el) => el.scrollTop);
  expect(positionAfterInteraction).toBeGreaterThanOrEqual(0);
  await expect(page.getByTestId('workspace-submit-button')).toBeEnabled();
});
