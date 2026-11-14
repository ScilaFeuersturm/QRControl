import { brand } from '../config/brand';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, FlatList, Platform, Pressable, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Button, Card, Field, confirmAction, notify, palette, styles as s } from '../components/ui';
import { useSession } from '../state/session';
import type { Summary, Ticket } from '../state/session';
export default function Guests() {
 const session = useSession(), {api, event, role} = session;
 const [list, setList] = useState<Ticket[]>([]), [summary, setSummary] = useState<Summary | null>(null);
 const [query, setQuery] = useState(''), [search, setSearch] = useState(''), [filter, setFilter] = useState('all');
 const [busy, setBusy] = useState(false), [sync, setSync] = useState('Conectando…'), [more, setMore] = useState(true);
 const visible = useRef<number[]>([]), loading = useRef(false), generation = useRef(0), actionLock = useRef(false);
 const viewable = useCallback(({viewableItems}: {viewableItems: {item: Ticket}[]}) => {visible.current = viewableItems.map(v => v.item.id);}, []);
 useEffect(() => {const timer = setTimeout(() => setSearch(query), 300); return () => clearTimeout(timer);}, [query]);
 const endpoint = useCallback((before?: number) => `/tickets?limit=50&search=${encodeURIComponent(search)}&attendance=${filter}${before ? `&before_id=${before}` : ''}`, [search, filter]);
 const reload = useCallback(async () => {
  const revision = ++generation.current; setBusy(true);
  try {const [rows, stats] = await Promise.all([api<Ticket[]>(endpoint()), api<Summary>('/summary')]);
   if (revision !== generation.current) return;
   setList(rows); setMore(rows.length === 50); setSummary(stats); setSync(`Actualizado ${new Date().toLocaleTimeString()}`);
  } catch {if (revision === generation.current) setSync('Sin conexión · Los datos pueden estar desactualizados');}
  finally {if (revision === generation.current) setBusy(false);}
 }, [api, endpoint]);
 useFocusEffect(useCallback(() => {
  if (!event) return;
  let active = true, polling = false; reload();
  const timer = setInterval(async () => {
   if (polling || AppState.currentState !== 'active') return; polling = true;
   try {
    const ids = visible.current.slice(0, 200).map(id => `ids=${id}`).join('&');
    const [stats, updates] = await Promise.all([api<Summary>('/summary'), ids ? api<Partial<Ticket>[]>(`/attendance?${ids}`) : Promise.resolve([])]);
    if (!active) return; setSummary(stats);
    setList(previous => previous.map(t => ({...t, ...updates.find(update => update.id === t.id)})));
    setSync(`Actualizado ${new Date().toLocaleTimeString()}`);
   } catch {if (active) setSync('Sin conexión · Los datos pueden estar desactualizados');} finally {polling = false;}
  }, 3000);
  return () => {active = false; ++generation.current; clearInterval(timer);};
 }, [api, event, reload]));
 async function loadMore() {
  if (loading.current || !more || !list.length) return;
  loading.current = true; const revision = generation.current;
  try {const rows = await api<Ticket[]>(endpoint(list[list.length - 1].id)); if (revision !== generation.current) return;
   setList(old => [...old, ...rows.filter(t => !old.some(o => o.id === t.id))]); setMore(rows.length === 50);
  } catch {setSync('No se pudo cargar la siguiente página');} finally {loading.current = false;}
 }
 // En la PC no existe el menú de compartir del celular: la invitación se descarga como imagen.
 async function download(ticket: Ticket) {
  if (actionLock.current) return; actionLock.current = true; setBusy(true);
  try {
   const response = await fetch(`${session.url.replace(/\/$/, '')}/tickets/${ticket.id}/invitation?event_id=${event?.id}`, {headers: {Authorization: `Bearer ${session.key}`}});
   if (!response.ok) throw new Error('No se pudo emitir la entrada. Revisá el pago.');
   const link = document.createElement('a');
   link.href = URL.createObjectURL(await response.blob());
   link.download = `entrada-${ticket.name.replace(/[^\p{L}\p{N}]+/gu, '-')}-${ticket.quantity}p.png`;
   document.body.appendChild(link); link.click(); link.remove();
   setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  } catch(e) {notify('No se pudo descargar', e instanceof Error ? e.message : 'Revisá la conexión');}
  finally {actionLock.current = false; setBusy(false);}
 }
 async function share(ticket: Ticket) {
  if (Platform.OS === 'web') return download(ticket);
  if (actionLock.current) return; actionLock.current = true; setBusy(true);
  const path = `${FileSystem.cacheDirectory}zenit-${event?.id}-${ticket.id}.png`;
  try {
   const response = await FileSystem.downloadAsync(`${session.url.replace(/\/$/, '')}/tickets/${ticket.id}/invitation?event_id=${event?.id}`, path, {headers: {Authorization: `Bearer ${session.key}`}});
   if (response.status !== 200) throw new Error('No se pudo emitir la entrada. Revisá el pago.');
   if (!await Sharing.isAvailableAsync()) throw new Error('Compartir no está disponible en este dispositivo');
   await Sharing.shareAsync(path, {mimeType: 'image/png', dialogTitle: `${event?.name} · ${ticket.name} · ${ticket.quantity} personas`});
  } catch(e) {notify('No se pudo compartir', e instanceof Error ? e.message : 'Revisá la conexión');}
  finally {await FileSystem.deleteAsync(path, {idempotent: true}).catch(() => {}); actionLock.current = false; setBusy(false);}
 }
 function confirmPayment(ticket: Ticket) {
  confirmAction('Confirmar pago', `¿Verificaste el pago de ${ticket.name} por ${ticket.quantity} entradas?`, 'Confirmar', async () => {
   if (actionLock.current) return; actionLock.current = true; setBusy(true);
   try {await api(`/tickets/${ticket.id}/payment`, 'PATCH', {paid: true}); await reload();}
   catch(e) {notify('Pago sin confirmar', `${e instanceof Error ? e.message : 'Revisá la conexión'}. Actualizá la lista para consultar el estado antes de reintentar.`);}
   finally {actionLock.current = false; setBusy(false);}
  });
 }
 if (!event) return <Redirect href="/" />;
 return <SafeAreaView style={s.screen}><FlatList data={list} keyExtractor={t => String(t.id)} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" refreshing={busy} onRefresh={reload} onEndReached={loadMore} onEndReachedThreshold={.4} onViewableItemsChanged={viewable}
 ListHeaderComponent={<View style={{gap: 18}}><View style={s.row}><Text style={s.brand}>{brand.name.toUpperCase()} / ACCESS</Text><Pressable onPress={() => router.push('/events')}><Text style={s.muted}>Mis eventos</Text></Pressable></View><Text style={s.title}>{event.name}</Text><Text style={s.muted}>{event.date_label} · {event.venue}</Text>
 <View style={s.row}>{[['Disponibles', summary?.available], ['Pagadas', summary?.paid], ['Ingresaron', summary?.admitted]].map(([label, value]) => <View key={String(label)}><Text style={s.number}>{value ?? '—'}</Text><Text style={s.muted}>{label}</Text></View>)}</View>{!event.active && <Text style={{color: palette.gold}}>Evento archivado · Historial de solo lectura</Text>}<Text style={s.muted}>Cupo: {event.capacity} personas · {sync}</Text>
 <Button title="Escanear una entrada" disabled={!event.active} onPress={() => router.push('/scan')} />{role === 'admin' && event.active && <Button title="Registrar compra" secondary onPress={() => router.push('/new-ticket')} />}
 <Text style={s.heading}>Lista de invitados</Text><Field value={query} onChangeText={setQuery} placeholder="Buscar titular por nombre" /><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{[['all', 'Todos'], ['absent', 'Por ingresar'], ['present', 'Con ingresos'], ['pending', 'Sin pagar']].map(([value, label]) => <Pressable key={value} onPress={() => setFilter(value)} style={[s.pill, filter === value && {backgroundColor: '#31405A'}]}><Text style={s.muted}>{label}</Text></Pressable>)}</View></View>}
 renderItem={({item: t}) => <Card><View style={s.row}><Text style={[s.heading, {flex: 1}]}>{t.name}</Text><Text style={{color: t.admitted_count ? palette.green : palette.gold}}>{t.admitted_count === t.quantity ? '✓ Completo' : t.admitted_count ? '◐ Parcial' : '○ Pendiente'}</Text></View><Text style={s.muted}>Mesa {t.table_name || '—'} · {t.quantity} {t.quantity === 1 ? 'persona' : 'personas'}{t.phone ? ` · ${t.phone}` : ''}</Text><Text style={s.text}>Ingresaron {t.admitted_count} de {t.quantity} · Restan {t.remaining}</Text><Text style={s.muted}>{t.paid ? 'Pago confirmado' : 'Pago pendiente · Sin QR'}{t.used_at ? ` · Último ingreso ${new Date(t.used_at).toLocaleTimeString()}` : ''}</Text>{role === 'admin' && event.active && <Button title={t.paid ? (Platform.OS === 'web' ? 'Descargar entrada con QR' : 'Compartir entrada con QR') : 'Confirmar pago y generar QR'} disabled={busy} onPress={() => t.paid ? share(t) : confirmPayment(t)} />}</Card>}
 ListEmptyComponent={<Text style={s.muted}>{busy ? 'Cargando invitados…' : 'No hay invitados para este filtro.'}</Text>} ListFooterComponent={<Text style={s.muted}>La asistencia visible se actualiza cada 3 s. El saldo se valida en el servidor al confirmar cada ingreso.</Text>} /></SafeAreaView>;
}
