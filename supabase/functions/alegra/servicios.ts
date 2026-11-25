// Facturar desde la app Muelles y Seguros (25 nov. 2026, pedido de Nestor):
// curso, actualización de muelles o enrolamiento, ahí mismo en el cliente.
// Igual que lo demás: solo crea un BORRADOR en Alegra (el contador lo emite). Nada va a la DIAN.
// Los valores salen de la base de datos (servicios_muelle del cliente en ese mes), nunca del navegador.
// A nombre del cliente o de su responsable (patrón). Si al responsable le faltan datos para facturar,
// se COMPLETAN (solo lo que está vacío; nunca se cambia lo que ya tiene).

const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
const propio = (s: string) => String(s || "").toLowerCase().replace(/(^|\s)\S/g, (t) => t.toUpperCase());
const TIPOS_DOC = new Set(["CC", "NIT", "CE", "PP", "PEP"]);

// Una línea por servicio: "act:Sociedad" → Actualización muelle Sociedad, "enrolamiento", "curso" (+ _cursoTipo)
export function lineasServicios(c: any) {
  const sv = c?.servicios_muelle && typeof c.servicios_muelle === "object" ? c.servicios_muelle : {};
  return Object.keys(sv).filter((k) => !k.startsWith("_") && n(sv[k]) > 0).map((k) => {
    let texto: string;
    if (k.startsWith("act:")) texto = `Actualización muelle ${k.slice(4)}`;
    else if (k === "actualizacion") texto = "Actualización de muelles";
    else if (k === "enrolamiento") texto = "Enrolamiento en muelle";
    else if (k === "curso") texto = `Curso${sv._cursoTipo ? " " + String(sv._cursoTipo).trim() : ""}`;
    else texto = propio(k);
    return { texto, valor: n(sv[k]) };
  });
}
export const textoServicios = (c: any) => lineasServicios(c).map((l) => l.texto).join(" + ");

const CAMPOS = "cedula, nombre, correo, telefono, direccion_completa, costo_servicio, estado_tramite, responsable_grupo, servicios_muelle, valor_eps, valor_pension";

async function datosServicio(admin: any, h: any, cedula: string, mes: string) {
  const { data: mesFila } = await admin.from("months").select("id").eq("name", mes).maybeSingle();
  if (!mesFila) return { error: "No encontré ese mes.", status: 404 };
  const { data: c } = await admin.from("clients").select(CAMPOS).eq("month_id", mesFila.id).eq("cedula", cedula).maybeSingle();
  if (!c) return { error: "No encontré ese cliente en ese mes.", status: 404 };
  const lineas = lineasServicios(c);
  if (!lineas.length) return { error: "Este cliente no tiene curso, actualización ni enrolamiento con valor este mes.", status: 400 };
  if (n(c.valor_eps) + n(c.valor_pension) > 0) return { error: "Este cliente también tiene planilla este mes. Facture desde la app de Planillas.", status: 400 };
  const total = lineas.reduce((s, l) => s + l.valor, 0);
  const costo = n(c.costo_servicio);
  if (costo && costo !== total) return { error: `En Planillas el costo del servicio es $${costo.toLocaleString("es-CO")} pero los servicios suman $${total.toLocaleString("es-CO")}. Corríjalo antes de facturar.`, status: 400 };

  await h.liberarBorradoresEliminados(admin, mes);
  const { data: ya } = await admin.from("facturas_alegra").select("estado, numero, responsable").eq("mes", mes).eq("cedula", cedula).maybeSingle();

  const { data: conf } = await admin.from("configuracion").select("valor").eq("clave", "nombres_pila").maybeSingle();
  const cliente = {
    tipo: "CC", documento: cedula, nombre: String(c.nombre).toUpperCase(), correo: String(c.correo || "").trim(),
    telefono: String(c.telefono || "").trim(), direccion: String(c.direccion_completa || "").trim(), partes: h.partesNombre(c.nombre, conf?.valor?.[cedula]),
  };

  const clave = h.normResp(c.responsable_grupo);
  let resp: any = null;
  if (clave && !h.esGrupoGeneral(clave) && clave !== h.normResp(c.nombre)) {
    const { data } = await admin.from("responsables").select("*").eq("clave", clave).maybeSingle();
    resp = data || { nombre: String(c.responsable_grupo).trim(), clave, nuevo: true };
  }
  return { c, lineas, total, ya, pagado: String(c.estado_tramite || "").toUpperCase().startsWith("PAGO"), cliente, resp };
}

const faltanResp = (r: any) => {
  const f: string[] = [];
  if (!String(r?.nombre_factura || "").trim()) f.push("nombre o razón social");
  if (!String(r?.documento || "").trim()) f.push("cédula o NIT");
  return f;
};

