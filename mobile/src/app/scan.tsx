import { brand } from '../config/brand';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import { Button, Card, Field, palette, styles as s } from '../components/ui';
import { ApiError, useSession } from '../state/session';
import type { Ticket } from '../state/session';
type Preview = {status: 'available' | 'used' | 'unpaid' | 'unknown'; ticket: Ticket | null};
type Receipt = {status: 'accepted' | 'used' | 'unpaid' | 'unknown' | 'insufficient'; ticket: Ticket | null; admitted_now: number};
type Operation = {token: string; quantity: number; request_id: string};
const labels = {accepted: 'INGRESO CONFIRMADO', used: 'ENTRADA COMPLETAMENTE UTILIZADA', unpaid: 'PAGO PENDIENTE', unknown: 'QR NO REGISTRADO EN ESTE EVENTO', insufficient: 'EL GRUPO SUPERA EL SALDO DISPONIBLE'};
export default function Scan() {
 const {api, event} = useSession();
 const [permission, requestPermission] = useCameraPermissions();
 const [camera, setCamera] = useState(false), [busy, setBusy] = useState(false), [manual, setManual] = useState('');
 const [preview, setPreview] = useState<Preview | null>(null), [receipt, setReceipt] = useState<Receipt | null>(null), [quantity, setQuantity] = useState('1'), [error, setError] = useState('');
 const [pending, setPending] = useState<Operation | null>(null), [token, setToken] = useState('');
 const lock = useRef(false);
 useFocusEffect(useCallback(() => () => setCamera(false), []));
 async function lookup(value: string) {
  if (lock.current || preview || pending || receipt) return; lock.current = true; setBusy(true); setCamera(false); setError('');
  try {const response = await api<Preview>('/lookup', 'POST', {token: value}); setToken(value); setPreview(response); setQuantity('1');}
  catch(e) {setError(e instanceof Error ? e.message : 'No se pudo consultar el QR. No autorices el ingreso.');}
  finally {lock.current = false; setBusy(false);}
 }
 async function submit(operation: Operation) {
  if (lock.current) return; lock.current = true; setBusy(true); setError(''); setPending(operation);
  try {
   const response = await api<Receipt>('/check-in', 'POST', operation); setReceipt(response); setPreview(null); setPending(null);
  } catch(e) {
   if (e instanceof ApiError && e.status < 500) {setPending(null); setError(e.message);}
   else setError('Resultado sin confirmar. No autorices el ingreso. Reconsultá esta misma operación para saber si quedó registrada; el reintento no vuelve a descontar personas.');
  } finally {lock.current = false; setBusy(false);}
 }
 function reset() {setPreview(null); setReceipt(null); setManual(''); setToken(''); setError('');}
 const count = Number(quantity), remaining = preview?.ticket?.remaining ?? 0;
 if (!event) return <Redirect href="/" />;
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><Button title="Volver a invitados" secondary disabled={busy} onPress={() => router.back()} /><Text style={s.brand}>{brand.name.toUpperCase()} / RECEPCIÓN</Text><Text style={s.title}>Validar ingreso</Text><Text style={s.muted}>{event.name}</Text>
 {error ? <Card><Text style={{color: palette.red}}>{error}</Text></Card> : null}
 {pending ? <Card><Text style={s.heading}>Operación pendiente de confirmación</Text><Text style={s.muted}>No vuelvas a registrar a estas personas con otra operación ni desde otro teléfono.</Text><Text style={s.muted}>Referencia: {pending.request_id}</Text><Button title={busy ? 'Consultando…' : 'Reconsultar la misma operación'} disabled={busy} onPress={() => submit(pending)} /></Card> : receipt ? <Card><Text style={[s.heading, {color: receipt.status === 'accepted' ? palette.green : palette.red}]}>{labels[receipt.status]}</Text>{receipt.ticket && <><Text style={s.heading}>{receipt.ticket.name}</Text><Text style={s.text}>{receipt.status === 'accepted' ? `En esta operación: ${receipt.admitted_now} personas` : 'No autorizar personas adicionales'}</Text><Text style={s.muted}>Total: {receipt.ticket.admitted_count} de {receipt.ticket.quantity} · Restan {receipt.ticket.remaining}</Text></>}<Button title="Leer siguiente QR" onPress={reset} /></Card> : preview ? <Card>{preview.ticket && <><Text style={s.heading}>{preview.ticket.name}</Text><Text style={s.muted}>Mesa {preview.ticket.table_name || 'sin asignar'} · Compra para {preview.ticket.quantity} personas</Text><Text style={s.text}>Ingresaron {preview.ticket.admitted_count} · Quedan {remaining}</Text></>}
 {preview.status === 'available' ? <><Text style={s.heading}>¿Cuántas personas ingresan ahora?</Text><Field value={quantity} onChangeText={setQuantity} keyboardType="number-pad" /><Text style={s.muted}>Verificá el titular y contá las personas antes de confirmar. El resto podrá ingresar después con este mismo QR.</Text><Button title={`Confirmar ingreso de ${Number.isInteger(count) ? count : '…'}`} disabled={busy || !Number.isInteger(count) || count < 1 || count > remaining} onPress={() => submit({token, quantity: count, request_id: Crypto.randomUUID()})} /></> : <Text style={{color: palette.red}}>{labels[preview.status]}</Text>}
 <Button title="Cancelar lectura" secondary disabled={busy} onPress={reset} /></Card> : <Card><Text style={s.heading}>Leé el QR de la entrada</Text><Text style={s.muted}>La lectura consulta el saldo. El ingreso se registra cuando confirmás la cantidad.</Text>{camera && <CameraView style={{height: 320}} barcodeScannerSettings={{barcodeTypes: ['qr']}} onBarcodeScanned={({data}) => lookup(data)} />}
 <Button title={camera ? 'Cerrar cámara' : 'Abrir cámara'} disabled={busy} onPress={async () => {if (camera) {setCamera(false); return;} const p = permission?.granted ? permission : await requestPermission(); if (p.granted) setCamera(true); else setError('Permití el acceso a la cámara en los ajustes del teléfono.');}} /><Field value={manual} onChangeText={setManual} placeholder="O pegar código QRCONTROL:…" autoCapitalize="none" /><Button title={busy ? 'Consultando…' : 'Consultar código'} secondary disabled={busy || !manual.trim()} onPress={() => lookup(manual)} /></Card>}
 </ScrollView></SafeAreaView>;
}
