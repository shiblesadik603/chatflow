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
const refreshAccessToken = () => {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post('/api/auth/refresh')
      .then((res) => {
        const token = res.data.data.accessToken;
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
