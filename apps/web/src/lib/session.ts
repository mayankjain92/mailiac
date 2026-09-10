/**
 * Browser-scoped session management utility for Mailiac.
 *
 * Provides client-isolated session IDs (UUIDv4) to guarantee that external
 * integrations (such as Gmail OAuth) are strictly bound to the requesting browser
 * without leaking cross-user state.
 */

export const SESSION_STORAGE_KEY = 'mailiac_session_id';
export const COOKIE_NAME = 'mailiac_session_id';

/**
 * Safely reads a cookie by name in browser context.
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * Safely writes a cookie with standard security attributes.
 */
function setCookie(name: string, value: string, days = 365): void {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

/**
 * Safely removes a cookie.
 */
function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

/**
 * Generates a cryptographically strong UUIDv4.
 */
function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older browser or test environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Retrieves or generates a browser-scoped session ID following the priority:
 * 1. URL search parameter (?sessionId=...) -> persists and strips from URL
 * 2. localStorage
 * 3. document.cookie
 * 4. Generate new UUIDv4
 *
 * Safe to call during SSR (returns empty string when window is undefined).
 */
export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  // 1. Priority 1: Check URL query parameter (e.g. returning from OAuth redirect)
  try {
    const url = new URL(window.location.href);
    const urlSessionId = url.searchParams.get('sessionId')?.trim();

    if (urlSessionId) {
      // Persist across both localStorage and Cookie
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, urlSessionId);
      } catch {
        // Handle private browsing storage limitations
      }
      setCookie(COOKIE_NAME, urlSessionId);

      // Clean the sessionId parameter from the browser URL immediately to prevent URL leakage
      url.searchParams.delete('sessionId');
      const cleanPath = url.pathname + (url.search ? url.search : '') + url.hash;
      window.history.replaceState(window.history.state, '', cleanPath);

      return urlSessionId;
    }
  } catch {
    // If URL parsing fails, continue to next priority
  }

  // 2. Priority 2: Check localStorage
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY)?.trim();
    if (stored) {
      // Ensure cookie remains in sync
      setCookie(COOKIE_NAME, stored);
      return stored;
    }
  } catch {
    // localStorage might be unavailable or restricted
  }

  // 3. Priority 3: Check Cookie
  const cookieVal = getCookie(COOKIE_NAME)?.trim();
  if (cookieVal) {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, cookieVal);
    } catch {
      // Ignore storage error
    }
    return cookieVal;
  }

  // 4. Priority 4: Generate new UUIDv4
  const newSessionId = generateUuid();
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, newSessionId);
  } catch {
    // Ignore storage error
  }
  setCookie(COOKIE_NAME, newSessionId);

  return newSessionId;
}

/**
 * Clears the session identifier from both localStorage and cookies.
 */
export function clearSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage error
  }
  deleteCookie(COOKIE_NAME);
}

/**
 * Wrapper around native fetch that automatically injects the x-session-id header
 * and includes credentials, ensuring all API calls are scoped to the active browser session.
 */
export async function sessionFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);

  const sessionId = getOrCreateSessionId();
  if (sessionId && !headers.has('x-session-id')) {
    headers.set('x-session-id', sessionId);
  }

  const credentials = init?.credentials ?? 'include';

  const res = await fetch(input, {
    ...init,
    headers,
    credentials,
  });

  if (res.status === 401) {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (urlStr && !urlStr.includes('/api/auth/me') && !headers.has('x-skip-auth-modal')) {
      import('./api')
        .then(({ notifyUnauthorized }) => {
          notifyUnauthorized();
        })
        .catch(() => {});
    }
  }

  return res;
}
