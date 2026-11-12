export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function normalizeServerUrl(value: string): string {
  const clean = value.trim().replace(/\/+$/, '');
  let parsed: URL;
  try { parsed = new URL(clean); } catch { throw new Error('Ingresá la URL completa del servidor, empezando por https://.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('La URL debe comenzar con http:// o https:// y no incluir claves ni parámetros.');
  }
  if (/\/(health|docs|session|events)$/.test(parsed.pathname)) {
    throw new Error('Ingresá la URL base del servidor, sin /health, /docs, /session ni /events.');
  }
  return clean;
}

export function normalizeTeamKey(value: string): string {
  const key = value.trim();
  if (key.length < 24) throw new Error('Ingresá el valor completo de ADMIN_KEY o SCANNER_KEY. La clave debe tener al menos 24 caracteres.');
  if (!/^[\x21-\x7e]+$/.test(key)) throw new Error('La clave debe contener letras, números o símbolos sin espacios, acentos ni saltos de línea.');
  return key;
}

type RequestOptions = {
  key?: string;
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export async function requestJson<T>(baseUrl: string, path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', cancel, {once: true});
  const timer = setTimeout(() => {timedOut = true; controller.abort();}, options.timeoutMs ?? 15000);
  try {
    const headers: Record<string, string> = {Accept: 'application/json'};
    if (options.key) headers.Authorization = `Bearer ${options.key}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(baseUrl + path, {
      method: options.method ?? 'GET', headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let value: unknown;
    try {value = text ? JSON.parse(text) : null;} catch {value = null;}
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new ApiError(response.status === 401 ? 'Clave del equipo incorrecta. Usá la clave configurada en el servidor al que te conectás.' : 'Esta clave no tiene permiso para realizar la operación.', response.status);
      }
      if ([502, 503, 504].includes(response.status)) throw new ApiError('El servidor está iniciándose o no está disponible. Esperá un momento y reintentá.', response.status);
      const detail = value && typeof value === 'object' && 'detail' in value ? (value as {detail: unknown}).detail : null;
      throw new ApiError(typeof detail === 'string' ? detail : 'No se pudo completar la operación.', response.status);
    }
    if (response.status === 204) return null as T;
    if (value === null) throw new Error('La URL respondió sin datos de la app. Revisá que sea la URL correcta del servidor.');
    return value as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) throw new Error('El servidor tardó demasiado en responder. Si estaba suspendido, esperá un minuto y volvé a intentar.');
    if (options.signal?.aborted) throw new Error('Conexión cancelada.');
    if (error instanceof TypeError || (error instanceof Error && /network|fetch|internet|connection/i.test(error.message))) {
      throw new Error('No se pudo contactar al servidor. Revisá la URL y la conexión a Internet del teléfono.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
