import { ApiError, normalizeServerUrl, normalizeTeamKey, requestJson } from '../lib/api';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Field, PasswordField, notify, styles as s } from '../components/ui';
import { useSession } from '../state/session';
import type { Event } from '../state/session';
export default function Login() {
 const session = useSession(), {setSession, restoring} = session;
 const [url, setUrl] = useState(process.env.EXPO_PUBLIC_API_URL || 'https://zenit-control-qr-api-6bp6.onrender.com');
 const [username, setUsername] = useState(''), [authKey, setAuthKey] = useState('');
 const [key, setKey] = useState(''), [busy, setBusy] = useState(false), [events, setEvents] = useState<Event[]>([]), [role, setRole] = useState('');
 const [stage, setStage] = useState('');
 const pending = useRef<AbortController | null>(null), resumed = useRef(false);
 useEffect(() => () => pending.current?.abort(), []);

 // Retoma la sesión recordada en el dispositivo, si el servidor todavía la acepta.
 useEffect(() => {
  if (restoring || resumed.current) return;
  resumed.current = true;
  if (!session.key) return;
  const saved = {url: session.url, key: session.key, role: session.role, event: session.event};
  const controller = new AbortController(); pending.current = controller;
  (async () => {
   try {
    setBusy(true); setStage('Retomando la sesión…');
    await requestJson(saved.url, '/health', {timeoutMs: 90000, signal: controller.signal});
    const auth = await requestJson<{role: string}>(saved.url, '/session', {key: saved.key, signal: controller.signal});
    const list = await requestJson<Event[]>(saved.url, '/events', {key: saved.key, signal: controller.signal});
    setUrl(saved.url); setAuthKey(saved.key); setRole(auth.role); setEvents(list);
    const event = saved.event && list.find(e => e.id === saved.event?.id);
    if (event) {setSession({...saved, role: auth.role, event}); router.replace('/guests');}
   } catch (e) {
    if (e instanceof ApiError && e.status === 401) {session.logout(); notify('Volvé a iniciar sesión', 'Tu sesión venció o fue cerrada.');}
    else if (!controller.signal.aborted) notify('No se pudo conectar', e instanceof Error ? e.message : 'Revisá la conexión');
   } finally {pending.current = null; setBusy(false); setStage('');}
  })();
 }, [restoring, session, setSession]);

 async function connect() {
  if (pending.current) return;
  let base: string, teamKey = '';
  const user = username.trim().toLowerCase();
  // Con usuario: usuario y contraseña (personal de puerta o admin). Sin usuario: clave larga de administración.
  try {base = normalizeServerUrl(url); if (!user) teamKey = normalizeTeamKey(key);} catch (e) {notify('Revisá los datos', e instanceof Error ? e.message : 'URL o clave incorrecta'); return;}
  const controller = new AbortController(); pending.current = controller;
  setBusy(true); setEvents([]); setRole(''); setStage('Conectando al servidor…');
  try {
   await requestJson(base, '/health', {timeoutMs: 90000, signal: controller.signal});
   setStage(user ? 'Verificando usuario…' : 'Verificando la clave…');
   if (user) {
    try {teamKey = (await requestJson<{token: string}>(base, '/login', {method: 'POST', body: {username: user, password: key}, signal: controller.signal})).token;}
    catch (e) {throw e instanceof ApiError && e.status === 401 ? new Error('Usuario o contraseña incorrectos.') : e;}
   }
   const auth = await requestJson<{role: string}>(base, '/session', {key: teamKey, signal: controller.signal});
   const list = await requestJson<Event[]>(base, '/events', {key: teamKey, signal: controller.signal});
   setUrl(base); setAuthKey(teamKey); setRole(auth.role); setEvents(list); setKey('');
   setSession({url: base, key: teamKey, role: auth.role, event: null});
  } catch (e) {if (!controller.signal.aborted) notify('No se pudo conectar', e instanceof Error ? e.message : 'Revisá la conexión');}
  finally {pending.current = null; setBusy(false); setStage('');}
 }
 function logout() {session.logout(); setRole(''); setEvents([]); setAuthKey(''); setKey('');}

 const loggedIn = !!role && !!authKey;
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><Text style={s.brand}>ZENIT / ACCESS</Text><Text style={s.title}>Una noche única.{'\n'}Cada ingreso cuenta.</Text><Text style={s.muted}>Gestión de entradas y recepción</Text>
 {loggedIn ? <Card><Text style={s.heading}>Sesión iniciada</Text><Text style={s.muted}>{role === 'admin' ? 'Administración' : 'Personal de puerta'}. La sesión queda recordada en este dispositivo durante 30 días.</Text>
  {role !== 'admin' && <Button title="Cambiar mi contraseña" secondary onPress={() => router.push('/account')} />}
  <Button title="Cerrar sesión" secondary onPress={logout} /></Card>
 : <Card><Text style={s.heading}>Conectar al servidor</Text><Field value={url} onChangeText={v => {setUrl(v); setEvents([]);}} placeholder="URL del servidor" autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} /><Field value={username} onChangeText={v => {setUsername(v); setEvents([]);}} placeholder="Usuario" autoCapitalize="none" autoCorrect={false} autoComplete="username" editable={!busy} /><PasswordField value={key} onChangeText={v => {setKey(v); setEvents([]);}} placeholder={username.trim() ? 'Contraseña' : 'Contraseña (o clave larga de administración)'} editable={!busy} /><Text style={s.muted}>Ingresá con tu usuario y contraseña. Administración usa el usuario «admin».</Text><Button title={busy ? stage : 'Ingresar'} disabled={busy || !key} onPress={connect} />{busy && <><Text style={s.muted}>El primer acceso puede tardar hasta 90 segundos si el servidor estaba suspendido.</Text><Button title="Cancelar conexión" secondary onPress={() => pending.current?.abort()} /></>}</Card>}
 {busy && loggedIn && <Text style={s.muted}>{stage}</Text>}
 {role === 'admin' && events.length > 0 && <Button title="Administrar / crear eventos" secondary onPress={() => {setSession({url, key: authKey, role, event: null}); router.push('/events');}} />}
 {events.map(event => <Card key={event.id}><Text style={s.heading}>{event.name}</Text><Text style={s.muted}>{event.date_label} · {event.capacity} plazas · {event.active ? 'Activo' : 'Archivado'}</Text><Button title="Abrir invitados" onPress={() => {setSession({url, key: authKey, role, event}); router.replace('/guests');}} /></Card>)}
 <Text style={s.muted}>Para ensayar, seleccioná el evento PRUEBA: podés registrar compras, confirmar pagos, descargar los QR y escanearlos.</Text></ScrollView></SafeAreaView>;
}
