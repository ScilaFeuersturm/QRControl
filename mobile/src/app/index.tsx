import { brand } from '../config/brand';
import { useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Field, styles as s } from '../components/ui';
import { useSession } from '../state/session';
import type { Event } from '../state/session';
export default function Login() {
 const {setSession} = useSession();
 const [url, setUrl] = useState(process.env.EXPO_PUBLIC_API_URL || '');
 const [key, setKey] = useState(''), [busy, setBusy] = useState(false), [events, setEvents] = useState<Event[]>([]), [role, setRole] = useState('');
 async function connect() {
  setBusy(true);
  try {
   const get = async (path: string) => {
    const r = await fetch(url.replace(/\/$/, '') + path, {headers: {Authorization: `Bearer ${key}`}, signal: AbortSignal.timeout(12000)});
    const value = await r.json(); if (!r.ok) throw new Error(value.detail || 'No se pudo conectar'); return value;
   };
   const [auth, list] = await Promise.all([get('/session'), get('/events')]); setRole(auth.role); setEvents(list);
  } catch(e) {Alert.alert('No se pudo conectar', e instanceof Error ? e.message : 'Revisá la conexión');} finally {setBusy(false);}
 }
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><Text style={s.brand}>{brand.name.toUpperCase()} / ACCESS</Text><Text style={s.title}>Tus eventos.{'\n'}Cada ingreso cuenta.</Text><Text style={s.muted}>Gestión de entradas y recepción</Text>
 <Card><Text style={s.heading}>Conectar al servidor</Text><Field value={url} onChangeText={v => {setUrl(v); setEvents([]);}} placeholder="URL del servidor" autoCapitalize="none" /><Field value={key} onChangeText={v => {setKey(v); setEvents([]);}} placeholder="Clave del equipo" autoCapitalize="none" secureTextEntry /><Button title={busy ? 'Conectando…' : 'Ver eventos'} disabled={busy || !key} onPress={connect} /></Card>
 {role === 'admin' && <Button title="Administrar / crear eventos" secondary onPress={() => {setSession({url, key, role, event: null}); router.push('/events');}} />}
 {events.map(event => <Card key={event.id}><Text style={s.heading}>{event.name}</Text><Text style={s.muted}>{event.date_label} · {event.capacity} plazas · {event.active ? 'Activo' : 'Archivado'}</Text><Button title="Abrir invitados" onPress={() => {setSession({url, key, role, event}); router.replace('/guests');}} /></Card>)}
 <Text style={s.muted}>Las claves permanecen en memoria. Para ensayar, seleccioná el evento PRUEBA y utilizá sus QR.</Text></ScrollView></SafeAreaView>;
}
