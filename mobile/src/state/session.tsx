import { ApiError, requestJson } from '../lib/api';
import { readItem, removeItem, writeItem } from '../lib/storage';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
export { ApiError } from '../lib/api';
export type Event = {id: number; name: string; date_label: string; venue: string; capacity: number; active: boolean};
export type Ticket = {id: number; name: string; phone?: string; table_name: string; quantity: number; admitted_count: number; remaining: number; paid: boolean; used_at: string | null};
export type Summary = {paid: number; admitted: number; capacity: number; available: number; purchases: number};
export type Session = {url: string; key: string; role: string; event: Event | null};
type SessionContext = Session & {setSession: (value: Session) => void; api: <T>(path: string, method?: string, body?: unknown) => Promise<T>; logout: () => void; restoring: boolean};
const Context = createContext<SessionContext | null>(null);
const STORAGE_KEY = 'qrcontrol-session';
const EMPTY: Session = {url: '', key: '', role: '', event: null};
// Solo se recuerdan sesiones de usuario y contraseña (token que vence y se puede revocar), nunca la clave larga de administración.
const rememberable = (value: Session) => value.key.startsWith('s2.') && !!value.url;

export function SessionProvider({children}: PropsWithChildren) {
 const [session, setState] = useState<Session>(EMPTY), [restoring, setRestoring] = useState(true);
 useEffect(() => {
  readItem(STORAGE_KEY).then(raw => {
   try {const saved = raw ? JSON.parse(raw) as Session : null; if (saved && rememberable(saved)) setState(saved);} catch {}
  }).finally(() => setRestoring(false));
 }, []);
 const setSession = useCallback((value: Session) => {
  setState(value);
  if (rememberable(value)) writeItem(STORAGE_KEY, JSON.stringify(value)); else removeItem(STORAGE_KEY);
 }, []);
 const logout = useCallback(() => {setState(EMPTY); removeItem(STORAGE_KEY);}, []);
 const api = useCallback(async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
  const scoped = path + (path.includes('?') ? '&' : '?') + `event_id=${session.event?.id ?? 1}`;
  try {return await requestJson<T>(session.url, scoped, {key: session.key, method, body});}
  catch (e) {
   // Sesión vencida, contraseña cambiada o usuario eliminado: se vuelve al inicio de sesión.
   if (e instanceof ApiError && e.status === 401) {logout(); throw new Error('Tu sesión venció o fue cerrada. Volvé a iniciar sesión.');}
   throw e;
  }
 }, [session, logout]);
 return <Context.Provider value={{...session, setSession, api, logout, restoring}}>{children}</Context.Provider>;
}
export function useSession() {const context = useContext(Context); if (!context) throw new Error('Sesión no disponible'); return context;}
