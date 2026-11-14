import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Celular: almacenamiento seguro del sistema. PC (web): almacenamiento del navegador.
// Si el almacenamiento no está disponible, la app sigue funcionando sin recordar la sesión.
export async function readItem(key: string): Promise<string | null> {
  try {return Platform.OS === 'web' ? window.localStorage.getItem(key) : await SecureStore.getItemAsync(key);} catch {return null;}
}
export async function writeItem(key: string, value: string): Promise<void> {
  try {if (Platform.OS === 'web') window.localStorage.setItem(key, value); else await SecureStore.setItemAsync(key, value);} catch {}
}
export async function removeItem(key: string): Promise<void> {
  try {if (Platform.OS === 'web') window.localStorage.removeItem(key); else await SecureStore.deleteItemAsync(key);} catch {}
}
