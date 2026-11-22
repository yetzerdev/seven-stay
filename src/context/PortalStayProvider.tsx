'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { BUCKET_FOTOS, blobDeDataUrl } from '@/lib/fotos';
import { aCategoria, aHabitacionPortal, aHotel, aPlato, aTicket, aTour, HOTEL_VACIO } from '@/lib/mapeos';
import { clientePortal, supabaseConfigurado } from '@/lib/supabase';
import { obtenerTokenCaptcha } from '@/lib/turnstile';
import type { CatalogoItem, CategoriaMenu, Habitacion, Hotel, Ticket } from '@/types/sevenstay';

import {
  mensajeDe,
  noDisponible,
  setIdioma,
  StayContext,
  useIdioma,
  type ErrorCrearTicket,
  type EstadoCarga,
  type NuevoTicket,
  type ResultadoCrearTicket,
  type StayContextValue,
} from './StayContext';

/**
 * Por qué no cargó el portal (va en `mensajeError` cuando estadoCarga = 'error'):
 *  - 'red': el teléfono no tiene conexión o no llega a Supabase;
 *  - 'servicio': hay conexión, pero el servicio no respondió bien (p. ej. el
 *    inicio de sesión anónimo está desactivado o falló la verificación anti-bots).
 */
export type MotivoErrorPortal = 'red' | 'servicio';

function motivoError(error: unknown): MotivoErrorPortal {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'red';
  return /failed to fetch|networkerror|network request failed|load failed|turnstile_no_cargo/i.test(mensajeDe(error))
    ? 'red'
    : 'servicio';
}

const ERRORES_TICKET: ErrorCrearTicket[] = [
  'placa_no_activa',
  'habitacion_no_encontrada',
  'limite_abiertas',
  'limite_por_hora',
  'nota_muy_larga',
  'item_no_disponible',
  'fuera_de_horario',
];

/**
 * Datos del portal del huésped para una placa (/p/[codigo]).
 *  1. Inicia una sesión ANÓNIMA de Supabase (una por teléfono, se recuerda).
 *  2. Lee hotel y habitación con la función portal_por_codigo.
 *  3. Lee sus solicitudes (RLS: solo las que creó este teléfono) y el catálogo.
 *  4. Se suscribe a Realtime: cuando recepción cambia algo, se actualiza solo.
 */
