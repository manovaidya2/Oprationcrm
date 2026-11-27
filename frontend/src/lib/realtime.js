import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// Live updates from the server (socket.io, same host as the API). The server sends:
//  - 'notification'        a notification was written for this login
//  - 'changed' { topic }   data shown on some page changed ('payment-queries' | 'payments' | 'documents');
//                          the page refetches it through the API
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const ORIGIN = (() => { try { return new URL(API, window.location.origin).origin; } catch { return window.location.origin; } })();

let socket = null;
let socketToken = null;

export function connectRealtime() {
  let token = null;
  try { token = localStorage.getItem('crm_token'); } catch { /* storage blocked */ }
  if (!token) return null;
  if (socket && socketToken === token) return socket;
  if (socket) socket.disconnect();
  socketToken = token;
  socket = io(ORIGIN, { auth: { token }, reconnection: true });
  return socket;
}

export function disconnectRealtime() {
  if (socket) socket.disconnect();
  socket = null;
  socketToken = null;
}

export function onRealtime(event, handler) {
  const s = connectRealtime();
  if (!s) return () => {};
  s.on(event, handler);
  return () => s.off(event, handler);
}

// A page refreshes itself (quietly) when data it shows changes anywhere — another login, another tab.
export function useLiveRefresh(topics, refresh) {
  const ref = useRef(refresh);
  useEffect(() => { ref.current = refresh; });
  const key = topics.join(',');
  useEffect(() => {
    const wanted = key.split(',');
    let timer = null;
    const off = onRealtime('changed', (msg = {}) => {
      if (!wanted.includes(msg.topic)) return;
      clearTimeout(timer);
      timer = setTimeout(() => ref.current(), 400);   // several changes at once: one refresh
    });
    return () => { clearTimeout(timer); off(); };
  }, [key]);
}
