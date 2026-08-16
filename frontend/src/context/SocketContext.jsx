import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken } from '../api/client.js';
import * as authApi from '../api/auth.js';
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
    // because the token expired, get a fresh one via the same silent
    // refresh AuthContext uses on load, then retry the connection with it
    // instead of leaving the socket stuck retrying with a token that will
    // never become valid again.
    s.on('connect_error', async (err) => {
      if (err.data?.code === 'TOKEN_EXPIRED') {
        try {
          await authApi.restoreSession();
          s.auth.token = getAccessToken();
          s.connect();
        } catch {
          // Refresh itself failed - the whole session is over, not just
          // the socket. AuthContext's own axios interceptor handles
          // logging the user out; nothing more to do here.
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
