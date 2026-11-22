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
/**
 * Precio FINAL por placa CON ISV (pago único), según el tamaño del hotel.
 * Regla: siempre se parte del total final cerrado y de ahí se saca el subtotal
 * (÷ 1.15), para que el total a pagar nunca gane ni pierda centavos.
 */
export const PLACAS: Record<TipoPlaca, { nombre: string; final: Record<PlanSaas, number> }> = {
  esencial: { nombre: 'Línea Esencial (Acrílico en «L»)', final: { boutique: 750, estandar: 690, resort: 650 } },
  ejecutiva: { nombre: 'Línea Ejecutiva (Madera + Acrílico)', final: { boutique: 890, estandar: 820, resort: 760 } },
};

/** Reposición de una placa individual, precio FINAL con ISV. */
export const REPOSICION: Record<TipoPlaca, { nombre: string; final: number }> = {
  esencial: { nombre: 'Reposición de placa individual — Acrílico', final: 690 },
  ejecutiva: { nombre: 'Reposición de placa individual — Madera', final: 820 },
};

/**
 * Subtotal (sin ISV) de un total final cerrado: total ÷ 1.15.
 * Ej. L. 3,750.00 → L. 3,260.87. El ISV de ese precio cerrado es la diferencia
 * (L. 489.13), así el total nunca gana ni pierde centavos.
 */
export const gravadoPara = (totalConIsv: number) => r2(r2(totalConIsv) / (1 + ISV));

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
  /**
   * Precio cerrado: total FINAL con ISV de la línea (placas, anticipo, saldo,
   * reposición). Si existe, el ISV de la línea es total_con_isv − total.
   */
  total_con_isv?: number | null;
}

/**
 * Totales SAR. Todo lo de Seven Stay es gravado con 15 % (exento y exonerado en
 * cero). Los descuentos se restan antes del ISV.
 */
export function totalesSar(lineas: Pick<LineaFactura, 'cantidad' | 'precio_unitario' | 'total_con_isv'>[], descuento = 0) {
  const sinIsv = (l: Pick<LineaFactura, 'cantidad' | 'precio_unitario'>) => r2(l.cantidad * l.precio_unitario);
  const bruto = r2(lineas.reduce((s, l) => s + sinIsv(l), 0));
  const descuentos = r2(Math.min(Math.max(0, descuento || 0), bruto));
  // Con descuento todo se calcula a la forma normal (15 % sobre lo gravado).
  const cerradas = descuentos ? [] : lineas.filter((l) => l.total_con_isv != null && l.total_con_isv > 0);
  const abiertas = lineas.filter((l) => !cerradas.includes(l));
  const gravadoAbierto = r2(abiertas.reduce((s, l) => s + sinIsv(l), 0) - descuentos);
  const gravadoCerrado = r2(cerradas.reduce((s, l) => s + sinIsv(l), 0));
  const totalCerrado = r2(cerradas.reduce((s, l) => s + (l.total_con_isv ?? 0), 0));
  // Precio cerrado: ISV = total final − subtotal. Precio abierto: 15 % del subtotal.
  const isv = r2(r2(gravadoAbierto * ISV) + r2(totalCerrado - gravadoCerrado));
  const gravado = r2(gravadoAbierto + gravadoCerrado);
  return { descuentos, importe_exento: 0, importe_exonerado: 0, importe_gravado: gravado, isv, total: r2(gravado + isv) };
}

/** Placas: total final cerrado, 50/50 cerrado, y de ahí los subtotales sin ISV. */
export function cotizarPlacas(tipo: TipoPlaca, habitaciones: number) {
  const categoria = categoriaPorHabitaciones(habitaciones);
  const unitarioConIsv = PLACAS[tipo].final[categoria];
  const total = r2(unitarioConIsv * habitaciones);
  const subtotal = gravadoPara(total);
  const anticipo = r2(total / 2);
  const saldo = r2(total - anticipo);
  return {
    categoria,
    /** Solo para mostrar: precio unitario sin ISV. */
    unitario: r2(unitarioConIsv / (1 + ISV)),
    unitarioConIsv,
    subtotal,
    isv: r2(total - subtotal),
    total,
    anticipo,
    saldo,
    anticipoSinIsv: gravadoPara(anticipo),
    saldoSinIsv: gravadoPara(saldo),
  };
}

export function cotizarMensualidad(plan: PlanSaas) {
  const subtotal = PLANES_SAAS[plan].mensual;
  const isv = r2(subtotal * ISV);
  return { subtotal, isv, total: r2(subtotal + isv) };
}

/** Reposición de N placas: total final cerrado y su subtotal sin ISV. */
export function cotizarReposicion(tipo: TipoPlaca, cantidad: number) {
  const total = r2(REPOSICION[tipo].final * cantidad);
  return { total, subtotal: gravadoPara(total) };
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
