/**
 * Session state.
 *
 * The session is restored from `GET /auth/session` rather than from a token
 * stored in memory: the access token is an httpOnly cookie the app cannot
 * read, so there is nothing to hydrate from. A reload therefore asks the
 * server who it is, which is also what makes revocation take effect
 * immediately instead of at the next expiry.
 *
 * `permissions` lives here as a Set because route guards and button
 * rendering both ask the same question constantly, and a linear scan of a
 * 128-element array on every render is waste for a lookup done that often.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SessionUser } from '@mcc/shared';
import { ApiError, api } from '@/lib/api';

export interface LoginResult {
  readonly status: 'authenticated';
  readonly accessToken: string;
  readonly expiresIn: number;
}

interface SessionContextValue {
  readonly session: SessionUser | null;
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
  readonly can: (permission: string) => boolean;
  readonly canAny: (...permissions: string[]) => boolean;
  readonly login: (input: { email: string; password: string }) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly isLoggingIn: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery<SessionUser | null, ApiError>({
    queryKey: ['session'],
    queryFn: async () => {
      try {
        return await api.get<SessionUser>('/auth/session');
      } catch (error) {
        // Signed out is a normal state, not an error to render: the query
        // resolves to null and the router shows the login screen.
        if (ApiError.is(error) && (error.status === 401 || error.code === 'SESSION_EXPIRED')) {
          return null;
        }
        throw error;
      }
    },
    // The session does not change on its own; refetching it on window focus
    // would be a request per tab switch for a value that only the server's
    // own auth routes alter.
    staleTime: Infinity,
    retry: false,
  });

  const loginMutation = useMutation<LoginResult, ApiError, { email: string; password: string }>({
    mutationFn: (input) => api.postAuth<LoginResult>('/auth/login', input),
    onSuccess: async () => {
      // Drop every cached response: the caches were populated under the
      // previous identity, and a tenant switch must not show them.
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });

  const logoutMutation = useMutation<void, ApiError, void>({
    mutationFn: () => api.postAuth<void>('/auth/logout'),
    onSettled: async () => {
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });

  const session = sessionQuery.data ?? null;

  const permissionSet = useMemo(
    () => new Set(session?.permissions ?? []),
    [session?.permissions],
  );

  const can = useCallback((permission: string) => permissionSet.has(permission), [permissionSet]);

  const canAny = useCallback(
    (...permissions: string[]) => permissions.some((permission) => permissionSet.has(permission)),
    [permissionSet],
  );

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      await loginMutation.mutateAsync(input);
    },
    [loginMutation],
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      isLoading: sessionQuery.isLoading,
      isAuthenticated: session !== null,
      can,
      canAny,
      login,
      logout,
      isLoggingIn: loginMutation.isPending,
    }),
    [
      session,
      sessionQuery.isLoading,
      can,
      canAny,
      login,
      logout,
      loginMutation.isPending,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error('useSession must be used inside <SessionProvider>');
  }
  return value;
}