export function PortalStayProvider({ codigo, children }: { codigo: string; children: ReactNode }) {
  const idioma = useIdioma();
  const cliente = useMemo(() => (supabaseConfigurado ? clientePortal() : null), []);

  const [estadoCarga, setEstadoCarga] = useState<EstadoCarga>('cargando');
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [hotel, setHotel] = useState<Hotel>(HOTEL_VACIO);
  const [habitacion, setHabitacion] = useState<Habitacion | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const [categoriasMenu, setCategoriasMenu] = useState<CategoriaMenu[]>([]);
  const hotelId = useRef<string | null>(null);
  const ticketsActuales = useRef<Ticket[]>([]);
  useEffect(() => {
    ticketsActuales.current = tickets;
  }, [tickets]);

  /** Hotel + habitación. Devuelve false si la placa no existe. */
  const cargarPortal = useCallback(async (): Promise<boolean> => {
    if (!cliente) return false;
    const { data, error } = await cliente.rpc('portal_por_codigo', { p_codigo: codigo });
    if (error) throw error;
    if (!data) return false;
    const datos = data as { hotel: Record<string, unknown>; habitacion: Record<string, unknown> };
    hotelId.current = String(datos.hotel.id);
    setHotel(aHotel(datos.hotel));
    setHabitacion(aHabitacionPortal(datos.habitacion));
    return true;
  }, [cliente, codigo]);

  const cargarTickets = useCallback(async () => {
    if (!cliente) return;
    // RLS: el huésped anónimo solo recibe las solicitudes que él creó.
    const { data, error } = await cliente.from('tickets').select('*').order('creado_at', { ascending: false }).limit(100);
    if (error) throw error;
    setTickets((data ?? []).map(aTicket));
  }, [cliente]);

  const cargarCatalogo = useCallback(async () => {
    if (!cliente || !hotelId.current) return;
    const [tours, menu, categorias] = await Promise.all([
      // Tours de Seven Stay (hotel_id nulo) y los propios de este hotel; el modo del hotel decide cuáles se muestran.
      cliente.from('curated_tours').select('*').eq('activo', true).or(`hotel_id.is.null,hotel_id.eq.${hotelId.current}`).order('titulo_es'),
      cliente.from('menu_items').select('*').eq('hotel_id', hotelId.current).eq('activo', true).order('titulo_es'),
      cliente.from('menu_categorias').select('*').eq('hotel_id', hotelId.current).eq('activa', true).order('orden'),
    ]);
    if (tours.error) throw tours.error;
    if (menu.error) throw menu.error;
    if (categorias.error) throw categorias.error;
    setCatalogo([...(tours.data ?? []).map(aTour), ...(menu.data ?? []).map(aPlato)]);
    setCategoriasMenu((categorias.data ?? []).map(aCategoria));
  }, [cliente]);

  // Arranque: sesión anónima y primera lectura.
  useEffect(() => {
    let cancelado = false;
    const arrancar = async () => {
      if (!cliente) {
        setMensajeError('servicio');
        setEstadoCarga('error');
        return;
      }
      try {
        const { data } = await cliente.auth.getSession();
        if (!data.session) {
          // Con CAPTCHA activo en Supabase, la sesión anónima necesita el token de Turnstile.
          const captchaToken = await obtenerTokenCaptcha(idioma);
          const { error } = await cliente.auth.signInAnonymously({ options: { captchaToken } });
          if (error) throw error;
        }
        const existe = await cargarPortal();
        if (cancelado) return;
        if (!existe) {
          setEstadoCarga('no_encontrado');
          return;
        }
        await Promise.all([cargarTickets(), cargarCatalogo()]);
        if (!cancelado) setEstadoCarga('listo');
      } catch (error) {
        if (cancelado) return;
        setMensajeError(motivoError(error));
        setEstadoCarga('error');
      }
    };
    void arrancar();
    return () => {
      cancelado = true;
    };
    // El idioma solo se usa para el widget anti-bots: cambiarlo no reinicia la sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, cargarPortal, cargarTickets, cargarCatalogo]);

  // En vivo: Realtime para sus solicitudes; el hotel (Wi-Fi, horarios) se refresca al volver y cada minuto.
  useEffect(() => {
    if (estadoCarga !== 'listo' || !cliente) return;
    let pendiente: ReturnType<typeof setTimeout> | undefined;
    const refrescarTickets = () => {
      clearTimeout(pendiente);
      pendiente = setTimeout(() => void cargarTickets().catch(() => {}), 150);
    };
    const canal = cliente
      .channel(`portal-${codigo}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, refrescarTickets)
      .subscribe();
    const refrescarTodo = () => {
      void cargarPortal().catch(() => {});
      refrescarTickets();
    };
    const intervalo = setInterval(refrescarTodo, 60_000);
    window.addEventListener('focus', refrescarTodo);
    return () => {
      clearTimeout(pendiente);
      clearInterval(intervalo);
      window.removeEventListener('focus', refrescarTodo);
      void cliente.removeChannel(canal);
    };
  }, [estadoCarga, cliente, codigo, cargarPortal, cargarTickets]);

  const crearTicket = useCallback(
    async (payload: NuevoTicket): Promise<ResultadoCrearTicket> => {
      if (!cliente) return { ok: false, error: 'error_conexion' };

      // La foto se sube a Storage antes de crear el ticket: el ticket solo guarda la ruta.
      // Ruta: {hotel}/{sesión}/{idempotency_key}.jpg → un reintento reutiliza el mismo archivo.
      let detalleMantenimiento: { subcategoria: string; foto_path: string | null } | null = null;
      if (payload.detalle_mantenimiento) {
        const { subcategoria, foto_data_url } = payload.detalle_mantenimiento;
        let fotoPath: string | null = null;
        if (foto_data_url) {
          const { data: sesion } = await cliente.auth.getSession();
          const uid = sesion.session?.user.id;
          if (!uid || !hotelId.current) return { ok: false, error: 'error_conexion' };
          fotoPath = `${hotelId.current}/${uid}/${payload.idempotency_key}.jpg`;
          try {
            const { error: errorFoto } = await cliente.storage
              .from(BUCKET_FOTOS)
              .upload(fotoPath, await blobDeDataUrl(foto_data_url), { contentType: 'image/jpeg', upsert: false });
            if (errorFoto && !/exists|duplicate/i.test(errorFoto.message)) return { ok: false, error: 'foto_no_subida' };
          } catch {
            return { ok: false, error: 'foto_no_subida' };
          }
        }
        detalleMantenimiento = { subcategoria, foto_path: fotoPath };
      }

      const { data, error } = await cliente.rpc('crear_ticket', {
        p_codigo: codigo,
        p_categoria: payload.categoria,
        p_idempotency_key: payload.idempotency_key,
        p_urgente: payload.urgente ?? false,
        p_nota: payload.nota ?? null,
        p_idioma: payload.idioma_huesped ?? idioma,
        p_detalle_housekeeping: payload.detalle_housekeeping ?? null,
        p_detalle_mantenimiento: detalleMantenimiento,
        p_detalle_catalogo: payload.detalle_catalogo ?? null,
      });
      if (error) {
        const mensaje = mensajeDe(error);
        return { ok: false, error: ERRORES_TICKET.find((codigoError) => mensaje.includes(codigoError)) ?? 'error_conexion' };
      }
      const ticket = aTicket(data as Record<string, unknown>);
      const duplicado = ticketsActuales.current.some((t) => t.id === ticket.id);
      setTickets((prev) => (prev.some((t) => t.id === ticket.id) ? prev : [ticket, ...prev]));
      // La placa pudo pasar a "por validar" (Opción C).
      void cargarPortal().catch(() => {});
      return { ok: true, ticket, duplicado };
    },
    [cliente, codigo, idioma, cargarPortal],
  );

  const escalarTicket = useCallback(
    async (ticketId: string) => {
      if (!cliente) return;
      const { error } = await cliente.rpc('escalar_ticket_huesped', { p_ticket: ticketId });
      if (error) setErrorAccion(mensajeDe(error));
      await cargarTickets().catch(() => {});
    },
    [cliente, cargarTickets],
  );

  const cancelarTicket = useCallback(
    async (ticketId: string) => {
      if (!cliente) return false;
      const { data, error } = await cliente.rpc('cancelar_ticket_huesped', { p_ticket: ticketId });
      if (error) setErrorAccion(mensajeDe(error));
      await cargarTickets().catch(() => {});
      return data === true;
    },
    [cliente, cargarTickets],
  );

  const valor = useMemo<StayContextValue>(
    () => ({
      estadoCarga,
      mensajeError,
      errorAccion,
      limpiarErrorAccion: () => setErrorAccion(null),
      hidratado: estadoCarga === 'listo',
      hotel,
      habitaciones: habitacion ? [habitacion] : [],
      tickets,
      catalogo,
      categoriasMenu,
      personal: [],
      misTicketIds: tickets.map((t) => t.id),
      idioma,
      setIdioma,
      crearTicket,
      escalarTicket,
      cancelarTicket,
      rolPanel: 'recepcion',
      correoUsuario: null,
      iniciarSesion: noDisponible,
      cerrarSesion: noDisponible,
      validarEstadia: noDisponible,
      aceptarTicket: noDisponible,
      resolverTicket: noDisponible,
      rechazarTicket: noDisponible,
      activarEstadiaManual: noDisponible,
      hacerCheckout: noDisponible,
      actualizarHotel: noDisponible,
      toggleTurnoPersonal: noDisponible,
      agregarPersonal: noDisponible,
      eliminarPersonal: noDisponible,
      guardarPlato: noDisponible,
      eliminarPlato: noDisponible,
      subirImagenMenu: noDisponible,
      guardarTour: noDisponible,
      eliminarTour: noDisponible,
      guardarCategoria: noDisponible,
      eliminarCategoria: noDisponible,
      ordenarCategorias: noDisponible,
      recargar: async () => {
        await Promise.all([cargarPortal(), cargarTickets()]);
      },
    }),
    [estadoCarga, mensajeError, errorAccion, hotel, habitacion, tickets, catalogo, categoriasMenu, idioma, crearTicket, escalarTicket, cancelarTicket, cargarPortal, cargarTickets],
  );

  return <StayContext.Provider value={valor}>{children}</StayContext.Provider>;
}
