import { requestJson } from '../lib/api';
import { createContext, useCallback, useContext, useState } from 'react';
import type { PropsWithChildren } from 'react';
export { ApiError } from '../lib/api';
export type Event = {id: number; name: string; date_label: string; venue: string; capacity: number; active: boolean};
export type Ticket = {id: number; name: string; phone?: string; table_name: string; quantity: number; admitted_count: number; remaining: number; paid: boolean; used_at: string | null};
export type Summary = {paid: number; admitted: number; capacity: number; available: number; purchases: number};
type Session = {url: string; key: string; role: string; event: Event | null};
type SessionContext = Session & {setSession: (value: Session) => void; api: <T>(path: string, method?: string, body?: unknown) => Promise<T>; logout: () => void};
const Context = createContext<SessionContext | null>(null);
export function SessionProvider({children}: PropsWithChildren) {
 const [session, setSession] = useState<Session>({url: '', key: '', role: '', event: null});
 const api = useCallback(async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
  const scoped = path + (path.includes('?') ? '&' : '?') + `event_id=${session.event?.id ?? 1}`;
  return requestJson<T>(session.url, scoped, {key: session.key, method, body});
 }, [session]);
 return <Context.Provider value={{...session, setSession, api, logout: () => setSession({url: '', key: '', role: '', event: null})}}>{children}</Context.Provider>;
}
export function useSession() {const context = useContext(Context); if (!context) throw new Error('Sesión no disponible'); return context;}
