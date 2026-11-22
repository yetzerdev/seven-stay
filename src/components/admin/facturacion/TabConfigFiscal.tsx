'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

import { useAdmin } from '@/components/admin/SesionAdmin';
import { AvisoError, BOTON_PRIMARIO, Campo, INPUT } from '@/components/admin/ui';
import type { ConfigFiscal, EstadoCai } from '@/lib/admin/tipos';

/** Datos legales del emisor (SevenCloud Systems), CAI vigente y cuenta para transferencias. */
export default function TabConfigFiscal({ onGuardada }: { onGuardada: () => void }) {
  const { llamar } = useAdmin();
  const [config, setConfig] = useState<ConfigFiscal | null>(null);
  const [estado, setEstado] = useState<EstadoCai | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState(false);

  useEffect(() => {
    let vivo = true;
    llamar('configFiscal', null).then(
      (r) => {
        if (!vivo) return;
        setConfig(r.config);
        setEstado(r.estado);
      },
      (e: Error) => vivo && setError(e.message),
    );
    return () => {
      vivo = false;
    };
  }, [llamar]);

  if (!config) {
    return error ? (
      <AvisoError mensaje={error} />
    ) : (
      <div className="flex justify-center py-14">
        <Loader2 aria-label="Cargando" className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  const cambiar = <K extends keyof ConfigFiscal>(k: K, v: ConfigFiscal[K]) => setConfig((c) => (c ? { ...c, [k]: v } : c));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    setAviso(false);
    try {
      await llamar('guardarConfigFiscal', config);
      const r = await llamar('configFiscal', null);
      setConfig(r.config);
      setEstado(r.estado);
      setAviso(true);
      onGuardada();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const campo = (k: keyof ConfigFiscal, etiqueta: string, extra?: { ayuda?: string; mono?: boolean; placeholder?: string; max?: number; tipo?: string }) => (
    <Campo etiqueta={etiqueta} ayuda={extra?.ayuda}>
      <input
        type={extra?.tipo ?? 'text'}
        value={(config[k] as string | null) ?? ''}
        maxLength={extra?.max}
        placeholder={extra?.placeholder}
        onChange={(e) => cambiar(k, e.target.value as never)}
        className={`${INPUT} ${extra?.mono ? 'font-mono' : ''}`}
      />
    </Campo>
  );

  return (
    <form onSubmit={guardar} noValidate className="flex max-w-[980px] flex-col gap-6">
      {estado && (
        <div
          className={`flex items-start gap-3 rounded-2xl px-5 py-4 text-[14.5px] ${
            estado.bloqueo ? 'border border-rose-200 bg-rose-50 text-rose-900' : 'border border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {estado.bloqueo ? <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0" /> : <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />}
          <div>
            <p className="font-semibold">{estado.bloqueo ?? 'Listo para emitir facturas'}</p>
            {estado.siguiente && (
              <p className="tabular-nums">
                Próxima factura: <span className="font-mono font-bold">{estado.siguiente}</span> · Quedan {estado.restantes} números
                {estado.dias_para_limite !== null && ` · Fecha límite en ${estado.dias_para_limite} ${estado.dias_para_limite === 1 ? 'día' : 'días'}`}
              </p>
            )}
            {estado.restantes !== null && estado.restantes <= 20 && estado.restantes > 0 && (
              <p className="font-semibold">Quedan pocos números: solicita un rango nuevo a la SAR.</p>
            )}
          </div>
        </div>
      )}

      <AvisoError mensaje={error} onCerrar={() => setError(null)} />
      {aviso && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-[14.5px] font-medium text-emerald-800">Configuración fiscal guardada.</p>}

      <section className="grid grid-cols-1 gap-4 rounded-2xl border border-black/[0.06] bg-white p-6 md:grid-cols-2">
        <h2 className="text-[17px] font-bold md:col-span-2">Emisor</h2>
        {campo('nombre_legal', 'Nombre legal', { max: 120 })}
        {campo('denominacion', 'Denominación comercial', { max: 120 })}
        {campo('rtn', 'RTN del emisor (14 dígitos)', { mono: true, max: 14, placeholder: '0101200701251X' })}
        {campo('registro_sag', 'No. Registro SAG (si aplica)', { max: 60 })}
        <div className="md:col-span-2">{campo('domicilio', 'Domicilio fiscal', { max: 300 })}</div>
        {campo('telefono', 'Teléfono de facturación', { max: 40 })}
        {campo('correo', 'Correo de facturación', { max: 120, tipo: 'email' })}
      </section>

      <section className="grid grid-cols-1 gap-4 rounded-2xl border border-black/[0.06] bg-white p-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <h2 className="text-[17px] font-bold">CAI · Código de Autorización de Impresión</h2>
          <p className="text-[14px] text-neutral-500">
            Si cambias el CAI o el rango inicial, el correlativo vuelve a empezar desde el rango nuevo. Las facturas ya emitidas conservan sus datos.
          </p>
        </div>
        <div className="md:col-span-2">{campo('cai', 'CAI', { mono: true, max: 37, placeholder: 'XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XX' })}</div>
        {campo('rango_inicial', 'Rango inicial autorizado', { mono: true, max: 19, placeholder: '000-001-01-00000001' })}
        {campo('rango_final', 'Rango final autorizado', { mono: true, max: 19, placeholder: '000-001-01-00000500' })}
        {campo('fecha_limite', 'Fecha límite de emisión', { tipo: 'date' })}
        <Campo etiqueta="Correlativo actual" ayuda="Lo avanza el sistema al emitir; no se edita a mano.">
          <input readOnly value={estado?.correlativo_actual ?? 'Ninguna emitida'} className={`${INPUT} bg-neutral-50 font-mono text-neutral-500`} />
        </Campo>
      </section>

      <section className="grid grid-cols-1 gap-4 rounded-2xl border border-black/[0.06] bg-white p-6 md:grid-cols-2">
        <h2 className="text-[17px] font-bold md:col-span-2">Datos bancarios para transferencia</h2>
        {campo('banco', 'Banco', { max: 80 })}
        {campo('tipo_cuenta', 'Tipo de cuenta', { max: 60, placeholder: 'Ahorro / Cheques' })}
        {campo('numero_cuenta', 'Número de cuenta', { mono: true, max: 60 })}
        {campo('titular', 'Titular', { max: 120 })}
      </section>

      <div className="flex justify-end">
        <button type="submit" disabled={guardando} className={BOTON_PRIMARIO}>
          {guardando && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
          {guardando ? 'Guardando…' : 'Guardar configuración fiscal'}
        </button>
      </div>
    </form>
  );
}
