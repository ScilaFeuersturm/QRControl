import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Field, notify, styles as s } from '../components/ui';
import { useSession } from '../state/session';
import type { Event } from '../state/session';
export default function NewEvent() {
 const session = useSession();
 const [name, setName] = useState(''), [date, setDate] = useState(''), [venue, setVenue] = useState(''), [capacity, setCapacity] = useState('84'), [busy, setBusy] = useState(false);
 async function create() {
  if (busy) return;
  const amount = Number(capacity);
  if (!Number.isInteger(amount) || amount < 1 || amount > 1000000) {notify('Cupo incorrecto', 'Ingresá una cantidad entera de personas entre 1 y 1.000.000.'); return;}
  setBusy(true);
  try {
   const event = await session.api<Event>('/events', 'POST', {name: name.trim(), date_label: date.trim(), venue: venue.trim(), capacity: amount});
   session.setSession({url: session.url, key: session.key, role: session.role, event}); router.replace('/guests');
  } catch(e) {notify('Evento sin confirmar', `${e instanceof Error ? e.message : 'Revisá la conexión'}. Consultá Mis eventos antes de reintentar.`, () => router.back());}
  finally {setBusy(false);}
 }
 if (session.role !== 'admin') return <Redirect href="/" />;
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><Button title="Volver a mis eventos" secondary disabled={busy} onPress={() => router.back()} /><Text style={s.brand}>ZENIT / NUEVO EVENTO</Text><Text style={s.title}>Prepará tu{'\n'}próximo encuentro.</Text><Card><Field value={name} onChangeText={setName} placeholder="Nombre del evento" maxLength={160} /><Field value={date} onChangeText={setDate} placeholder="Fecha y horario" maxLength={100} /><Field value={venue} onChangeText={setVenue} placeholder="Lugar / dirección" maxLength={160} /><Text style={s.text}>Cupo máximo de personas</Text><Field value={capacity} onChangeText={setCapacity} placeholder="84" keyboardType="number-pad" /><Text style={s.muted}>Cada compra pagada descontará su cantidad de personas. Se permite un máximo de dos eventos activos en toda la app.</Text><Button title={busy ? 'Creando…' : 'Crear y abrir invitados'} disabled={busy || !name.trim() || !date.trim() || !venue.trim()} onPress={create} /></Card></ScrollView></SafeAreaView>;
}
