import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Field, PasswordField, confirmAction, notify, styles as s } from '../components/ui';
import { useSession } from '../state/session';

type ScannerUser = {id: number; username: string; created_at: string};
const USERNAME = /^[a-z0-9._-]{3,30}$/;

// Devuelve el problema de la contraseña, o null si es válida. El servidor vuelve a validar lo mismo.
function passwordProblem(password: string, username: string): string | null {
 if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
 if (password !== password.trim()) return 'La contraseña no puede empezar ni terminar con espacios.';
 if (password.toLowerCase() === username) return 'La contraseña no puede ser igual al usuario.';
 return null;
}

export default function ScannerUsers() {
 const {api, role} = useSession();
 const [users, setUsers] = useState<ScannerUser[]>([]), [max, setMax] = useState(3);
 const [username, setUsername] = useState(''), [password, setPassword] = useState('');
 const [busy, setBusy] = useState(false), [error, setError] = useState('');
 const [editing, setEditing] = useState<number | null>(null), [newPassword, setNewPassword] = useState('');
 const refresh = useCallback(async () => {
  try {const data = await api<{max: number; users: ScannerUser[]}>('/scanner-users'); setUsers(data.users); setMax(data.max); setError('');}
  catch {setError('No se pudieron cargar los usuarios. Revisá la conexión.');}
 }, [api]);
 useFocusEffect(useCallback(() => {if (role === 'admin') refresh();}, [role, refresh]));

 const user = username.trim().toLowerCase();
 async function create() {
  if (!USERNAME.test(user)) {notify('Revisá el usuario', 'Usá entre 3 y 30 caracteres: letras sin acentos, números, punto, guion o guion bajo. Sin espacios.'); return;}
  const problem = passwordProblem(password, user);
  if (problem) {notify('Revisá la contraseña', problem); return;}
  setBusy(true);
  try {await api<ScannerUser>('/scanner-users', 'POST', {username: user, password}); notify('Usuario creado', `Ya puede ingresar con el usuario «${user}» y la contraseña elegida.`); setUsername(''); setPassword(''); await refresh();}
  catch (e) {notify('No se pudo crear', e instanceof Error ? e.message : 'Revisá la conexión');}
  finally {setBusy(false);}
 }
 async function changePassword(target: ScannerUser) {
  const problem = passwordProblem(newPassword, target.username);
  if (problem) {notify('Revisá la contraseña', problem); return;}
  setBusy(true);
  try {await api<ScannerUser>(`/scanner-users/${target.id}/password`, 'PATCH', {password: newPassword}); notify('Contraseña cambiada', `${target.username} tiene que volver a ingresar con la contraseña nueva.`); setEditing(null); setNewPassword('');}
  catch (e) {notify('No se pudo cambiar', e instanceof Error ? e.message : 'Revisá la conexión');}
  finally {setBusy(false);}
 }
 function remove(target: ScannerUser) {
  confirmAction('Eliminar usuario', `${target.username} dejará de poder ingresar y escanear QR de inmediato.`, 'Eliminar', async () => {
   setBusy(true);
   try {await api<null>(`/scanner-users/${target.id}`, 'DELETE'); if (editing === target.id) setEditing(null); await refresh();}
   catch (e) {notify('No se pudo eliminar', e instanceof Error ? e.message : 'Revisá la conexión');}
   finally {setBusy(false);}
  });
 }

 if (role !== 'admin') return <Redirect href="/" />;
 const full = users.length >= max;
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
  <Text style={s.brand}>ZENIT / USUARIOS</Text>
  <Text style={s.title}>Usuarios de{'\n'}escaneo.</Text>
  <Text style={s.muted}>{users.length} de {max} usuarios. Cada uno ingresa con su usuario y contraseña, y solo puede leer QR y registrar ingresos.</Text>
  {error ? <Text style={s.muted}>{error}</Text> : null}
  <Card>
   <Text style={s.heading}>Nuevo usuario</Text>
   <Field value={username} onChangeText={setUsername} placeholder="Usuario (ej.: puerta1)" autoCapitalize="none" autoCorrect={false} maxLength={30} editable={!busy && !full} />
   <PasswordField value={password} onChangeText={setPassword} placeholder="Contraseña (mínimo 8 caracteres)" maxLength={128} editable={!busy && !full} />
   <Button title={full ? `Límite de ${max} alcanzado` : 'Crear usuario'} disabled={busy || full || !user || !password} onPress={create} />
  </Card>
  {users.map(item => <Card key={item.id}>
   <View style={s.row}><Text style={s.heading}>{item.username}</Text><Text style={s.muted}>{new Date(item.created_at).toLocaleDateString()}</Text></View>
   {editing === item.id ? <>
    <PasswordField value={newPassword} onChangeText={setNewPassword} placeholder="Contraseña nueva (mínimo 8 caracteres)" maxLength={128} editable={!busy} />
    <Button title="Guardar contraseña" disabled={busy || !newPassword} onPress={() => changePassword(item)} />
    <Button title="Cancelar" secondary disabled={busy} onPress={() => {setEditing(null); setNewPassword('');}} />
   </> : <>
    <Button title="Cambiar contraseña" secondary disabled={busy} onPress={() => {setEditing(item.id); setNewPassword('');}} />
    <Button title="Eliminar" secondary disabled={busy} onPress={() => remove(item)} />
   </>}
  </Card>)}
  <View style={s.divider} /><Button title="Volver a mis eventos" secondary onPress={() => router.back()} />
 </ScrollView></SafeAreaView>;
}
