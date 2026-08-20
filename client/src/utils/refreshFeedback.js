export const REFRESH_CONFIRMATION_MS = 300;

export function waitForRefreshConfirmation(durationMs = REFRESH_CONFIRMATION_MS) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
