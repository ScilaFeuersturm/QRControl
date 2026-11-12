import { brand } from '../config/brand';
import { useCallback, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Field, confirmAction, notify, styles as s } from '../components/ui';
import { useSession } from '../state/session';

type ScannerUser = {id: number; name: string; created_at: string};
type Created = ScannerUser & {key: string};

export default function ScannerUsers() {
 const {api, role} = useSession();
 const [users, setUsers] = useState<ScannerUser[]>([]), [max, setMax] = useState(3);
 const [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
 const [created, setCreated] = useState<Created | null>(null), [copied, setCopied] = useState(false);
 const refresh = useCallback(async () => {
  try {const data = await api<{max: number; users: ScannerUser[]}>('/scanner-users'); setUsers(data.users); setMax(data.max); setError('');}
  catch {setError('No se pudieron cargar los usuarios. Revisá la conexión.');}
 }, [api]);
 useFocusEffect(useCallback(() => {if (role === 'admin') refresh();}, [role, refresh]));

 async function create() {
  setBusy(true);
  try {const user = await api<Created>('/scanner-users', 'POST', {name}); setCreated(user); setCopied(false); setName(''); await refresh();}
  catch (e) {notify('No se pudo crear', e instanceof Error ? e.message : 'Revisá la conexión');}
  finally {setBusy(false);}
 }
 function remove(user: ScannerUser) {
  confirmAction('Eliminar usuario', `${user.name} dejará de poder ingresar y escanear QR de inmediato.`, 'Eliminar', async () => {
   setBusy(true);
   try {await api<null>(`/scanner-users/${user.id}`, 'DELETE'); if (created?.id === user.id) setCreated(null); await refresh();}
   catch (e) {notify('No se pudo eliminar', e instanceof Error ? e.message : 'Revisá la conexión');}
   finally {setBusy(false);}
  });
 }
 async function copy() {
  if (!created) return;
  try {await navigator.clipboard.writeText(created.key); setCopied(true);} catch {notify('No se pudo copiar', 'Seleccioná la clave y copiala manualmente.');}
 }

 if (role !== 'admin') return <Redirect href="/" />;
 const full = users.length >= max;
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
  <Text style={s.brand}>{brand.name.toUpperCase()} / USUARIOS</Text>
  <Text style={s.title}>Usuarios de{'\n'}escaneo.</Text>
  <Text style={s.muted}>{users.length} de {max} usuarios. Cada uno ingresa con su propia clave y solo puede leer QR y registrar ingresos.</Text>
  {error ? <Text style={s.muted}>{error}</Text> : null}
  {created && <Card>
   <Text style={s.heading}>Clave de {created.name}</Text>
   <Text style={s.muted}>Copiala y compartila por un medio privado. No se vuelve a mostrar: si se pierde, eliminá el usuario y creá otro.</Text>
   <Text selectable style={[s.text, {fontFamily: Platform.OS === 'web' ? 'monospace' : undefined}]}>{created.key}</Text>
   {Platform.OS === 'web' && <Button title={copied ? 'Copiada' : 'Copiar clave'} onPress={copy} />}
   <Button title="Listo" secondary onPress={() => setCreated(null)} />
  </Card>}
  <Card>
   <Text style={s.heading}>Nuevo usuario</Text>
   <Field value={name} onChangeText={setName} placeholder="Nombre (ej.: Puerta principal)" maxLength={60} editable={!busy && !full} />
   <Button title={full ? `Límite de ${max} alcanzado` : 'Crear usuario'} disabled={busy || full || !name.trim()} onPress={create} />
  </Card>
  {users.map(user => <Card key={user.id}>
   <View style={s.row}><Text style={s.heading}>{user.name}</Text><Text style={s.muted}>{new Date(user.created_at).toLocaleDateString()}</Text></View>
   <Button title="Eliminar" secondary disabled={busy} onPress={() => remove(user)} />
  </Card>)}
  <View style={s.divider} /><Button title="Volver a mis eventos" secondary onPress={() => router.back()} />
 </ScrollView></SafeAreaView>;
}
