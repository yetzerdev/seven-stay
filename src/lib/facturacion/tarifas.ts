/**
 * Tarifas oficiales de Seven Stay (todo en Lempiras) y cálculos fiscales SAR.
 * Las usan la pantalla (vista previa) y el servidor (lo que se guarda y factura),
 * así la cotización y la factura siempre dan lo mismo.
 */

export const ISV = 0.15;

/** Redondeo a centavos sin errores de coma flotante (2.675 → 2.68). */
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** "L. 12,345.67" */
export function lempiras(n: number): string {
  return `L. ${r2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Categorías por tamaño del hotel
// ---------------------------------------------------------------------------

export type PlanSaas = 'boutique' | 'estandar' | 'resort';
export type TipoPlaca = 'esencial' | 'ejecutiva';

/** 10–24 habitaciones = Boutique, 25–59 = Estándar, 60+ = Resort (menos de 10 se cotiza como Boutique). */
export function categoriaPorHabitaciones(habitaciones: number): PlanSaas {
  if (habitaciones >= 60) return 'resort';
  if (habitaciones >= 25) return 'estandar';
  return 'boutique';
}

export const PLANES_SAAS: Record<PlanSaas, { nombre: string; rango: string; mensual: number }> = {
  boutique: { nombre: 'Boutique', rango: '10–24 hab.', mensual: 2500 },
  estandar: { nombre: 'Estándar', rango: '25–59 hab.', mensual: 3500 },
  resort: { nombre: 'Resort / Cadena', rango: '60+ hab.', mensual: 6000 },
};

/** Precio por placa SIN ISV, según el tamaño del hotel (pago único). */
export const PLACAS: Record<TipoPlaca, { nombre: string; precio: Record<PlanSaas, number> }> = {
  esencial: { nombre: 'Línea Esencial (Acrílico en «L»)', precio: { boutique: 652.17, estandar: 600, resort: 565.22 } },
  ejecutiva: { nombre: 'Línea Ejecutiva (Madera + Acrílico)', precio: { boutique: 773.91, estandar: 713.04, resort: 660.87 } },
};

/** Reposición de una placa individual, SIN ISV. */
export const REPOSICION: Record<TipoPlaca, { nombre: string; precio: number }> = {
  esencial: { nombre: 'Reposición de placa individual — Acrílico', precio: 600 },
  ejecutiva: { nombre: 'Reposición de placa individual — Madera', precio: 713.04 },
};

export const conIsv = (sinIsv: number) => r2(sinIsv * (1 + ISV));

// ---------------------------------------------------------------------------
// Conceptos facturables y totales SAR
// ---------------------------------------------------------------------------

export type Concepto = 'anticipo_placas' | 'saldo_placas' | 'mensualidad' | 'reposicion' | 'comision_tours' | 'libre';

export const CONCEPTOS: Record<Concepto, string> = {
  anticipo_placas: 'Anticipo 50% Placas NFC/QR',
  saldo_placas: 'Saldo 50% Entrega e Instalación Placas NFC/QR',
  mensualidad: 'Mensualidad Plataforma SaaS Seven Stay',
  reposicion: 'Reposición de Placas Individuales',
  comision_tours: 'Comisión por Intermediación de Tours',
  libre: 'Ítem libre personalizado',
};

export interface LineaFactura {
  cantidad: number;
  descripcion: string;
  /** Sin ISV. */
  precio_unitario: number;
  /** cantidad × precio_unitario (sin ISV). */
  total: number;
  concepto: Concepto;
}

/** Todo lo de Seven Stay es gravado con 15 %: exento y exonerado en cero. */
export function totalesSar(lineas: Pick<LineaFactura, 'cantidad' | 'precio_unitario'>[]) {
  const gravado = r2(lineas.reduce((s, l) => s + r2(l.cantidad * l.precio_unitario), 0));
  const isv = r2(gravado * ISV);
  return { descuentos: 0, importe_exento: 0, importe_exonerado: 0, importe_gravado: gravado, isv, total: r2(gravado + isv) };
}

/** Placas de una cotización: total sin ISV, ISV y total, más el 50/50. */
export function cotizarPlacas(tipo: TipoPlaca, habitaciones: number) {
  const categoria = categoriaPorHabitaciones(habitaciones);
  const unitario = PLACAS[tipo].precio[categoria];
  const subtotal = r2(unitario * habitaciones);
  const isv = r2(subtotal * ISV);
  const total = r2(subtotal + isv);
  const anticipo = r2(total / 2);
  return { categoria, unitario, unitarioConIsv: conIsv(unitario), subtotal, isv, total, anticipo, saldo: r2(total - anticipo) };
}

export function cotizarMensualidad(plan: PlanSaas) {
  const subtotal = PLANES_SAAS[plan].mensual;
  const isv = r2(subtotal * ISV);
  return { subtotal, isv, total: r2(subtotal + isv) };
}

// ---------------------------------------------------------------------------
// Monto en letras (SAR): "SON: OCHO MIL SEISCIENTOS VEINTICINCO LEMPIRAS CON 00/100."
// ---------------------------------------------------------------------------

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function hastaMil(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  let texto = CENTENAS[c];
  if (resto) {
    const parte = resto < 30 ? UNIDADES[resto] : `${DECENAS[Math.floor(resto / 10)]}${resto % 10 ? ` Y ${UNIDADES[resto % 10]}` : ''}`;
    texto = texto ? `${texto} ${parte}` : parte;
  }
  return texto;
}

/** "UNO" → "UN" delante de MIL / MILLÓN / LEMPIRAS (VEINTIUNO → VEINTIÚN). */
const apocopar = (t: string) => t.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN');

export function enteroALetras(n: number): string {
  if (n === 0) return 'CERO';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones) partes.push(millones === 1 ? 'UN MILLÓN' : `${apocopar(enteroALetras(millones))} MILLONES`);
  if (miles) partes.push(miles === 1 ? 'MIL' : `${apocopar(hastaMil(miles))} MIL`);
  if (resto) partes.push(hastaMil(resto));
  return partes.join(' ');
}

export function montoEnLetras(total: number): string {
  const centavosTotales = Math.round(r2(total) * 100);
  const entero = Math.floor(centavosTotales / 100);
  const centavos = centavosTotales % 100;
  const palabras = apocopar(enteroALetras(entero));
  return `SON: ${palabras} ${entero === 1 ? 'LEMPIRA' : 'LEMPIRAS'} CON ${String(centavos).padStart(2, '0')}/100.`;
}
