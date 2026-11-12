import { useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Field, styles as s } from '../components/ui';
import { useSession } from '../state/session';
import type { Ticket } from '../state/session';
export default function NewTicket() {
 const {api, role, event} = useSession();
 const [name, setName] = useState(''), [phone, setPhone] = useState(''), [table, setTable] = useState(''), [quantity, setQuantity] = useState('1'), [paid, setPaid] = useState(false), [busy, setBusy] = useState(false);
 async function save() {
  if (busy) return;
  const count = Number(quantity);
  if (!Number.isInteger(count) || count < 1 || count > (event?.capacity ?? 0)) {Alert.alert('Cantidad incorrecta', 'Ingresá una cantidad entera dentro del cupo del evento.'); return;}
  setBusy(true);
  let created: Ticket | null = null;
  try {
   created = await api<Ticket>('/tickets', 'POST', {name: name.trim(), phone, table_name: table, quantity: count});
   if (paid) await api(`/tickets/${created.id}/payment`, 'PATCH', {paid: true});
   Alert.alert(paid ? 'Pago confirmado · QR generado' : 'Reserva registrada', paid ? 'Podés compartir la entrada desde la lista de invitados.' : 'La reserva no ocupa cupo y no tiene QR hasta confirmar el pago.');
   router.back();
  } catch(e) {
   Alert.alert(created ? 'Reserva creada · Pago sin confirmar' : 'Registro sin confirmar', `${e instanceof Error ? e.message : 'Revisá la conexión'}. Consultá la lista antes de volver a registrar la compra.`, [{text: 'Ver lista', onPress: () => router.back()}]);
  } finally {setBusy(false);}
 }
 if (!event || role !== 'admin') return <Redirect href="/" />;
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><Button title="Volver a invitados" secondary onPress={() => router.back()} disabled={busy} /><Text style={s.brand}>ZENIT / NUEVA COMPRA</Text><Text style={s.title}>Un titular.{'\n'}Un QR para su grupo.</Text><Card><Field value={name} onChangeText={setName} placeholder="Nombre del titular" maxLength={120} /><Field value={phone} onChangeText={setPhone} placeholder="Teléfono" keyboardType="phone-pad" maxLength={40} /><Field value={table} onChangeText={setTable} placeholder="Mesa" maxLength={30} /><Text style={s.text}>Cantidad de entradas</Text><Field value={quantity} onChangeText={setQuantity} keyboardType="number-pad" placeholder="1" /><View style={s.row}><Text style={[s.text, {flex: 1}]}>Ya verifiqué el pago</Text><Switch value={paid} onValueChange={setPaid} /></View><Text style={s.muted}>{paid ? `Se descontarán ${Number(quantity) || 0} plazas al confirmar el pago y se generará un QR para esta compra.` : 'Sin pago confirmado no se genera QR ni se descuenta el cupo.'}</Text><Button title={busy ? 'Registrando…' : paid ? 'Registrar compra pagada' : 'Guardar pendiente'} disabled={busy || !name.trim()} onPress={save} /></Card></ScrollView></SafeAreaView>;
}
