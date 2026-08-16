import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as authApi from '../api/auth.js';
import { setAccessToken, setCurrentUserId, setOnAuthFailure } from '../api/client.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  // isLoading covers the initial "try to restore a session" attempt on
  // mount - without it, the router would briefly redirect a genuinely
  // logged-in user to /login before the silent refresh had a chance to
  // finish and prove otherwise.
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the server call fails (e.g. already logged out elsewhere),
      // the client should still forget the session locally.
    }
    setUser(null);
  }, []);

  useEffect(() => {
    // If the refresh cookie is invalid/expired/missing, this just fails
    // silently and the user lands on the login page - not an error state.
    authApi
      .restoreSession()
      .then(setUser)
      .catch(() => setAccessToken(null))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    // Wired up once, here, so a token-refresh failure anywhere in the app
    // (any API call, not just ones this component triggers) logs the user
    // out and clears state consistently. Also covers an identity mismatch
    // (client.js's refreshAccessToken) - the stale token isn't just
    // expired at that point, it's actively the wrong account, so it's
    // cleared rather than left around for the next request to resend.
    setOnAuthFailure(() => {
      setAccessToken(null);
      setCurrentUserId(null);
      setUser(null);
    });
  }, []);

  const login = useCallback(async (credentials) => {
    const loggedInUser = await authApi.login(credentials);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const register = useCallback(async (details) => {
    const registeredUser = await authApi.register(details);
    setUser(registeredUser);
    return registeredUser;
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
