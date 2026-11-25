import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { configRecibos, guardarConfigRecibos, recibosPendientes, crearRecibo, pagosPendientes, crearPagoEnlace, pdfFirmado } from "./recibos.ts";
import { resumenServicio, borradorServicio, textoServicios } from "./servicios.ts";

// Conexión de la app con Alegra. El correo y el token solo existen aquí, en el servidor.
// Las facturas se crean como BORRADORES: no se envía nada a la DIAN. El contador las revisa y emite en Alegra.
// Recibos de caja (aportes para terceros y honorarios) y pagos a Enlace: ver recibos.ts.
// Cursos, actualizaciones y enrolamientos de muelles (desde la app Muelles y Seguros): ver servicios.ts.
// Los valores siempre se toman de la base de datos, nunca de lo que mande el navegador
// (salvo el valor de la planilla del recibo y del pago, que el administrador confirma a mano).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALEGRA_EMAIL = (Deno.env.get("ALEGRA_EMAIL") || "").trim();
const ALEGRA_TOKEN = (Deno.env.get("ALEGRA_TOKEN") || "").trim();
const ALEGRA_API = "https://api.alegra.com/api/v1";
const PREFIJO = "FE";
const NOMBRE_ITEM = "Gestión de seguridad social";
const MEDIOS_PAGO = new Set(["BANK_DEPOSIT", "CREDIT_TRANSFER_BANK", "CASH", "MUTUAL_AGREEMENT"]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
});

class ErrorAlegra extends Error {
  status = 0; texto = "";
  constructor(m: string, status = 0, texto = "") { super(m); this.status = status; this.texto = texto; }
}

