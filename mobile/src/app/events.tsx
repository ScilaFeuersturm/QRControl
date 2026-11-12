import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, styles as s } from '../components/ui';
import { useSession } from '../state/session';
import type { Event } from '../state/session';
export default function Events() {
 const session = useSession(), {api, role} = session;
 const [events, setEvents] = useState<Event[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
 const refresh = useCallback(async () => {try {setEvents(await api<Event[]>('/events')); setError('');} catch {setError('No se pudieron cargar los eventos. Revisá la conexión.');}}, [api]);
 useFocusEffect(useCallback(() => {if (role) refresh();}, [role, refresh]));
 const activeCount = events.filter(e => e.active).length;
 function changeStatus(event: Event) {
  Alert.alert(event.active ? 'Archivar evento' : 'Reactivar evento', event.active ? 'Se conservarán invitados e historial. No se podrán emitir QR ni registrar ingresos mientras esté archivado.' : 'Volverá a ocupar uno de los dos lugares para eventos activos.', [{text: 'Cancelar', style: 'cancel'}, {text: 'Confirmar', onPress: async () => {
   setBusy(true);
   try {const updated = await api<Event>(`/events/${event.id}/status`, 'PATCH', {active: !event.active}); if (session.event?.id === event.id) session.setSession({url: session.url, key: session.key, role, event: updated}); await refresh();}
   catch(e) {Alert.alert('No se pudo cambiar', e instanceof Error ? e.message : 'Revisá la conexión');}
   finally {setBusy(false);}
  }}]);
 }
 if (!role) return <Redirect href="/" />;
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content}><Text style={s.brand}>ZENIT / MIS EVENTOS</Text><Text style={s.title}>Cada evento,{'\n'}su propia lista.</Text><Text style={s.muted}>{activeCount} de 2 eventos activos. Podés archivar uno y conservar su historial para crear otro.</Text>{error ? <Text style={s.muted}>{error}</Text> : null}
 {role === 'admin' && <Button title="Usuarios de escaneo" secondary onPress={() => router.push('/scanner-users')} />}
 {role === 'admin' && <Button title="Crear evento" disabled={busy || activeCount >= 2 || !!error} onPress={() => router.push('/new-event')} />}
 {events.map(event => <Card key={event.id}><Text style={s.heading}>{event.name}</Text><Text style={s.muted}>{event.active ? 'Activo' : 'Archivado'} · {event.capacity} personas</Text><Text style={s.muted}>{event.date_label} · {event.venue}</Text><Button title={event.active ? 'Abrir invitados' : 'Ver historial'} disabled={busy} onPress={() => {session.setSession({url: session.url, key: session.key, role, event}); router.replace('/guests');}} />{role === 'admin' && <Button title={event.active ? 'Archivar evento' : 'Reactivar evento'} secondary disabled={busy || (!event.active && activeCount >= 2)} onPress={() => changeStatus(event)} />}</Card>)}
 <View style={s.divider} /><Button title="Cerrar sesión" secondary onPress={() => {session.logout(); router.replace('/');}} /></ScrollView></SafeAreaView>;
}
