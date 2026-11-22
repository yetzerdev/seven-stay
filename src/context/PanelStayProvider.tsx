'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { aCategoria, aHabitacion, aHotel, aPersonal, aPlato, aTicket, aTour, HOTEL_VACIO } from '@/lib/mapeos';
import { blobDeDataUrl } from '@/lib/fotos';
import { clientePanel, supabaseConfigurado } from '@/lib/supabase';
import { obtenerTokenCaptcha } from '@/lib/turnstile';
import type { CatalogoItem, CategoriaMenu, Habitacion, Hotel, PersonalOperativo, Ticket } from '@/types/sevenstay';

import {
  mensajeDe,
  noDisponible,
  setIdioma,
  StayContext,
  useIdioma,
  type DatosCategoria,
  type DatosTour,
  type DatosHotelEditables,
  type DatosPlato,
  type NuevoPersonal,
  type EstadoCarga,
  type RolPanel,
  type StayContextValue,
} from './StayContext';

interface DatosPanel {
  uid: string;
  hotelId: string | null; // null = usuario sin hotel vinculado
  rol: RolPanel;
  hotel: Hotel;
  habitaciones: Habitacion[];
  tickets: Ticket[];
  personal: PersonalOperativo[];
  /** Menú del hotel, incluidos los platos ocultos. */
  menu: CatalogoItem[];
  /** Categorías del menú (todas, en orden). */
  categorias: CategoriaMenu[];
}

/** Bucket público con las fotos del menú: {hotel_id}/{archivo}.jpg */
const BUCKET_MENU = 'imagenes-menu';

/** Ruta dentro del bucket a partir de su URL pública (null si la foto no es nuestra). */
function rutaImagenMenu(url: string | null | undefined): string | null {
  const marca = `/object/public/${BUCKET_MENU}/`;
  const i = url ? url.indexOf(marca) : -1;
  return url && i >= 0 ? decodeURIComponent(url.slice(i + marca.length).split('?')[0]) : null;
}

function mensajeLogin(error: unknown): string {
  const m = mensajeDe(error);
  if (/invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/email not confirmed/i.test(m)) return 'Confirma tu correo antes de entrar.';
  if (/captcha|turnstile/i.test(m)) return 'No pudimos verificar que no eres un robot. Recarga la página e inténtalo de nuevo.';
  if (/failed to fetch|network/i.test(m)) return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.';
  return m;
}

/**
 * Datos del panel del hotel.
 *  - Sesión real de Supabase Auth (correo y contraseña).
 *  - El hotel y el rol salen de hotel_staff (user_id = usuario de la sesión).
 *  - RLS: solo ve su hotel; de los tours, solo los propios (los de Seven Stay
 *    y sus reservas los gestiona Seven Stay).
 *  - Realtime en tickets, habitaciones, hotel y equipo: todo se actualiza solo.
 */
