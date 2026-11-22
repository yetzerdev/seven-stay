/**
 * Traducción automática español → inglés de los textos que escribe el hotel
 * (tours, notas informativas). El hotel escribe solo en español y 7Stay genera
 * el inglés para los huéspedes que usan el portal en ese idioma.
 *
 * Usa el traductor integrado de Chrome (Translator API), que traduce en
 * el propio equipo, sin enviar el texto a ningún servidor y sin costo. Si el
 * navegador no lo tiene, devuelve `null` y la pantalla lo avisa.
 *
 * Producción: reemplazar el cuerpo de `traducirAlIngles` por una llamada al
 * servidor (p. ej. una función de Supabase con DeepL o Claude); la firma no cambia.
 */

type Disponibilidad = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface TraductorNavegador {
  translate(texto: string): Promise<string>;
  destroy?: () => void;
}

interface ApiTranslator {
  availability(opciones: { sourceLanguage: string; targetLanguage: string }): Promise<Disponibilidad>;
  create(opciones: { sourceLanguage: string; targetLanguage: string }): Promise<TraductorNavegador>;
}

/**
 * Límite de espera: en algunos navegadores (o webviews) la API existe pero no
 * responde nunca. Sin esto, el botón quedaría en "Traduciendo…" para siempre.
 */
function conLimite<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<T>((_, rechazar) => setTimeout(() => rechazar(new Error('Tiempo de traducción agotado')), ms)),
  ]);
}

/** La primera vez Chrome descarga el modelo es→en: se le da más margen. */
const MS_CREAR = 30_000;
const MS_TRADUCIR = 15_000;
const MS_CONSULTA = 5_000;

function apiTranslator(): ApiTranslator | null {
  const api = (globalThis as { Translator?: ApiTranslator }).Translator;
  return api && typeof api.create === 'function' ? api : null;
}

/** `true` si este navegador puede traducir (aunque tenga que descargar el modelo la primera vez). */
export async function traduccionDisponible(): Promise<boolean> {
  const api = apiTranslator();
  if (!api) return false;
  try {
    return (await conLimite(api.availability({ sourceLanguage: 'es', targetLanguage: 'en' }), MS_CONSULTA)) !== 'unavailable';
  } catch {
    return false;
  }
}

/**
 * Traduce varios textos del español al inglés (en el mismo orden). Los textos
 * vacíos quedan vacíos. Devuelve `null` si no se pudo traducir.
 * Conviene llamarla dentro de un clic: la primera vez Chrome puede pedir
 * descargar el modelo y eso exige una acción del usuario.
 */
export async function traducirAlIngles(textos: string[]): Promise<string[] | null> {
  const api = apiTranslator();
  if (!api) return null;
  // Consulta rápida primero: si el navegador no responde, se falla en 5 s y no en 30.
  if (!(await traduccionDisponible())) return null;
  let traductor: TraductorNavegador | null = null;
  try {
    traductor = await conLimite(api.create({ sourceLanguage: 'es', targetLanguage: 'en' }), MS_CREAR);
    const t = traductor;
    return await conLimite(
      Promise.all(textos.map((texto) => (texto.trim() ? t.translate(texto.trim()) : Promise.resolve('')))),
      MS_TRADUCIR,
    );
  } catch {
    return null;
  } finally {
    traductor?.destroy?.();
  }
}