async function pedirAlegra(ruta: string, opciones: RequestInit = {}) {
  const resp = await fetch(`${ALEGRA_API}${ruta}`, {
    ...opciones,
    headers: {
      "Authorization": `Basic ${btoa(`${ALEGRA_EMAIL}:${ALEGRA_TOKEN}`)}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
  });
  const texto = await resp.text();
  let datos: any = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { /* respuesta sin JSON */ }
  return { resp, texto, datos };
}
async function alegra(ruta: string, opciones: RequestInit = {}) {
  const { resp, texto, datos } = await pedirAlegra(ruta, opciones);
  if (resp.status === 401 || resp.status === 403) {
    throw new ErrorAlegra("Alegra rechazó el correo o el token. Revise ALEGRA_EMAIL y ALEGRA_TOKEN en Supabase.");
  }
  if (!resp.ok) {
    // Se anota la respuesta completa en los registros de la función para poder revisar la causa
    console.error(`Alegra ${opciones.method || "GET"} ${ruta.split("?")[0]} respondió ${resp.status}: ${texto.slice(0, 1500)}`);
    throw new ErrorAlegra(`Alegra respondió ${resp.status}: ${datos?.message || datos?.error?.message || texto.slice(0, 300)}`, resp.status, texto);
  }
  return datos;
}

async function numeracionFE() {
  const lista = await alegra("/number-templates?documentType=invoice&limit=30");
  const filas = Array.isArray(lista) ? lista : (lista?.data || []);
  const fe = filas.find((t: any) => String(t.prefix || "").trim() === PREFIJO && t.status !== "inactive" && t.isElectronic !== false);
  if (!fe) throw new ErrorAlegra("No encontré en Alegra la numeración electrónica con prefijo FE.");
  return fe;
}

// Igual que en la app: quita tildes, pasa a minúsculas y deja un solo espacio
const normResp = (v: unknown) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const GRUPOS_NO_PERSONA = ["", "psn", "prosegurosnet", "conductor", "conductores", "mensajero", "mensajeros", "mensajeria"];
const esGrupoGeneral = (k: string) => GRUPOS_NO_PERSONA.includes(k) || /^muelle/.test(k) || /^independ/.test(k) || /^me+n+saj/.test(k);

function partesNombre(nombre: string, guardadas: unknown) {
  if (Array.isArray(guardadas) && guardadas[0] && guardadas[2]) {
    return { lastName: guardadas[0], secondLastName: guardadas[1] || "", firstName: guardadas[2], secondName: guardadas[3] || "" };
  }
  // En la app el nombre va como APELLIDOS + NOMBRES
  const p = String(nombre).toUpperCase().trim().split(/\s+/);
  if (p.length >= 4) return { lastName: p[0], secondLastName: p[1], firstName: p[2], secondName: p.slice(3).join(" ") };
  if (p.length === 3) return { lastName: p[0], secondLastName: p[1], firstName: p[2], secondName: "" };
  return { lastName: p[0] || "", secondLastName: "", firstName: p[1] || "", secondName: "" };
}

interface Destinatario { tipo: string; documento: string; dv?: string; nombre: string; correo?: string; telefono?: string; direccion?: string; partes?: any; }

async function contactoDe(d: Destinatario) {
  const hallados = await alegra(`/contacts?identification=${encodeURIComponent(d.documento)}&limit=30`);
  const filas = Array.isArray(hallados) ? hallados : (hallados?.data || []);
  const exacto = filas.find((x: any) => String(x.identificationObject?.number || x.identification || "") === d.documento);
  if (exacto) return exacto.id;
  const persona = d.tipo !== "NIT";
  const cuerpo: Record<string, unknown> = {
    name: persona && d.partes ? [d.partes.firstName, d.partes.secondName, d.partes.lastName, d.partes.secondLastName].filter(Boolean).join(" ") : d.nombre,
    identification: d.documento,
    identificationObject: { type: d.tipo, number: d.documento, ...(d.dv ? { dv: d.dv } : {}) },
    kindOfPerson: persona ? "PERSON_ENTITY" : "LEGAL_ENTITY",
    regime: "SIMPLIFIED_REGIME",
    type: ["client"],
    ignoreRepeated: false,
  };
  if (persona && d.partes) cuerpo.nameObject = d.partes;
  if (d.correo) cuerpo.email = d.correo;
  if (d.telefono) { cuerpo.mobile = d.telefono; cuerpo.phonePrimary = d.telefono; }
  if (d.direccion) cuerpo.address = { address: d.direccion };
  const creado = await alegra("/contacts", { method: "POST", body: JSON.stringify(cuerpo) });
  return creado.id;
}

async function itemDeServicio(admin: any, llave: string, nombre: string, referencia: string, precio: number) {
  const { data: conf } = await admin.from("configuracion").select("valor").eq("clave", "alegra").maybeSingle();
  if (conf?.valor?.[llave]) return conf.valor[llave];
  const item = await alegra("/items", {
    method: "POST",
    body: JSON.stringify({ name: nombre, type: "service", reference: referencia, price: [{ price: precio }] }),
  });
  await admin.from("configuracion").upsert({ clave: "alegra", valor: { ...(conf?.valor || {}), [llave]: item.id } });
  return item.id;
}
const itemServicio = (admin: any, precio: number) => itemDeServicio(admin, "item_id", NOMBRE_ITEM, "PSN-SEGSOCIAL", precio);
const itemMuelles = (admin: any, precio: number) => itemDeServicio(admin, "item_muelle_id", "Servicios de muelles", "PSN-MUELLES", precio);

// Crea el borrador. Si Alegra rechaza el ítem nuevo «Servicios de muelles» (25-nov-2026 respondió 400 «Unauthorized»),
// se vuelve a intentar con el ítem de servicio que ya funciona; la línea conserva su descripción (Enrolamiento, Curso…).
async function crearFactura(admin: any, cuerpo: any) {
  try {
    return await alegra("/invoices", { method: "POST", body: JSON.stringify(cuerpo) });
  } catch (e) {
    const { data: conf } = await admin.from("configuracion").select("valor").eq("clave", "alegra").maybeSingle();
    const muelleId = conf?.valor?.item_muelle_id;
    if (!(e instanceof ErrorAlegra) || e.status !== 400 || !muelleId || !cuerpo.items.some((i: any) => String(i.id) === String(muelleId))) throw e;
    const general = await itemServicio(admin, cuerpo.items[0].price);
    if (String(general) === String(muelleId)) throw e;
    console.error("Se reintenta la factura con el ítem general de servicio.");
    return await alegra("/invoices", { method: "POST", body: JSON.stringify({ ...cuerpo, items: cuerpo.items.map((i: any) => ({ ...i, id: general })) }) });
  }
}

// Si un borrador se eliminó en Alegra, el cliente vuelve a quedar libre para facturar
async function liberarBorradoresEliminados(admin: any, mes: string) {
  const { data: filas } = await admin.from("facturas_alegra").select("alegra_id").eq("mes", mes).eq("estado", "borrador");
  const ids = [...new Set((filas || []).map((f: any) => f.alegra_id).filter(Boolean))] as string[];
  for (const id of ids) {
    const { resp, datos } = await pedirAlegra(`/invoices/${encodeURIComponent(id)}`);
    if (resp.status === 404) await admin.from("facturas_alegra").delete().eq("alegra_id", id).eq("estado", "borrador");
    else if (resp.ok && datos?.status && datos.status !== "draft") {
      await admin.from("facturas_alegra").update({ estado: "emitida", numero: datos?.numberTemplate?.fullNumber || null }).eq("alegra_id", id);
    }
  }
}

const CAMPOS_CLIENTE = "cedula, nombre, correo, telefono, direccion_completa, costo_servicio, estado_tramite, responsable_grupo, servicios_muelle";
const esFacturable = (x: any, ya: Set<string>) => String(x.estado_tramite || "").toUpperCase().startsWith("PAGO") && Number(x.costo_servicio) > 0 && !ya.has(x.cedula);
const hoyBogota = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

// Lo que necesita servicios.ts (facturar cursos, actualizaciones y enrolamientos de muelles)
const ayudas = { alegra, crearFactura, numeracionFE, contactoDe, itemDeServicio, liberarBorradoresEliminados, partesNombre, normResp, esGrupoGeneral, hoyBogota, MEDIOS_PAGO };

// Lo que falta por crear este mes: una fila por responsable y una por cliente sin responsable
async function pendientesDelMes(admin: any, mes: string) {
  const { data: mesFila } = await admin.from("months").select("id").eq("name", mes).maybeSingle();
  if (!mesFila) return { error: "No encontré ese mes.", status: 404 };
  await liberarBorradoresEliminados(admin, mes);
  const { data: yaFacturadas } = await admin.from("facturas_alegra").select("cedula").eq("mes", mes);
  const ya = new Set<string>((yaFacturadas || []).map((f: any) => f.cedula));
  const { data: todos } = await admin.from("clients").select(CAMPOS_CLIENTE).eq("month_id", mesFila.id);
  const { data: resps } = await admin.from("responsables").select("*");
  const porClave = new Map((resps || []).map((r: any) => [r.clave || normResp(r.nombre), r]));
  const grupos = new Map<string, any>();
  for (const c of (todos || [])) {
    if (!esFacturable(c, ya)) continue;
    const clave = normResp(c.responsable_grupo);
    const r: any = clave && !esGrupoGeneral(clave) ? (porClave.get(clave) || { nombre: c.responsable_grupo }) : null;
    const deResponsable = r && !r.factura_individual;
    const llave = deResponsable ? `r:${clave}` : `c:${c.cedula}`;
    if (!grupos.has(llave)) {
      const faltan: string[] = [];
      if (deResponsable && !String(r.nombre_factura || "").trim()) faltan.push("nombre");
      if (deResponsable && !String(r.documento || "").trim()) faltan.push("cédula o NIT");
      const correo = String((deResponsable ? r.correo : c.correo) || "").trim();
      grupos.set(llave, {
        cedula: c.cedula, tipo: deResponsable ? "responsable" : "cliente",
        nombre: deResponsable ? (String(r.nombre_factura || "").trim() || r.nombre) : c.nombre,
        responsable: deResponsable ? r.nombre : null,
        documento: deResponsable ? String(r.documento || "") : c.cedula, faltan, sinCorreo: !correo, clientes: 0, total: 0,
      });
    }
    const g = grupos.get(llave);
    g.clientes++; g.total += Number(c.costo_servicio);
  }
  return { pendientes: [...grupos.values()].sort((a, b) => a.faltan.length - b.faltan.length || b.total - a.total), yaCreadas: ya.size };
}

// Decide a quién va la factura y qué clientes lleva
async function armarFactura(admin: any, cedula: string, mes: string) {
  const { data: mesFila } = await admin.from("months").select("id").eq("name", mes).maybeSingle();
  if (!mesFila) return { error: "No encontré ese mes.", status: 404 };
  const { data: c } = await admin.from("clients").select(CAMPOS_CLIENTE).eq("month_id", mesFila.id).eq("cedula", cedula).maybeSingle();
  if (!c) return { error: "No encontré ese cliente en ese mes.", status: 404 };

  await liberarBorradoresEliminados(admin, mes);
  const { data: yaFacturadas } = await admin.from("facturas_alegra").select("cedula").eq("mes", mes);
  const ya = new Set<string>((yaFacturadas || []).map((f: any) => f.cedula));
  const facturable = (x: any) => esFacturable(x, ya);

  const clave = normResp(c.responsable_grupo);
  let resp: any = null;
  if (clave && !esGrupoGeneral(clave)) {
    const { data } = await admin.from("responsables").select("*").eq("clave", clave).maybeSingle();
    resp = data || { nombre: c.responsable_grupo, clave };
    if (resp.factura_individual) resp = null;
  }

  if (!resp) {
    if (ya.has(cedula)) return { error: "Este cliente ya tiene factura de este mes en Alegra.", status: 409 };
    if (!facturable(c)) return { error: "El cliente no está en PAGO este mes o no tiene costo del servicio.", status: 400 };
    const { data: conf } = await admin.from("configuracion").select("valor").eq("clave", "nombres_pila").maybeSingle();
    const partes = partesNombre(c.nombre, conf?.valor?.[cedula]);
    const destino: Destinatario = { tipo: "CC", documento: cedula, nombre: String(c.nombre).toUpperCase(), correo: String(c.correo || "").trim(), telefono: String(c.telefono || "").trim(), direccion: String(c.direccion_completa || "").trim(), partes };
    return { destino, clientes: [c], responsable: null, faltan: [], avisos: destino.correo ? [] : ["El cliente no tiene correo."] };
  }

  const { data: todos } = await admin.from("clients").select(CAMPOS_CLIENTE).eq("month_id", mesFila.id);
  const clientes = (todos || []).filter((x: any) => normResp(x.responsable_grupo) === clave && facturable(x));
  if (!clientes.length) return { error: `${resp.nombre} no tiene clientes pagados sin facturar este mes.`, status: 400 };

  const faltan: string[] = [];
  const nombreFactura = String(resp.nombre_factura || "").trim();
  const documento = String(resp.documento || "").replace(/[^\dA-Za-z-]/g, "");
  if (!nombreFactura) faltan.push("nombre o razón social");
  if (!documento) faltan.push("cédula o NIT");
  const [numero, dv] = documento.split("-");
  const tipo = resp.tipo_doc || "CC";
  const destino: Destinatario = { tipo, documento: numero || "", dv, nombre: nombreFactura.toUpperCase(), correo: String(resp.correo || "").trim(), telefono: String(resp.telefono || "").trim(), partes: tipo === "NIT" ? undefined : partesNombre(nombreFactura, null) };
  return { destino, clientes, responsable: resp.nombre, faltan, avisos: destino.correo ? [] : ["El responsable no tiene correo."] };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: quien, error: errQuien } = await admin.auth.getUser(token);
  if (errQuien || !quien?.user) return json({ error: "No autenticado" }, 401);
  const { data: perfil } = await admin.from("profiles").select("role").eq("id", quien.user.id).maybeSingle();
  if (perfil?.role !== "admin") return json({ error: "Por ahora solo el administrador puede facturar." }, 403);
  if (!ALEGRA_EMAIL || !ALEGRA_TOKEN) return json({ error: "Faltan ALEGRA_EMAIL o ALEGRA_TOKEN en Supabase." }, 500);

  let cuerpo: any;
  try { cuerpo = await req.json(); } catch { return json({ error: "Cuerpo inválido" }, 400); }

  try {
    const cedula = String(cuerpo.cedula || "").trim();
    const mes = String(cuerpo.mes || "").trim();
    // Recibos de caja
    if (cuerpo.accion === "recibos_config") return json(await configRecibos(admin, alegra));
    if (cuerpo.accion === "recibos_config_guardar") {
      const r: any = await guardarConfigRecibos(admin, String(cuerpo.banco_id || ""), String(cuerpo.cuenta_id || ""), String(cuerpo.enlace_id || ""));
      return r.error ? json({ error: r.error }, r.status) : json(r);
    }
    if (cuerpo.accion === "recibos_pendientes") {
      if (!mes) return json({ error: "Falta el mes." }, 400);
      const r: any = await recibosPendientes(admin, pedirAlegra, mes);
      return r.error ? json({ error: r.error }, r.status) : json(r);
    }
    if (cuerpo.accion === "recibo") {
      const r: any = await crearRecibo(admin, alegra, pedirAlegra, quien.user.id, cuerpo, hoyBogota());
      return r.error ? json({ error: r.error }, r.status) : json(r);
    }
    if (cuerpo.accion === "pagos_pendientes") {
      if (!mes) return json({ error: "Falta el mes." }, 400);
      const r: any = await pagosPendientes(admin, pedirAlegra, mes);
      return r.error ? json({ error: r.error }, r.status) : json(r);
    }
    if (cuerpo.accion === "pago_enlace") {
      const r: any = await crearPagoEnlace(admin, alegra, pedirAlegra, quien.user.id, cuerpo, hoyBogota());
      return r.error ? json({ error: r.error }, r.status) : json(r);
    }
    if (cuerpo.accion === "pdf") {
      const r: any = await pdfFirmado(admin, pedirAlegra, cuerpo);
      return r.error ? json({ error: r.error }, r.status) : json(r);
    }
    // Cursos, actualizaciones y enrolamientos de muelles (app Muelles y Seguros)
    if (cuerpo.accion === "servicio_resumen") {
      if (!cedula || !mes) return json({ error: "Faltan la cédula o el mes." }, 400);
      const r: any = await resumenServicio(admin, ayudas, cedula, mes);
      return r.error ? json({ error: r.error }, r.status) : json(r);
    }
    if (cuerpo.accion === "servicio_borrador") {
      const r: any = await borradorServicio(admin, ayudas, quien.user.id, cuerpo);
      return r.error ? json({ error: r.error }, r.status) : json(r);
    }
    // El contador indicó (10 nov. 2026) que la gestión de cobro de incapacidades no se factura
    if (cuerpo.accion === "incapacidad") return json({ error: "Por indicación del contador, la gestión de cobro de incapacidades no se factura." }, 400);
    if (cuerpo.accion === "pendientes") {
      if (!mes) return json({ error: "Falta el mes." }, 400);
      const fePend = await numeracionFE();
      const r: any = await pendientesDelMes(admin, mes);
      if (r.error) return json({ error: r.error }, r.status);
      return json({ ok: true, prefijo: fePend.prefix, ...r });
    }
    if (cuerpo.accion !== "resumen" && cuerpo.accion !== "borrador") return json({ error: "Acción no válida" }, 400);
    if (!cedula || !mes) return json({ error: "Faltan la cédula o el mes." }, 400);

    const fe = await numeracionFE();
    const armada: any = await armarFactura(admin, cedula, mes);
    if (armada.error) return json({ error: armada.error }, armada.status);
    const { destino, clientes, responsable, faltan, avisos } = armada;
    const lista = clientes.map((c: any) => ({ cedula: c.cedula, nombre: c.nombre, valor: Number(c.costo_servicio), servicios: textoServicios(c) }));
    const total = lista.reduce((s: number, c: any) => s + c.valor, 0);

    if (cuerpo.accion === "resumen") {
      return json({ ok: true, prefijo: fe.prefix, siguiente: fe.nextInvoiceNumber ?? null, responsable, destinatario: destino.nombre, tipo: destino.tipo, documento: destino.documento, clientes: lista, total, faltan, avisos });
    }

    if (faltan.length) return json({ error: `A ${responsable} le falta: ${faltan.join(", ")}.` }, 400);
    const medioPago = String(cuerpo.medioPago || "");
    if (!MEDIOS_PAGO.has(medioPago)) return json({ error: "Escoja el medio de pago." }, 400);

    // Reserva cada cliente + mes para que nunca salgan dos facturas iguales
    const filas = lista.map((c: any) => ({ cedula: c.cedula, mes, valor: c.valor, estado: "creando", responsable, creado_por: quien.user.id }));
    const { error: errReserva } = await admin.from("facturas_alegra").insert(filas);
    if (errReserva) {
      if (errReserva.code === "23505") return json({ error: "Alguien acaba de facturar uno de estos clientes. Vuelva a intentarlo." }, 409);
      throw errReserva;
    }
    const cedulas = lista.map((c: any) => c.cedula);

    try {
      const clienteId = await contactoDe(destino);
      const itemId = lista.some((c: any) => !c.servicios) ? await itemServicio(admin, lista[0].valor) : null;
      const itemMuelleId = lista.some((c: any) => c.servicios) ? await itemMuelles(admin, lista[0].valor) : null;
      const hoy = hoyBogota();
      const factura = await crearFactura(admin, {
          status: "draft",
          date: hoy,
          dueDate: hoy,
          client: clienteId,
          numberTemplate: { id: fe.id },
          // Clientes de muelles (curso, actualización, enrolamiento) llevan el nombre del servicio en la línea
          items: lista.map((c: any) => ({
            id: c.servicios ? itemMuelleId : itemId, price: c.valor, quantity: 1,
            description: c.servicios
              ? `${c.servicios} - ${String(c.nombre).toUpperCase()} CC ${c.cedula} - ${mes}`
              : `Servicio de gestión de seguridad social - ${String(c.nombre).toUpperCase()} CC ${c.cedula} - ${mes}`,
          })),
          paymentForm: "CASH",
          paymentMethod: medioPago,
          type: "NATIONAL",
          operationType: "STANDARD",
      });
      await admin.from("facturas_alegra").update({ estado: "borrador", alegra_id: String(factura.id) }).eq("mes", mes).in("cedula", cedulas);
      return json({ ok: true, alegra_id: factura.id, total, clientes: lista.length });
    } catch (e) {
      await admin.from("facturas_alegra").delete().eq("mes", mes).eq("estado", "creando").in("cedula", cedulas);
      throw e;
    }
  } catch (e) {
    if (e instanceof ErrorAlegra) return json({ error: e.message }, 502);
    console.error("Error en la función alegra:", (e as Error)?.message);
    return json({ error: "No se pudo completar. Intente de nuevo." }, 500);
  }
});
