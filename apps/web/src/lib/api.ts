import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { getOrCreateSessionId } from './session';

export interface AuthError extends Error {
  isAuthError: true;
  handled: boolean;
  status: 401;
}

export interface ForbiddenError extends Error {
  isForbidden: true;
  status: 403;
}

// Global subscriber for unauthorized (401) events
type UnauthorizedListener = (message?: string) => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/**
 * Register a listener to be notified whenever a 401 Unauthorized response is received.
 * Returns an unregister function.
 */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

/**
 * Dispatches an unauthorized notification across registered listeners,
 * saves the current window location to sessionStorage for post-login redirection,
 * and clears stale browser session tokens if appropriate.
 */
export function notifyUnauthorized(message?: string): void {
  if (typeof window !== 'undefined') {
    try {
      const currentPath = window.location.pathname + window.location.search;
      // Do not store the login callback itself as the return destination
      if (!currentPath.includes('/auth/') && !currentPath.includes('auth=success')) {
        sessionStorage.setItem('mailiac_redirect_after_login', currentPath);
      }
    } catch {
      // Storage might be restricted
    }
  }

  unauthorizedListeners.forEach((listener) => {
    try {
      listener(message);
    } catch (err) {
      console.error('[api] Error in unauthorized listener:', err);
    }
  });
}

/**
 * Type guard for checking if an error was caused by a 401 Unauthorized condition.
 */
export function isAuthError(err: unknown): err is AuthError {
  if (!err || typeof err !== 'object') return false;
  return Boolean((err as AuthError).isAuthError);
}

/**
 * Type guard for checking if an error was caused by a 403 Forbidden condition.
 */
export function isForbiddenError(err: unknown): err is ForbiddenError {
  if (!err || typeof err !== 'object') return false;
  return Boolean((err as ForbiddenError).isForbidden);
}

/**
 * User-friendly error message extractor that avoids surfacing raw technical Axios or 401 errors.
 */
export function getErrorMessage(err: unknown, fallback = 'An unexpected error occurred'): string {
  if (isAuthError(err)) {
    return 'Sign in required to perform this action.';
  }
  if (isForbiddenError(err)) {
    return 'You are not authorized to access this resource.';
  }
  if (axios.isAxiosError(err)) {
    const serverMessage = err.response?.data?.error || err.response?.data?.message;
    if (serverMessage && typeof serverMessage === 'string') {
      return serverMessage;
    }
    if (err.response?.status === 404) {
      return 'The requested resource was not found.';
    }
    if (err.response?.status === 413) {
      return 'The file uploaded exceeds the maximum allowed size.';
    }
    if (err.response?.status && err.response.status >= 500) {
      return 'The forensic processing service encountered an internal error. Please try again.';
    }
  }
  if (err instanceof Error) {
    return err.message;
  }
  return fallback;
}

/**
 * Primary configured Axios client instance for Mailiac.
 * Strictly uses withCredentials: true to send authenticated session cookies.
 */
export const api: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '',
  withCredentials: true,
  headers: {
    'Accept': 'application/json',
  },
});

// Request Interceptor: Attach browser-isolated x-session-id
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const sessionId = getOrCreateSessionId();
  if (sessionId && config.headers && !config.headers.get('x-session-id')) {
    config.headers.set('x-session-id', sessionId);
  }
  return config;
});

// Response Interceptor: Centralized 401 & 403 handler
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: string; message?: string }>) => {
    const status = error.response?.status;

    if (status === 401) {
      // 1. Recognize unauthenticated / expired session
      const isAuthCheck = error.config?.url?.includes('/api/auth/me') || error.config?.headers?.['x-skip-auth-modal'];
      if (!isAuthCheck) {
        const serverMsg = error.response?.data?.error || 'Sign in required';
        notifyUnauthorized(serverMsg);
      }

      // Create structured AuthError
      const authErr = new Error('Sign in required') as AuthError;
      authErr.isAuthError = true;
      authErr.handled = true;
      authErr.status = 401;
      return Promise.reject(authErr);
    }

    if (status === 403) {
      // 2. Recognize authorized user attempting to access forbidden resource
      // Do NOT trigger sign-in modal or login redirect
      const forbiddenErr = new Error('You are not authorized to access this resource.') as ForbiddenError;
      forbiddenErr.isForbidden = true;
      forbiddenErr.status = 403;
      return Promise.reject(forbiddenErr);
    }

    return Promise.reject(error);
  }
);

// Typed helper methods for core Mailiac workflows

export async function uploadEml(
  file: File,
  options?: { source?: 'eml' | 'sandbox' }
): Promise<{ jobId: string }> {
  const formData = new FormData();
  formData.append('eml', file);
  if (options?.source) {
    formData.append('source', options.source);
  }
  const res = await api.post<{ jobId: string }>('/api/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function getJobStatus(jobId: string): Promise<unknown> {
  const res = await api.get(`/api/jobs/${encodeURIComponent(jobId)}`);
  return res.data;
}

export async function getReport(jobId: string): Promise<unknown> {
  const res = await api.get(`/api/reports/${encodeURIComponent(jobId)}`);
  return res.data;
}

export async function getReportHistory(params?: Record<string, string>): Promise<unknown> {
  const res = await api.get('/api/reports/history', { params });
  return res.data;
}

export async function reanalyzeReport(
  caseId: string
): Promise<{ jobId?: string; messageId?: string; success?: boolean; status?: string }> {
  try {
    const res = await api.post<{ jobId?: string; messageId?: string; success?: boolean; status?: string }>(
      `/api/reports/${encodeURIComponent(caseId)}/reanalyze`
    );
    return res.data;
  } catch (err: unknown) {
    // If 409 Conflict, re-analysis is already running for this case - treat as active
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      const data = err.response.data as { jobId?: string; status?: string };
      return {
        jobId: data?.jobId || caseId,
        status: data?.status || 'processing',
        success: true,
      };
    }
    throw err;
  }
}

export async function submitFeedback(caseId: string, payload: unknown): Promise<unknown> {
  const res = await api.post(`/api/reports/${encodeURIComponent(caseId)}/feedback`, payload);
  return res.data;
}

export async function getGmailStatus(): Promise<{ connected: boolean; email?: string }> {
  const res = await api.get<{ connected: boolean; email?: string }>('/api/gmail/status');
  return res.data;
}

export async function getGmailAuthUrl(): Promise<{ url: string }> {
  const res = await api.get<{ url: string }>('/api/gmail/auth/url');
  return res.data;
}

export async function disconnectGmail(): Promise<unknown> {
  const res = await api.delete('/api/gmail/disconnect');
  return res.data;
}

export async function listGmailMessages(params?: Record<string, string>): Promise<unknown> {
  const res = await api.get('/api/gmail/messages', { params });
  return res.data;
}

export async function analyzeGmailMessage(messageId: string): Promise<{ jobId: string }> {
  const res = await api.post<{ jobId: string }>(`/api/gmail/messages/${encodeURIComponent(messageId)}/analyze`);
  return res.data;
}

export default api;
