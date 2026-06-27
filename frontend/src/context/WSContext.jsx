import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';

const WSContext = createContext(null);

export const WSProvider = ({ children }) => {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const wsRef = useRef(null);
  const retryRef = useRef(null);
  const listeners = useRef(new Map());

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = import.meta.env.VITE_WS_URL ||
      (import.meta.env.VITE_API_URL
        ? import.meta.env.VITE_API_URL.replace(/^http/, 'ws')
        : `${protocol}//${window.location.host}/ws`);

    try {
      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        setConnected(true);
        console.log('🔌 WebSocket connected');
        if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          setLastMessage(msg);
          listeners.current.forEach((fn) => fn(msg));
        } catch {}
      };

      wsRef.current.onclose = () => {
        setConnected(false);
        retryRef.current = setTimeout(connect, 5000);
      };

      wsRef.current.onerror = () => { wsRef.current?.close(); };
    } catch {}
  }, []);

  useEffect(() => {
    connect();
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);
    return () => {
      clearInterval(pingInterval);
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const subscribe = useCallback((fn) => {
    const id = Math.random().toString(36).slice(2);
    listeners.current.set(id, fn);
    return () => listeners.current.delete(id);
  }, []);

  return (
    <WSContext.Provider value={{ connected, lastMessage, subscribe }}>
      {children}
    </WSContext.Provider>
  );
};

export const useWS = () => useContext(WSContext);
