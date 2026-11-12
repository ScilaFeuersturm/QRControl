import { createContext, useCallback, useContext, useState } from 'react';
import type { PropsWithChildren } from 'react';
export type Event = {id: number; name: string; date_label: string; venue: string; capacity: number; active: boolean};
export type Ticket = {id: number; name: string; phone?: string; table_name: string; quantity: number; admitted_count: number; remaining: number; paid: boolean; used_at: string | null};
export type Summary = {paid: number; admitted: number; capacity: number; available: number; purchases: number};
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
type Session = {url: string; key: string; role: string; event: Event | null};
type SessionContext = Session & {setSession: (value: Session) => void; api: <T>(path: string, method?: string, body?: unknown) => Promise<T>; logout: () => void};
const Context = createContext<SessionContext | null>(null);
export function SessionProvider({children}: PropsWithChildren) {
 const [session, setSession] = useState<Session>({url: '', key: '', role: '', event: null});
 const api = useCallback(async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
  const scoped = path + (path.includes('?') ? '&' : '?') + `event_id=${session.event?.id ?? 1}`;
  const response = await fetch(session.url.replace(/\/$/, '') + scoped, {method, headers: {Authorization: `Bearer ${session.key}`, 'Content-Type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000)});
  const value = await response.json();
  if (!response.ok) throw new ApiError(typeof value.detail === 'string' ? value.detail : 'Revisá los datos ingresados', response.status);
  return value as T;
 }, [session]);
 return <Context.Provider value={{...session, setSession, api, logout: () => setSession({url: '', key: '', role: '', event: null})}}>{children}</Context.Provider>;
}
export function useSession() {const context = useContext(Context); if (!context) throw new Error('Sesión no disponible'); return context;}
