const mockInit = jest.fn();
const mockSetUser = jest.fn();
const mockAddBreadcrumb = jest.fn();
const mockCaptureException = jest.fn();
const mockSetTag = jest.fn();
const mockMobileReplayIntegration = jest.fn(() => ({ name: 'MobileReplay' }));
const mockScope = { setTag: jest.fn() };

jest.mock('@sentry/react-native', () => ({
  init: (...args) => mockInit(...args),
  wrap: (component) => component,
  setUser: (...args) => mockSetUser(...args),
  addBreadcrumb: (...args) => mockAddBreadcrumb(...args),
  captureException: (...args) => mockCaptureException(...args),
  setTag: (...args) => mockSetTag(...args),
  withScope: (callback) => callback(mockScope),
  mobileReplayIntegration: (...args) => mockMobileReplayIntegration(...args),
}));

describe('error reporting privacy', () => {
  const originalDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  afterEach(() => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
    jest.clearAllMocks();
  });

  it('redacts common credentials and email addresses from diagnostic text', () => {
    const { sanitizeDiagnosticText } = require('../src/services/ErrorReporting');
    expect(sanitizeDiagnosticText(
      'user@example.com Bearer abc.def token https://x.test/?token=secret&ok=1'
    )).toBe(
      '[redacted-email] Bearer [redacted] token https://x.test/?token=[redacted]&ok=1'
    );
  });

  it('initializes the privacy-preserving beta diagnostics profile', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
    const { initializeErrorReporting } = require('../src/services/ErrorReporting');

    initializeErrorReporting();

    expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
      sendDefaultPii: false,
      maxBreadcrumbs: 50,
      enableAutoPerformanceTracing: true,
      enableAppStartTracking: true,
      tracesSampleRate: 0.1,
      profilesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1,
      replaysSessionQuality: 'low',
      attachScreenshot: false,
      attachViewHierarchy: false,
      enableCaptureFailedRequests: false,
    }));
    expect(mockMobileReplayIntegration).toHaveBeenCalledWith({
      maskAllText: true,
      maskAllImages: true,
      maskAllVectors: true,
    });

    const beforeSendTransaction = mockInit.mock.calls[0][0].beforeSendTransaction;
    expect(beforeSendTransaction({
      transaction: 'CompleteAccount user@example.com',
      user: { id: 'firebase-uid', email: 'user@example.com' },
      request: { url: 'https://example.test/?token=secret' },
      spans: [{
        trace_id: 'trace-1',
        span_id: 'span-1',
        start_timestamp: 1,
        timestamp: 2,
        op: 'http.client',
        description: 'POST https://example.test/?token=secret',
        data: { requestBody: 'private' },
      }],
    })).toEqual({
      transaction: 'CompleteAccount [redacted-email]',
      user: { id: 'firebase-uid' },
      spans: [{
        trace_id: 'trace-1',
        span_id: 'span-1',
        start_timestamp: 1,
        timestamp: 2,
        op: 'http.client',
      }],
    });

    const beforeSend = mockInit.mock.calls[0][0].beforeSend;
    expect(beforeSend({
      user: { id: 'firebase-uid', email: 'user@example.com', ip_address: '127.0.0.1' },
      request: { url: 'https://example.test/?token=secret' },
      breadcrumbs: [
        { category: 'console', message: 'private' },
        {
          category: 'auth',
          message: 'Failure for user@example.com',
          data: { operation: 'sign_in_email', outcome: 'error', email: 'user@example.com' },
        },
      ],
      extra: { content: 'private' },
      contexts: {
        device: { device_unique_identifier: 'device-id', model: 'iPhone', online: true },
        os: { name: 'iOS', version: '18.0' },
      },
      tags: { userId: 'user-1', auth_state: 'ready', screen: 'Main' },
      message: 'Failure for user@example.com',
    })).toEqual({
      user: { id: 'firebase-uid' },
      breadcrumbs: [{
        category: 'auth',
        message: 'Failure for [redacted-email]',
        data: { operation: 'sign_in_email', outcome: 'error' },
      }],
      contexts: {
        device: { model: 'iPhone', online: true },
        os: { name: 'iOS', version: '18.0' },
      },
      tags: { auth_state: 'ready', screen: 'Main' },
      message: 'Failure for [redacted-email]',
    });
  });

  it('uses only a pseudonymous user id and allowlisted breadcrumbs', () => {
    const {
      addDiagnosticBreadcrumb,
      setDiagnosticTag,
      setErrorReportingUser,
    } = require('../src/services/ErrorReporting');

    setErrorReportingUser('firebase-uid');
    addDiagnosticBreadcrumb({
      category: 'navigation',
      message: 'Opened user@example.com',
      data: { from: 'Main', to: 'Profile', email: 'user@example.com' },
    });
    addDiagnosticBreadcrumb({
      category: 'network',
      message: 'Publish failed',
      data: { operation: 'publish_route', status: 'uploading', attempt: 2, imagePath: 'private.jpg' },
    });
    addDiagnosticBreadcrumb({ category: 'console', message: 'private log' });
    setDiagnosticTag('screen', 'CompleteAccount');
    setDiagnosticTag('email', 'user@example.com');

    expect(mockSetUser).toHaveBeenCalledWith({ id: 'firebase-uid' });
    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(2);
    expect(mockAddBreadcrumb).toHaveBeenCalledWith({
      category: 'navigation',
      message: 'Opened [redacted-email]',
      level: 'info',
      data: { from: 'Main', to: 'Profile' },
    });
    expect(mockAddBreadcrumb).toHaveBeenCalledWith({
      category: 'network',
      message: 'Publish failed',
      level: 'info',
      data: { operation: 'publish_route', status: 'uploading', attempt: 2 },
    });
    expect(mockSetTag).toHaveBeenCalledTimes(1);
    expect(mockSetTag).toHaveBeenCalledWith('screen', 'CompleteAccount');
  });

  it('does not report expected provider cancellations as application errors', () => {
    const { captureDiagnosticException } = require('../src/services/ErrorReporting');
    const appleCancellation = Object.assign(new Error('cancelled'), {
      code: 'ERR_REQUEST_CANCELED',
    });
    const googleCancellation = Object.assign(new Error('cancelled'), {
      code: 'auth/provider-cancelled',
    });

    captureDiagnosticException(appleCancellation, { operation: 'sign_in_apple' });
    captureDiagnosticException(googleCancellation, { operation: 'sign_in_google' });
    captureDiagnosticException(new Error('network failed'), { operation: 'sign_in_google' });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(expect.objectContaining({
      message: 'network failed',
    }));
  });

  it('tags a bounded structured backend reason for issue diagnosis', () => {
    const { captureDiagnosticException } = require('../src/services/ErrorReporting');
    captureDiagnosticException(new Error('publish failed'), {
      operation: 'publish_recommendation_saving',
      code: 'functions/not-found',
      reason: 'RECOMMENDATION_DRAFT_NOT_FOUND',
      contentMode: 'destination',
    });
    expect(mockScope.setTag).toHaveBeenCalledWith(
      'error_reason',
      'RECOMMENDATION_DRAFT_NOT_FOUND'
    );
    expect(mockScope.setTag).toHaveBeenCalledWith('content_mode', 'destination');
  });
});
