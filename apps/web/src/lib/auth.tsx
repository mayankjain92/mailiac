'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { sessionFetch } from './session';
import { onUnauthorized } from './api';
import SignInRequiredModal from '../components/SignInRequiredModal';

export interface AuthUser {
  id: string; // Internal Mailiac userId
  googleId?: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
  isSignInModalOpen: boolean;
  openSignInModal: (message?: string) => void;
  closeSignInModal: () => void;
}

/**
 * Fetches the currently authenticated Mailiac user from /api/auth/me.
 * Returns AuthUser if authenticated; null if unauthenticated or on error.
 */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await sessionFetch('/api/auth/me', {
      headers: {
        'x-skip-auth-modal': 'true',
      },
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as AuthUser | { user: AuthUser };
    const resolvedUser = 'user' in data && data.user ? data.user : (data as AuthUser);
    if (!resolvedUser || !resolvedUser.id) {
      return null;
    }
    return {
      id: resolvedUser.id,
      googleId: resolvedUser.googleId,
      email: resolvedUser.email,
      name: resolvedUser.name,
      picture: resolvedUser.picture,
    };
  } catch {
    return null;
  }
}

/**
 * Fetches the Google Sign-In authorization URL from /api/auth/google/url.
 */
export async function requestGoogleAuthUrl(): Promise<string | null> {
  try {
    const res = await sessionFetch('/api/auth/google/url');
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { url: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Dispatches a logout request to /api/auth/logout to invalidate the session.
 */
export async function logoutUser(): Promise<boolean> {
  try {
    const res = await sessionFetch('/api/auth/logout', { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSignInModalOpen, setIsSignInModalOpen] = useState<boolean>(false);
  const [signInModalMessage, setSignInModalMessage] = useState<string | null>(null);

  const openSignInModal = useCallback((message?: string): void => {
    setSignInModalMessage(message || null);
    setIsSignInModalOpen(true);
  }, []);

  const closeSignInModal = useCallback((): void => {
    setIsSignInModalOpen(false);
    setSignInModalMessage(null);
  }, []);

  const refetchUser = useCallback(async (): Promise<void> => {
    try {
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetchUser();
  }, [refetchUser]);

  // Centralized listener: Whenever an API returns 401, trigger login modal & clear stale user
  useEffect(() => {
    const unsubscribe = onUnauthorized((message) => {
      setUser(null);
      setSignInModalMessage(message || 'You need to sign in to use this feature.');
      setIsSignInModalOpen(true);
    });
    return unsubscribe;
  }, []);

  // Post-login redirect preservation: when user is authenticated, redirect to saved location if any
  useEffect(() => {
    if (user && typeof window !== 'undefined') {
      try {
        const redirectPath = sessionStorage.getItem('mailiac_redirect_after_login');
        if (redirectPath && redirectPath.startsWith('/') && !redirectPath.includes('/auth/')) {
          sessionStorage.removeItem('mailiac_redirect_after_login');
          const current = window.location.pathname + window.location.search;
          if (current !== redirectPath) {
            window.location.href = redirectPath;
          }
        }
      } catch {
        // Storage might be restricted
      }
    }
  }, [user]);

  const login = useCallback(async (): Promise<void> => {
    try {
      // Store current page for post-login return before redirecting
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname + window.location.search;
        if (!currentPath.includes('/auth/') && !currentPath.includes('auth=success')) {
          try {
            sessionStorage.setItem('mailiac_redirect_after_login', currentPath);
          } catch {
            // Storage access error handling
          }
        }
      }

      const url = await requestGoogleAuthUrl();
      if (url && typeof window !== 'undefined') {
        window.location.href = url;
      }
    } catch (err) {
      console.error('[auth] Failed to initiate Google Sign-In:', err);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await logoutUser();
    } catch (err) {
      console.error('[auth] Logout error:', err);
    } finally {
      setUser(null);
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem('mailiac_redirect_after_login');
        } catch {
          // Ignore storage error
        }
      }
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        refetchUser,
        isSignInModalOpen,
        openSignInModal,
        closeSignInModal,
      }}
    >
      {children}
      <SignInRequiredModal
        isOpen={isSignInModalOpen}
        onClose={closeSignInModal}
        onSignIn={login}
        message={signInModalMessage}
      />
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
