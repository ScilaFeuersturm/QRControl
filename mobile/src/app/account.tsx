import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, PasswordField, notify, styles as s } from '../components/ui';
import { useSession } from '../state/session';

// Permite que el personal de puerta cambie su propia contraseña.
export default function Account() {
 const session = useSession(), {api, role} = session;
 const [current, setCurrent] = useState(''), [next, setNext] = useState(''), [repeat, setRepeat] = useState(''), [busy, setBusy] = useState(false);
 async function save() {
  if (next.length < 8) {notify('Revisá la contraseña', 'La contraseña nueva debe tener al menos 8 caracteres.'); return;}
  if (next !== next.trim()) {notify('Revisá la contraseña', 'La contraseña no puede empezar ni terminar con espacios.'); return;}
  if (next !== repeat) {notify('Revisá la contraseña', 'Las dos contraseñas nuevas no coinciden.'); return;}
  setBusy(true);
  try {
   const result = await api<{token: string}>('/me/password', 'PATCH', {current_password: current, password: next});
   // El servidor devuelve un token nuevo: este dispositivo sigue conectado y las demás sesiones se cierran.
   session.setSession({url: session.url, key: result.token, role: session.role, event: session.event});
   notify('Contraseña cambiada', 'Usá la contraseña nueva la próxima vez que inicies sesión.');
   router.back();
  } catch (e) {notify('No se pudo cambiar', e instanceof Error ? e.message : 'Revisá la conexión');}
  finally {setBusy(false);}
 }
 if (!role) return <Redirect href="/" />;
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
  <Text style={s.brand}>ZENIT / MI CUENTA</Text>
  <Text style={s.title}>Cambiar mi{'\n'}contraseña.</Text>
  {role === 'admin' ? <Text style={s.muted}>La contraseña de administración se cambia en el servidor (variable ADMIN_PASSWORD en Render).</Text> : <Card>
   <PasswordField value={current} onChangeText={setCurrent} placeholder="Contraseña actual" editable={!busy} />
   <PasswordField value={next} onChangeText={setNext} placeholder="Contraseña nueva (mínimo 8 caracteres)" maxLength={128} editable={!busy} />
   <PasswordField value={repeat} onChangeText={setRepeat} placeholder="Repetí la contraseña nueva" maxLength={128} editable={!busy} />
   <Button title={busy ? 'Guardando…' : 'Guardar contraseña'} disabled={busy || !current || !next || !repeat} onPress={save} />
  </Card>}
  <Button title="Volver" secondary disabled={busy} onPress={() => router.back()} />
 </ScrollView></SafeAreaView>;
}
