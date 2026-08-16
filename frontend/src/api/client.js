import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

// The access token lives in memory only (this module-level variable), never
// localStorage - the backend's whole refresh-token design (Phase 3) assumes
// the access token isn't persisted anywhere a stored-XSS payload could read
// it back out. It's lost on a hard refresh, which is fine: AuthContext
// calls /api/auth/refresh on mount to silently restore a session from the
// httpOnly refresh cookie instead.
let accessToken = null;
export const setAccessToken = (token) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken;

// Tracks which user *this tab* believes it's logged in as, so a silent
// refresh (below) can detect when it silently comes back as someone else.
// That happens when two accounts share one browser: the httpOnly refresh
// cookie is per-origin, not per-tab, so whichever account logged in most
// recently anywhere in this browser owns the cookie. Without this check, a
// tab whose own access token expires would silently start acting as that
// other account instead of erroring - a real identity mix-up, not just a
// stale-UI problem.
let currentUserId = null;
export const setCurrentUserId = (id) => {
  currentUserId = id;
};

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true, // sends/receives the httpOnly refresh cookie
});

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// A separate, bare axios instance for the refresh call itself - it must
// not go through the response interceptor below, or a failed refresh
// would try to refresh again and loop forever.
const refreshClient = axios.create({ baseURL: API_URL, withCredentials: true });

let refreshPromise = null;

// Concurrent requests that all 401 at once (e.g. a page that fires several
// API calls on load) must not each trigger their own refresh call - that
// would race multiple rotations against the same refresh token and only
// one could win. Sharing one in-flight promise means the second and third
// callers just await the first call's result instead of starting their own.
export const refreshAccessToken = () => {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post('/api/auth/refresh')
      .then((res) => {
        const { accessToken: token, user } = res.data.data;
        // currentUserId is only null before any user has ever been
        // established in this tab (e.g. AuthContext's restoreSession call
        // uses a separate path and hasn't set it yet) - nothing to compare
        // against yet, so any identity is accepted. Once a user IS known,
        // a mismatch means the shared cookie now belongs to a different
        // account, and adopting it silently would mean this tab starts
        // acting as that other person without any explicit login.
        if (currentUserId && user._id !== currentUserId) {
          throw new Error('IDENTITY_MISMATCH');
        }
        setAccessToken(token);
        return token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

// Registered by AuthContext once it mounts - lets this module trigger a
// full logout (clear state, redirect) without importing React context
// logic into a plain axios config file.
let onAuthFailure = () => {};
export const setOnAuthFailure = (handler) => {
  onAuthFailure = handler;
};
// Lets other modules (SocketContext's own expired-token reconnect path)
// trigger the same logout AuthContext registered here, without each of
// them needing their own copy of "what does a failed session mean".
export const triggerAuthFailure = () => onAuthFailure();

apiClient.interceptors.response.use(
  (res) => res,
  async (err) => {
    const { config, response } = err;
    const isTokenExpired = response?.status === 401 && response.data?.errorCode === 'TOKEN_EXPIRED';

    if (isTokenExpired && !config._retried) {
      config._retried = true; // never retry the same request more than once
      try {
        const newToken = await refreshAccessToken();
        config.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(config);
      } catch (refreshErr) {
        onAuthFailure();
        return Promise.reject(refreshErr);
      }
    }

    if (response?.status === 401 && response.data?.errorCode !== 'INVALID_CREDENTIALS') {
      // Any other 401 (invalid token, not authenticated at all) - not
      // worth trying to refresh, just log out. INVALID_CREDENTIALS is
      // excluded because that's a normal failed-login-attempt response,
      // not a session problem.
      onAuthFailure();
    }

    return Promise.reject(err);
  }
);
