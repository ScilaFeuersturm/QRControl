import { brand } from '../config/brand';
import { ApiError, normalizeServerUrl, normalizeTeamKey, requestJson } from '../lib/api';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Field, PasswordField, notify, styles as s } from '../components/ui';
import { useSession } from '../state/session';
import type { Event } from '../state/session';
export default function Login() {
 const {setSession} = useSession();
 const [url, setUrl] = useState(process.env.EXPO_PUBLIC_API_URL || '');
 const [username, setUsername] = useState(''), [authKey, setAuthKey] = useState('');
 const [key, setKey] = useState(''), [busy, setBusy] = useState(false), [events, setEvents] = useState<Event[]>([]), [role, setRole] = useState('');
 const [stage, setStage] = useState('');
 const pending = useRef<AbortController | null>(null);
 useEffect(() => () => pending.current?.abort(), []);
 async function connect() {
  if (pending.current) return;
  let base: string, teamKey = '';
  const user = username.trim().toLowerCase();
  // Con usuario: personal de puerta (usuario + contraseña). Sin usuario: clave de administración.
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
   setUrl(base); setAuthKey(teamKey); setRole(auth.role); setEvents(list);
  } catch (e) {if (!controller.signal.aborted) notify('No se pudo conectar', e instanceof Error ? e.message : 'Revisá la conexión');}
  finally {pending.current = null; setBusy(false); setStage('');}
 }
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><Text style={s.brand}>{brand.name.toUpperCase()} / ACCESS</Text><Text style={s.title}>Tus eventos.{'\n'}Cada ingreso cuenta.</Text><Text style={s.muted}>Gestión de entradas y recepción</Text>
 <Card><Text style={s.heading}>Conectar al servidor</Text><Field value={url} onChangeText={v => {setUrl(v); setEvents([]);}} placeholder="URL del servidor" autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} /><Field value={username} onChangeText={v => {setUsername(v); setEvents([]);}} placeholder="Usuario (vacío para administración)" autoCapitalize="none" autoCorrect={false} autoComplete="username" editable={!busy} /><PasswordField value={key} onChangeText={v => {setKey(v); setEvents([]);}} placeholder={username.trim() ? 'Contraseña' : 'Clave de administración'} editable={!busy} /><Text style={s.muted}>Personal de puerta: usuario y contraseña. Administración: dejá el usuario vacío y usá la clave de administración.</Text><Button title={busy ? stage : 'Ver eventos'} disabled={busy || !key} onPress={connect} />{busy && <><Text style={s.muted}>El primer acceso puede tardar hasta 90 segundos si el servidor estaba suspendido.</Text><Button title="Cancelar conexión" secondary onPress={() => pending.current?.abort()} /></>}</Card>
 {role === 'admin' && events.length > 0 && <Button title="Administrar / crear eventos" secondary onPress={() => {setSession({url, key: authKey, role, event: null}); router.push('/events');}} />}
 {events.map(event => <Card key={event.id}><Text style={s.heading}>{event.name}</Text><Text style={s.muted}>{event.date_label} · {event.capacity} plazas · {event.active ? 'Activo' : 'Archivado'}</Text><Button title="Abrir invitados" onPress={() => {setSession({url, key: authKey, role, event}); router.replace('/guests');}} /></Card>)}
 <Text style={s.muted}>Las claves permanecen en memoria. Para ensayar, seleccioná el evento PRUEBA y utilizá sus QR.</Text></ScrollView></SafeAreaView>;
}