export function PanelStayProvider({ children }: { children: ReactNode }) {
  const idioma = useIdioma();
  const cliente = useMemo(() => (supabaseConfigurado ? clientePanel() : null), []);

  // undefined = todavía verificando la sesión guardada
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined);
  const [datos, setDatos] = useState<DatosPanel | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const datosActuales = useRef<DatosPanel | null>(null);
  useEffect(() => {
    datosActuales.current = datos;
  }, [datos]);

  // Sesión guardada + cambios (login, logout, otra pestaña).
  useEffect(() => {
    if (!cliente) return;
    let activo = true;
    void cliente.auth.getSession().then(({ data }) => activo && setSesion(data.session));
    const { data } = cliente.auth.onAuthStateChange((_evento, nueva) => setSesion(nueva));
    return () => {
      activo = false;
      data.subscription.unsubscribe();
    };
  }, [cliente]);

  const uid = sesion?.user.id ?? null;

  // ------------------------------------------------------------------ lecturas
  const leerTickets = useCallback(
    async (hotelId: string) => {
      if (!cliente) return [];
      const { data, error } = await cliente
        .from('tickets')
        .select('*')
        .eq('hotel_id', hotelId)
        .order('creado_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map(aTicket);
    },
    [cliente],
  );

  const leerHabitaciones = useCallback(
    async (hotelId: string) => {
      if (!cliente) return [];
      const { data, error } = await cliente.from('rooms').select('*').eq('hotel_id', hotelId);
      if (error) throw error;
      return (data ?? [])
        .map(aHabitacion)
        .sort((a, b) => a.numero.localeCompare(b.numero, 'es', { numeric: true }));
    },
    [cliente],
  );

  const leerHotel = useCallback(
    async (hotelId: string) => {
      if (!cliente) return HOTEL_VACIO;
      const { data, error } = await cliente.from('hotels').select('*').eq('id', hotelId).single();
      if (error) throw error;
      return aHotel(data);
    },
    [cliente],
  );

  const leerPersonal = useCallback(
    async (hotelId: string) => {
      if (!cliente) return [];
      const { data, error } = await cliente.from('hotel_staff').select('*').eq('hotel_id', hotelId).order('nombre');
      if (error) throw error;
      return (data ?? []).map(aPersonal);
    },
    [cliente],
  );

  const leerMenu = useCallback(
    async (hotelId: string) => {
      if (!cliente) return [];
      // Platos del menú y tours propios del hotel (los de Seven Stay no se gestionan aquí).
      const [menu, tours] = await Promise.all([
        cliente.from('menu_items').select('*').eq('hotel_id', hotelId).order('titulo_es'),
        cliente.from('curated_tours').select('*').eq('hotel_id', hotelId).order('titulo_es'),
      ]);
      if (menu.error) throw menu.error;
      if (tours.error) throw tours.error;
      return [...(menu.data ?? []).map(aPlato), ...(tours.data ?? []).map(aTour)];
    },
    [cliente],
  );

  const leerCategorias = useCallback(
    async (hotelId: string) => {
      if (!cliente) return [];
      const { data, error } = await cliente
        .from('menu_categorias')
        .select('*')
        .eq('hotel_id', hotelId)
        .order('orden')
        .order('nombre_es');
      if (error) throw error;
      return (data ?? []).map(aCategoria);
    },
    [cliente],
  );

  // Carga completa al iniciar sesión.
  useEffect(() => {
    if (!cliente || !uid) return;
    let cancelado = false;
    const cargar = async () => {
      try {
        const { data: yo, error } = await cliente.from('hotel_staff').select('hotel_id, rol').eq('user_id', uid).maybeSingle();
        if (error) throw error;
        if (!yo) {
          if (!cancelado)
            setDatos({ uid, hotelId: null, rol: 'recepcion', hotel: HOTEL_VACIO, habitaciones: [], tickets: [], personal: [], menu: [], categorias: [] });
          return;
        }
        const hotelId = String(yo.hotel_id);
        const [hotel, habitaciones, tickets, personal, menu, categorias] = await Promise.all([
          leerHotel(hotelId),
          leerHabitaciones(hotelId),
          leerTickets(hotelId),
          leerPersonal(hotelId),
          leerMenu(hotelId),
          leerCategorias(hotelId),
        ]);
        if (cancelado) return;
        setMensajeError(null);
        setDatos({
          uid,
          hotelId,
          rol: yo.rol === 'supervisor_gerente' ? 'supervisor_gerente' : 'recepcion',
          hotel,
          habitaciones,
          tickets,
          personal,
          menu,
          categorias,
        });
      } catch (error) {
        if (!cancelado) setMensajeError(mensajeDe(error));
      }
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [cliente, uid, leerHotel, leerHabitaciones, leerTickets, leerPersonal, leerMenu, leerCategorias]);

  const hotelIdListo = datos && datos.uid === uid ? datos.hotelId : null;

  /** Vuelve a leer una parte (tras una acción o un aviso de Realtime). */
  const refrescar = useCallback(
    async (parte: 'tickets' | 'habitaciones' | 'hotel' | 'personal' | 'menu' | 'categorias') => {
      const actual = datosActuales.current;
      if (!actual?.hotelId) return;
      const id = actual.hotelId;
      try {
        if (parte === 'tickets') {
          const tickets = await leerTickets(id);
          setDatos((d) => (d && d.hotelId === id ? { ...d, tickets } : d));
        } else if (parte === 'habitaciones') {
          const habitaciones = await leerHabitaciones(id);
          setDatos((d) => (d && d.hotelId === id ? { ...d, habitaciones } : d));
        } else if (parte === 'hotel') {
          const hotel = await leerHotel(id);
          setDatos((d) => (d && d.hotelId === id ? { ...d, hotel } : d));
        } else if (parte === 'categorias') {
          const categorias = await leerCategorias(id);
          setDatos((d) => (d && d.hotelId === id ? { ...d, categorias } : d));
        } else if (parte === 'menu') {
          const menu = await leerMenu(id);
          setDatos((d) => (d && d.hotelId === id ? { ...d, menu } : d));
        } else {
          const personal = await leerPersonal(id);
          setDatos((d) => (d && d.hotelId === id ? { ...d, personal } : d));
        }
      } catch {
        // se reintentará con el próximo aviso
      }
    },
    [leerTickets, leerHabitaciones, leerHotel, leerPersonal, leerMenu, leerCategorias],
  );

  // En vivo (Realtime): cada cambio en la base vuelve a leer esa parte.
  useEffect(() => {
    if (!cliente || !hotelIdListo) return;
    const pendientes = new Map<string, ReturnType<typeof setTimeout>>();
    const programar = (parte: 'tickets' | 'habitaciones' | 'hotel' | 'personal' | 'menu') => () => {
      clearTimeout(pendientes.get(parte));
      pendientes.set(parte, setTimeout(() => void refrescar(parte), 150));
    };
    const filtro = `hotel_id=eq.${hotelIdListo}`;
    const canal = cliente
      .channel(`panel-${hotelIdListo}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: filtro }, programar('tickets'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: filtro }, programar('habitaciones'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hotel_staff', filter: filtro }, programar('personal'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hotels', filter: `id=eq.${hotelIdListo}` }, programar('hotel'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'curated_tours', filter: filtro }, programar('menu'))
      .subscribe();
    // Respaldo: si la conexión en vivo se cortó (laptop dormida), al volver se resincroniza.
    const alVolver = () => {
      void refrescar('tickets');
      void refrescar('habitaciones');
    };
    window.addEventListener('focus', alVolver);
    return () => {
      pendientes.forEach((t) => clearTimeout(t));
      window.removeEventListener('focus', alVolver);
      void cliente.removeChannel(canal);
    };
  }, [cliente, hotelIdListo, refrescar]);

  // Horario de silencio: al terminar, las solicitudes "Programadas" pasan solas a "Sin asignar".
  // La base de datos decide si ya terminó; el panel solo le pregunta al abrir y cada minuto.
  useEffect(() => {
    if (!cliente || !hotelIdListo) return;
    const liberar = async () => {
      const { data } = await cliente.rpc('staff_liberar_programados');
      if (typeof data === 'number' && data > 0) void refrescar('tickets');
    };
    void liberar();
    const intervalo = setInterval(() => void liberar(), 60_000);
    window.addEventListener('focus', liberar);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener('focus', liberar);
    };
  }, [cliente, hotelIdListo, refrescar]);

  // ------------------------------------------------------------------ acciones
  /** Ejecuta una función de la base de datos, muestra el error si falla y refresca. */
  const ejecutar = useCallback(
    async (funcion: string, parametros: Record<string, unknown>, refrescos: ('tickets' | 'habitaciones')[]) => {
      if (!cliente) return;
      const { error } = await cliente.rpc(funcion, parametros);
      if (error) setErrorAccion(mensajeDe(error));
      await Promise.all(refrescos.map((p) => refrescar(p)));
    },
    [cliente, refrescar],
  );

  const idHabitacion = useCallback(
    (numero: string) => datosActuales.current?.habitaciones.find((h) => h.numero === numero)?.id,
    [],
  );

  const valor = useMemo<StayContextValue>(() => {
    const listos = datos && datos.uid === uid ? datos : null;
    let estadoCarga: EstadoCarga;
    if (!cliente) estadoCarga = 'error';
    else if (sesion === undefined) estadoCarga = 'cargando';
    else if (sesion === null) estadoCarga = 'sin_sesion';
    else if (mensajeError && !listos) estadoCarga = 'error';
    else if (!listos) estadoCarga = 'cargando';
    else if (!listos.hotelId) estadoCarga = 'sin_hotel';
    else estadoCarga = 'listo';

    return {
      estadoCarga,
      mensajeError: cliente ? mensajeError : 'Supabase no está configurado (.env.local).',
      errorAccion,
      limpiarErrorAccion: () => setErrorAccion(null),
      hidratado: estadoCarga === 'listo',
      hotel: listos?.hotel ?? HOTEL_VACIO,
      habitaciones: listos?.habitaciones ?? [],
      tickets: listos?.tickets ?? [],
      catalogo: listos?.menu ?? [],
      categoriasMenu: listos?.categorias ?? [],
      personal: listos?.personal ?? [],
      misTicketIds: [],
      idioma,
      setIdioma,
      crearTicket: noDisponible,
      cancelarTicket: noDisponible,
      escalarTicket: async (ticketId, opciones) => {
        await ejecutar('staff_escalar_ticket', { p_ticket: ticketId, p_motivo: opciones?.motivo ?? null }, ['tickets']);
      },
      rolPanel: listos?.rol ?? 'recepcion',
      correoUsuario: sesion?.user.email ?? null,
      iniciarSesion: async (correo, clave) => {
        if (!cliente) return 'Supabase no está configurado.';
        try {
          // Con CAPTCHA activo en Supabase, el login también necesita el token de Turnstile.
          const captchaToken = await obtenerTokenCaptcha('es');
          const { error } = await cliente.auth.signInWithPassword({ email: correo, password: clave, options: { captchaToken } });
          return error ? mensajeLogin(error) : null;
        } catch (error) {
          return mensajeLogin(error);
        }
      },
      cerrarSesion: async () => {
        await cliente?.auth.signOut();
      },
      validarEstadia: async (numero, aprobada) => {
        const id = idHabitacion(numero);
        if (!id) return;
        await ejecutar(
          aprobada ? 'staff_activar_estadia' : 'staff_vaciar_habitacion',
          aprobada ? { p_room: id } : { p_room: id, p_motivo: 'validacion_rechazada' },
          ['tickets', 'habitaciones'],
        );
      },
      aceptarTicket: async (ticketId, nombre) => {
        await ejecutar('staff_aceptar_ticket', { p_ticket: ticketId, p_nombre: nombre }, ['tickets']);
      },
      resolverTicket: async (ticketId) => {
        await ejecutar('staff_resolver_ticket', { p_ticket: ticketId }, ['tickets']);
      },
      rechazarTicket: async (ticketId, motivo) => {
        await ejecutar('staff_rechazar_ticket', { p_ticket: ticketId, p_motivo: motivo ?? null }, ['tickets']);
      },
      activarEstadiaManual: async (numero) => {
        const id = idHabitacion(numero);
        if (id) await ejecutar('staff_activar_estadia', { p_room: id }, ['tickets', 'habitaciones']);
      },
      hacerCheckout: async (numero) => {
        const id = idHabitacion(numero);
        if (id) await ejecutar('staff_vaciar_habitacion', { p_room: id, p_motivo: 'cerrado_por_checkout' }, ['tickets', 'habitaciones']);
      },
      actualizarHotel: async (cambios: DatosHotelEditables) => {
        const id = datosActuales.current?.hotelId;
        if (!cliente || !id) return false;
        const { error } = await cliente.from('hotels').update(cambios).eq('id', id);
        if (error) {
          setErrorAccion(mensajeDe(error));
          return false;
        }
        await refrescar('hotel');
        return true;
      },
      toggleTurnoPersonal: async (id) => {
        const persona = datosActuales.current?.personal.find((p) => p.id === id);
        if (!cliente || !persona) return;
        const { error } = await cliente.from('hotel_staff').update({ en_turno: !persona.en_turno }).eq('id', id);
        if (error) setErrorAccion(mensajeDe(error));
        await refrescar('personal');
      },
      agregarPersonal: async (persona: NuevoPersonal) => {
        const hotelId = datosActuales.current?.hotelId;
        if (!cliente || !hotelId) return false;
        const { error } = await cliente.from('hotel_staff').insert({
          hotel_id: hotelId,
          nombre: persona.nombre,
          rol: persona.rol,
          telefono_whatsapp: persona.telefono_whatsapp,
          en_turno: true,
        });
        if (error) setErrorAccion(mensajeDe(error));
        await refrescar('personal');
        return !error;
      },
      eliminarPersonal: async (id: string) => {
        const hotelId = datosActuales.current?.hotelId;
        if (!cliente || !hotelId) return false;
        const { error } = await cliente.from('hotel_staff').delete().eq('id', id).eq('hotel_id', hotelId);
        if (error) setErrorAccion(mensajeDe(error));
        await refrescar('personal');
        return !error;
      },
      guardarPlato: async ({ id, ...campos }: DatosPlato) => {
        const hotelId = datosActuales.current?.hotelId;
        if (!cliente || !hotelId) return false;
        const anterior = id ? datosActuales.current?.menu.find((p) => p.id === id) : undefined;
        const { error } = id
          ? await cliente.from('menu_items').update(campos).eq('id', id).eq('hotel_id', hotelId)
          : await cliente.from('menu_items').insert({ ...campos, hotel_id: hotelId });
        if (error) setErrorAccion(mensajeDe(error));
        // Si se cambió o quitó la foto, se borra la anterior del bucket.
        const rutaAnterior = rutaImagenMenu(anterior?.imagen_url);
        if (!error && rutaAnterior && anterior?.imagen_url !== campos.imagen_url) {
          await cliente.storage.from(BUCKET_MENU).remove([rutaAnterior]);
        }
        await refrescar('menu');
        return !error;
      },
      eliminarPlato: async (id: string) => {
        const hotelId = datosActuales.current?.hotelId;
        if (!cliente || !hotelId) return false;
        const ruta = rutaImagenMenu(datosActuales.current?.menu.find((p) => p.id === id)?.imagen_url);
        const { error } = await cliente.from('menu_items').delete().eq('id', id).eq('hotel_id', hotelId);
        if (error) setErrorAccion(mensajeDe(error));
        if (!error && ruta) await cliente.storage.from(BUCKET_MENU).remove([ruta]);
        await refrescar('menu');
        return !error;
      },
      guardarTour: async ({ id, ...campos }: DatosTour) => {
        const hotelId = datosActuales.current?.hotelId;
        if (!cliente || !hotelId) return false;
        const anterior = id ? datosActuales.current?.menu.find((t) => t.id === id && t.tipo === 'tour') : undefined;
        const { error } = id
          ? await cliente.from('curated_tours').update(campos).eq('id', id).eq('hotel_id', hotelId)
          : await cliente.from('curated_tours').insert({ ...campos, hotel_id: hotelId });
        if (error) setErrorAccion(mensajeDe(error));
        const rutaAnterior = rutaImagenMenu(anterior?.imagen_url);
        if (!error && rutaAnterior && anterior?.imagen_url !== campos.imagen_url) {
          await cliente.storage.from(BUCKET_MENU).remove([rutaAnterior]);
        }
        await refrescar('menu');
        return !error;
      },
      eliminarTour: async (id: string) => {
        const hotelId = datosActuales.current?.hotelId;
        if (!cliente || !hotelId) return false;
        const ruta = rutaImagenMenu(datosActuales.current?.menu.find((t) => t.id === id && t.tipo === 'tour')?.imagen_url);
        const { error } = await cliente.from('curated_tours').delete().eq('id', id).eq('hotel_id', hotelId);
        if (error) setErrorAccion(mensajeDe(error));
        if (!error && ruta) await cliente.storage.from(BUCKET_MENU).remove([ruta]);
        await refrescar('menu');
        return !error;
      },
      guardarCategoria: async ({ id, ...campos }: DatosCategoria) => {
        const actual = datosActuales.current;
        if (!cliente || !actual?.hotelId) return false;
        const orden = actual.categorias.reduce((max, c) => Math.max(max, c.orden), 0) + 1;
        const { error } = id
          ? await cliente.from('menu_categorias').update(campos).eq('id', id).eq('hotel_id', actual.hotelId)
          : await cliente.from('menu_categorias').insert({ ...campos, orden, hotel_id: actual.hotelId });
        if (error) setErrorAccion(mensajeDe(error));
        await refrescar('categorias');
        return !error;
      },
      eliminarCategoria: async (id: string) => {
        const hotelId = datosActuales.current?.hotelId;
        if (!cliente || !hotelId) return false;
        const { error } = await cliente.from('menu_categorias').delete().eq('id', id).eq('hotel_id', hotelId);
        if (error) setErrorAccion(mensajeDe(error));
        await Promise.all([refrescar('categorias'), refrescar('menu')]);
        return !error;
      },
      ordenarCategorias: async (ids: string[]) => {
        const actual = datosActuales.current;
        if (!cliente || !actual?.hotelId) return false;
        const hotelId = actual.hotelId;
        // Solo se escriben las que cambiaron de lugar.
        const cambios = ids
          .map((id, i) => ({ id, orden: i + 1 }))
          .filter(({ id, orden }) => actual.categorias.find((c) => c.id === id)?.orden !== orden);
        const resultados = await Promise.all(
          cambios.map(({ id, orden }) => cliente.from('menu_categorias').update({ orden }).eq('id', id).eq('hotel_id', hotelId)),
        );
        const error = resultados.find((r) => r.error)?.error;
        if (error) setErrorAccion(mensajeDe(error));
        await refrescar('categorias');
        return !error;
      },
      subirImagenMenu: async (dataUrl: string) => {
        const hotelId = datosActuales.current?.hotelId;
        if (!cliente || !hotelId) return null;
        const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
        const ruta = `${hotelId}/${id}.jpg`;
        try {
          const { error } = await cliente.storage
            .from(BUCKET_MENU)
            .upload(ruta, await blobDeDataUrl(dataUrl), { contentType: 'image/jpeg', upsert: false });
          if (error) {
            setErrorAccion(mensajeDe(error));
            return null;
          }
        } catch (error) {
          setErrorAccion(mensajeDe(error));
          return null;
        }
        return cliente.storage.from(BUCKET_MENU).getPublicUrl(ruta).data.publicUrl;
      },
      recargar: async () => {
        await Promise.all([
          refrescar('tickets'),
          refrescar('habitaciones'),
          refrescar('hotel'),
          refrescar('personal'),
          refrescar('menu'),
          refrescar('categorias'),
        ]);
      },
    };
  }, [cliente, sesion, uid, datos, mensajeError, errorAccion, idioma, ejecutar, refrescar, idHabitacion]);

  return <StayContext.Provider value={valor}>{children}</StayContext.Provider>;
}