export async function resumenServicio(admin: any, h: any, cedula: string, mes: string) {
  const d: any = await datosServicio(admin, h, cedula, mes);
  if (d.error) return d;
  const fe = await h.numeracionFE();
  const r = d.resp;
  const responsable = r ? {
    nombre: r.nombre, nombre_factura: r.nombre_factura || "", tipo_doc: r.tipo_doc || "CC", documento: r.documento || "",
    correo: r.correo || "", faltan: faltanResp(r), individual: !!r.factura_individual,
  } : null;
  return {
    ok: true, prefijo: fe.prefix, lineas: d.lineas, total: d.total, pagado: d.pagado, estado: d.c.estado_tramite || "",
    yaFacturada: d.ya ? { estado: d.ya.estado, numero: d.ya.numero, responsable: d.ya.responsable } : null,
    cliente: { nombre: d.cliente.nombre, documento: cedula, sinCorreo: !d.cliente.correo },
    responsable,
    sugerido: responsable && !responsable.individual ? "responsable" : "cliente",
  };
}

export async function borradorServicio(admin: any, h: any, quien: string, cuerpo: any) {
  const cedula = String(cuerpo.cedula || "").trim();
  const mes = String(cuerpo.mes || "").trim();
  if (!cedula || !mes) return { error: "Faltan la cédula o el mes.", status: 400 };
  const d: any = await datosServicio(admin, h, cedula, mes);
  if (d.error) return d;
  if (d.ya) return { error: "Este cliente ya tiene factura de este mes en Alegra.", status: 409 };
  if (!d.pagado) return { error: "Primero registre el pago en la app de Planillas (el cliente debe quedar en PAGO).", status: 400 };
  const medioPago = String(cuerpo.medioPago || "");
  if (!h.MEDIOS_PAGO.has(medioPago)) return { error: "Escoja el medio de pago.", status: 400 };

  let destino: any = d.cliente, responsable: string | null = null;
  if (cuerpo.destino === "responsable") {
    const r = d.resp;
    if (!r) return { error: "Este cliente no tiene responsable.", status: 400 };
    // Completar SOLO lo que falta del responsable (nunca cambiar lo que ya tiene)
    const nuevos = cuerpo.datosResponsable && typeof cuerpo.datosResponsable === "object" ? cuerpo.datosResponsable : {};
    const completar: Record<string, string> = {};
    const nf = String(nuevos.nombre_factura || "").trim().slice(0, 120);
    const doc = String(nuevos.documento || "").replace(/[^\dA-Za-z-]/g, "").slice(0, 20);
    const td = String(nuevos.tipo_doc || "").trim().toUpperCase();
    const co = String(nuevos.correo || "").trim().slice(0, 120);
    if (!String(r.nombre_factura || "").trim() && nf) completar.nombre_factura = nf;
    if (!String(r.documento || "").trim() && doc) {
      completar.documento = doc;
      if (TIPOS_DOC.has(td)) completar.tipo_doc = td;
    }
    if (!String(r.correo || "").trim() && co && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(co)) completar.correo = co;
    if (Object.keys(completar).length) {
      if (r.nuevo) {
        const { error } = await admin.from("responsables").insert({ nombre: String(r.nombre).slice(0, 80), clave: r.clave, ...completar });
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await admin.from("responsables").update(completar).eq("clave", r.clave);
        if (error) throw error;
      }
      Object.assign(r, completar);
    }
    const faltan = faltanResp(r);
    if (faltan.length) return { error: `A ${propio(r.nombre)} le falta: ${faltan.join(", ")}.`, status: 400 };
    const documento = String(r.documento).replace(/[^\dA-Za-z-]/g, "");
    const [numero, dv] = documento.split("-");
    const tipo = r.tipo_doc || "CC";
    const nombreFactura = String(r.nombre_factura).trim().toUpperCase();
    destino = { tipo, documento: numero || "", dv, nombre: nombreFactura, correo: String(r.correo || "").trim(), telefono: String(r.telefono || "").trim(), partes: tipo === "NIT" ? undefined : h.partesNombre(nombreFactura, null) };
    responsable = r.nombre;
  }

  const fe = await h.numeracionFE();
  const { error: errReserva } = await admin.from("facturas_alegra").insert({ cedula, mes, valor: d.total, estado: "creando", responsable, creado_por: quien });
  if (errReserva) {
    if (errReserva.code === "23505") return { error: "Alguien acaba de facturar a este cliente. Revise en Alegra.", status: 409 };
    throw errReserva;
  }
  try {
    const clienteId = await h.contactoDe(destino);
    const itemId = await h.itemDeServicio(admin, "item_muelle_id", "Servicios de muelles", "PSN-MUELLES", d.lineas[0].valor);
    const hoy = h.hoyBogota();
    const nombre = String(d.c.nombre).toUpperCase();
    const factura = await h.crearFactura(admin, {
      status: "draft", date: hoy, dueDate: hoy, client: clienteId, numberTemplate: { id: fe.id },
      items: d.lineas.map((l: any) => ({ id: itemId, price: l.valor, quantity: 1, description: `${l.texto} - ${nombre} CC ${cedula} - ${mes}` })),
      paymentForm: "CASH", paymentMethod: medioPago, type: "NATIONAL", operationType: "STANDARD",
    });
    await admin.from("facturas_alegra").update({ estado: "borrador", alegra_id: String(factura.id) }).eq("mes", mes).eq("cedula", cedula);
    return { ok: true, alegra_id: factura.id, total: d.total, destinatario: destino.nombre };
  } catch (e) {
    await admin.from("facturas_alegra").delete().eq("mes", mes).eq("estado", "creando").eq("cedula", cedula);
    throw e;
  }
}
