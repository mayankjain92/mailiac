import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getOrCreateSessionId,
  clearSession,
  sessionFetch,
  SESSION_STORAGE_KEY,
  COOKIE_NAME,
} from '../src/lib/session';

describe('Browser-Scoped Session Utility (apps/web/src/lib/session.ts)', () => {
  let mockLocalStorage: Record<string, string>;
  let mockCookie: string;
  let mockReplaceState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockLocalStorage = {};
    mockCookie = '';
    mockReplaceState = vi.fn();

    // Mock localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => mockLocalStorage[key] ?? null),
        setItem: vi.fn((key: string, val: string) => {
          mockLocalStorage[key] = val;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockLocalStorage[key];
        }),
        clear: vi.fn(() => {
          mockLocalStorage = {};
        }),
      },
      configurable: true,
      writable: true,
    });

    // Mock document
    const mockDocument = {
      get cookie() {
        return mockCookie;
      },
      set cookie(val: string) {
        const parts = val.split(';');
        const [k, v] = parts[0].split('=');
        if (val.includes('Thu, 01 Jan 1970')) {
          mockCookie = '';
        } else {
          mockCookie = `${k.trim()}=${v.trim()}`;
        }
      },
    };
    (globalThis as unknown as { document: unknown }).document = mockDocument;

    // Mock window
    const mockWindow = {
      location: new URL('http://localhost:3000/mailbox'),
      history: {
        state: null,
        replaceState: mockReplaceState,
      },
    };
    (globalThis as unknown as { window: unknown }).window = mockWindow;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates and persists a new UUID when no session exists anywhere', () => {
    const sessionId = getOrCreateSessionId();

    expect(sessionId).toBeDefined();
    expect(typeof sessionId).toBe('string');
    expect(sessionId.length).toBeGreaterThan(10);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe(sessionId);
    expect(document.cookie).toContain(`${COOKIE_NAME}=${sessionId}`);
  });

  it('reuses existing sessionId stored in localStorage', () => {
    mockLocalStorage[SESSION_STORAGE_KEY] = 'test-local-session-123';

    const sessionId = getOrCreateSessionId();

    expect(sessionId).toBe('test-local-session-123');
    expect(document.cookie).toContain('test-local-session-123');
  });

  it('recovers sessionId from cookie if localStorage is empty', () => {
    mockCookie = `${COOKIE_NAME}=test-cookie-session-456`;

    const sessionId = getOrCreateSessionId();

    expect(sessionId).toBe('test-cookie-session-456');
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe('test-cookie-session-456');
  });

  it('prioritizes URL parameter, persists it, and immediately strips it from URL', () => {
    (globalThis as unknown as { window: { location: unknown } }).window.location = new URL(
      'http://localhost:3000/mailbox?gmail=connected&sessionId=oauth-callback-session-789'
    );

    const sessionId = getOrCreateSessionId();

    expect(sessionId).toBe('oauth-callback-session-789');
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe('oauth-callback-session-789');
    expect(document.cookie).toContain('oauth-callback-session-789');

    // Verifies window.history.replaceState was invoked to strip the sessionId parameter
    expect(mockReplaceState).toHaveBeenCalledWith(
      null,
      '',
      expect.stringContaining('/mailbox?gmail=connected')
    );
    expect(mockReplaceState).toHaveBeenCalledWith(
      null,
      '',
      expect.not.stringContaining('sessionId=')
    );
  });

  it('clearSession removes session from localStorage and deletes cookie', () => {
    mockLocalStorage[SESSION_STORAGE_KEY] = 'to-be-deleted';
    mockCookie = `${COOKIE_NAME}=to-be-deleted`;

    clearSession();

    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(document.cookie).toBe('');
  });

  describe('sessionFetch', () => {
    it('automatically attaches x-session-id and credentials: include', async () => {
      mockLocalStorage[SESSION_STORAGE_KEY] = 'active-fetch-session-999';

      const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
      globalThis.fetch = mockFetch;

      await sessionFetch('/api/gmail/status');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/gmail/status');
      expect(init.credentials).toBe('include');

      const headers = init.headers as Headers;
      expect(headers.get('x-session-id')).toBe('active-fetch-session-999');
    });

    it('preserves existing custom headers while injecting x-session-id', async () => {
      mockLocalStorage[SESSION_STORAGE_KEY] = 'active-fetch-session-999';

      const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
      globalThis.fetch = mockFetch;

      await sessionFetch('/api/upload', {
        method: 'POST',
        headers: {
          'X-Custom-Header': 'CustomValue',
        },
      });

      const [, init] = mockFetch.mock.calls[0];
      const headers = init.headers as Headers;
      expect(headers.get('x-session-id')).toBe('active-fetch-session-999');
      expect(headers.get('x-custom-header')).toBe('CustomValue');
    });
  });
});
