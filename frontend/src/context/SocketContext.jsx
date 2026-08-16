import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken, refreshAccessToken, triggerAuthFailure } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext(null);

const API_URL = import.meta.env.VITE_API_URL;

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user) {
      socketRef.current?.close();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
      return;
    }

    const s = io(API_URL, {
      auth: { token: getAccessToken() },
      transports: ['websocket'],
    });

    s.on('authenticated', () => setIsConnected(true));
    s.on('disconnect', () => setIsConnected(false));

    // The access token is short-lived (15 min, Phase 3) and this
    // connection can easily outlive one - if the socket handshake fails
    // because the token expired, get a fresh one via the same
    // identity-checked refresh the HTTP client uses (client.js's
    // refreshAccessToken, not authApi.restoreSession - that second one
    // skips the check on purpose for the initial page-load case, which
    // would let this reconnect silently adopt a different account's
    // identity if another account's login currently owns the shared
    // refresh cookie), then retry the connection with it.
    s.on('connect_error', async (err) => {
      if (err.data?.code === 'TOKEN_EXPIRED') {
        try {
          await refreshAccessToken();
          s.auth.token = getAccessToken();
          s.connect();
        } catch {
          // Refresh failed, including an identity mismatch - the whole
          // session is over, not just the socket.
          triggerAuthFailure();
        }
      }
    });

    socketRef.current = s;
    setSocket(s);

    return () => {
      s.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return <SocketContext.Provider value={{ socket, isConnected }}>{children}</SocketContext.Provider>;
};

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
};
