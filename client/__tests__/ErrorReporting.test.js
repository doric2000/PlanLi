const mockInit = jest.fn();

jest.mock('@sentry/react-native', () => ({
  init: (...args) => mockInit(...args),
  wrap: (component) => component,
}));

describe('error reporting privacy', () => {
  const originalDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  afterEach(() => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
    mockInit.mockClear();
  });

  it('redacts common credentials and email addresses from diagnostic text', () => {
    const { sanitizeDiagnosticText } = require('../src/services/ErrorReporting');
    expect(sanitizeDiagnosticText(
      'user@example.com Bearer abc.def token https://x.test/?token=secret&ok=1'
    )).toBe(
      '[redacted-email] Bearer [redacted] token https://x.test/?token=[redacted]&ok=1'
    );
  });

  it('initializes without PII, tracing, replay, screenshots, or breadcrumbs', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
    const { initializeErrorReporting } = require('../src/services/ErrorReporting');

    initializeErrorReporting();

    expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
      sendDefaultPii: false,
      maxBreadcrumbs: 0,
      tracesSampleRate: 0,
      profilesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      attachScreenshot: false,
      attachViewHierarchy: false,
      enableCaptureFailedRequests: false,
    }));

    const beforeSend = mockInit.mock.calls[0][0].beforeSend;
    expect(beforeSend({
      user: { email: 'user@example.com' },
      request: { url: 'https://example.test/?token=secret' },
      breadcrumbs: [{ message: 'private' }],
      extra: { content: 'private' },
      contexts: { device: { device_unique_identifier: 'device-id' } },
      tags: { userId: 'user-1' },
      message: 'Failure for user@example.com',
    })).toEqual({ message: 'Failure for [redacted-email]' });
  });
});
