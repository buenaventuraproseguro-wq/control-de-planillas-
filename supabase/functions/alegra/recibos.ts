// Recibos de caja y pagos en Alegra (guía y mensajes del contador, 10 nov. 2026):
// - La factura electrónica lleva SOLO los honorarios.
// - Recibo de APORTES: tipo "Otros ingresos", cuenta 2815 "Ingresos recibidos para terceros".
//   No depende de la factura: se puede hacer antes de emitirla.
// - Recibo de HONORARIOS: pago a la factura, cuando ya está emitida.
// - PAGO (egreso) a Enlace Operativo: sale de la 2815 cuando se paga la planilla.
// - Cada recibo y pago se guarda en PDF (gestión documental y por si el cliente lo pide).
// - Nada de esto va a la DIAN.

type Pedir = (ruta: string, opciones?: RequestInit) => Promise<any>;
type PedirCrudo = (ruta: string, opciones?: RequestInit) => Promise<{ resp: Response; texto: string; datos: any }>;

const BUCKET = "documentos-clientes";
const filas = (x: any) => Array.isArray(x) ? x : (x?.data || []);
const MEDIO_A_ALEGRA: Record<string, string> = {
  BANK_DEPOSIT: "deposit", CREDIT_TRANSFER_BANK: "transfer", CASH: "cash", MUTUAL_AGREEMENT: "transfer",
};
const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));

function aplanar(lista: any[], fuera: any[] = []) {
  for (const c of lista || []) {
    fuera.push(c);
    for (const k of ["children", "subcategories", "categories"]) if (Array.isArray(c?.[k])) aplanar(c[k], fuera);
  }
  return fuera;
}

async function leerConfig(admin: any) {
  const { data } = await admin.from("configuracion").select("valor").eq("clave", "alegra").maybeSingle();
  return data?.valor || {};
}

// Cuentas de banco, cuenta 2815 y el proveedor Enlace Operativo
export async function configRecibos(admin: any, alegra: Pedir) {
  const conf = await leerConfig(admin);
  const bancos = filas(await alegra("/bank-accounts?limit=30"))
    .filter((b: any) => b.status !== "inactive")
    .map((b: any) => ({ id: String(b.id), nombre: b.name || `Cuenta ${b.id}` }));
  let cats: any[] = [];
  try { cats = aplanar(filas(await alegra("/categories?format=plain"))); }
  catch { cats = aplanar(filas(await alegra("/categories"))); }
  const cuentas = cats
    .filter((c: any) => /^28/.test(String(c.code || "")) || /tercer/i.test(String(c.name || c.text || "")))
    .filter((c: any) => !c.use || c.use === "movement")
    .map((c: any) => ({ id: String(c.id), nombre: c.name || c.text || "", codigo: String(c.code || "") }))
    .sort((a: any, b: any) => (b.codigo.startsWith("2815") ? 1 : 0) - (a.codigo.startsWith("2815") ? 1 : 0));
  let proveedores: any[] = [];
  try {
    proveedores = filas(await alegra("/contacts?name=enlace&limit=30"))
      .filter((c: any) => /enlace/i.test(String(c.name || "")))
      .map((c: any) => ({ id: String(c.id), nombre: c.name, documento: String(c.identificationObject?.number || c.identification || "") }));
  } catch { proveedores = []; }
  return {
    ok: true, bancos, cuentas, proveedores,
    banco_id: conf.recibo_banco_id || null, cuenta_id: conf.recibo_cuenta_id || null, enlace_id: conf.enlace_contacto_id || null,
  };
}

export async function guardarConfigRecibos(admin: any, bancoId: string, cuentaId: string, enlaceId: string) {
  if (!bancoId || !cuentaId) return { error: "Escoja la cuenta del banco y la cuenta de ingresos para terceros.", status: 400 };
  const conf = await leerConfig(admin);
  await admin.from("configuracion").upsert({ clave: "alegra", valor: {
    ...conf, recibo_banco_id: String(bancoId), recibo_cuenta_id: String(cuentaId), enlace_contacto_id: enlaceId ? String(enlaceId) : (conf.enlace_contacto_id || null),
  } });
  return { ok: true };
}

// Descarga el PDF del recibo/pago desde Alegra y lo guarda en el almacenamiento de la app
async function guardarPdf(admin: any, pedir: PedirCrudo, pagoId: string, ruta: string) {
  try {
    const { resp, datos } = await pedir(`/payments/${encodeURIComponent(pagoId)}?fields=pdf`);
    const url = resp.ok ? (datos?.pdf || datos?.pdfUrl || null) : null;
    if (!url) return null;
    const archivo = await fetch(url);
    if (!archivo.ok) return null;
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const { error } = await admin.storage.from(BUCKET).upload(ruta, bytes, { contentType: "application/pdf", upsert: true });
    return error ? null : ruta;
  } catch { return null; }
}

export async function pdfFirmado(admin: any, pedir: PedirCrudo, cuerpo: any) {
  const tabla = cuerpo.de === "pago" ? "pagos_enlace" : "recibos_caja";
  const { data: fila } = await admin.from(tabla).select("*").eq("id", String(cuerpo.id || "")).maybeSingle();
  if (!fila?.alegra_pago_id) return { error: "No encontré ese documento.", status: 404 };
  let ruta = fila.pdf_path;
  if (!ruta) {
    ruta = await guardarPdf(admin, pedir, fila.alegra_pago_id, `alegra/${fila.mes}/${tabla === "pagos_enlace" ? "pago" : "recibo"}_${fila.alegra_pago_id}.pdf`);
    if (!ruta) return { error: "Alegra todavía no entrega el PDF. Ábralo desde Alegra o intente más tarde.", status: 502 };
    await admin.from(tabla).update({ pdf_path: ruta }).eq("id", fila.id);
  }
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(ruta, 600);
  if (error) return { error: "No se pudo abrir el PDF.", status: 500 };
  return { ok: true, url: data.signedUrl };
}

const CAMPOS_APORTES = "cedula, nombre, valor_eps, valor_pension, valor_arl, valor_caja, caja, estado_caja";

// ¿Sigue existiendo en Alegra? Si lo borraron allá, se libera en la app.
async function vigentes(admin: any, pedir: PedirCrudo, tabla: string, lista: any[]) {
  const fuera: any[] = [];
  for (const r of lista || []) {
    if (r.estado === "creado" && r.alegra_pago_id) {
      const { resp } = await pedir(`/payments/${encodeURIComponent(r.alegra_pago_id)}`);
      if (resp.status === 404) { await admin.from(tabla).delete().eq("id", r.id); continue; }
    }
    fuera.push(r);
  }
  return fuera;
}

// Facturas del mes con lo que tiene cada cliente en aportes
export async function recibosPendientes(admin: any, pedir: PedirCrudo, mes: string) {
  const { data: mesFila } = await admin.from("months").select("id").eq("name", mes).maybeSingle();
  if (!mesFila) return { error: "No encontré ese mes.", status: 404 };
  const { data: fac } = await admin.from("facturas_alegra").select("cedula, alegra_id, valor, responsable").eq("mes", mes).not("alegra_id", "is", null);
  const porFactura = new Map<string, any[]>();
  for (const f of fac || []) {
    if (!porFactura.has(f.alegra_id)) porFactura.set(f.alegra_id, []);
    porFactura.get(f.alegra_id)!.push(f);
  }
  const cedulas = [...new Set((fac || []).map((f: any) => f.cedula))];
  const { data: clientes } = cedulas.length
    ? await admin.from("clients").select(CAMPOS_APORTES).eq("month_id", mesFila.id).in("cedula", cedulas)
    : { data: [] };
  const porCedula = new Map((clientes || []).map((c: any) => [c.cedula, c]));
  const { data: recibos0 } = await admin.from("recibos_caja").select("*").eq("mes", mes);
  const recibos = await vigentes(admin, pedir, "recibos_caja", recibos0 || []);

  const lista: any[] = [];
  for (const [id, fs] of porFactura) {
    const { resp, datos } = await pedir(`/invoices/${encodeURIComponent(id)}`);
    if (resp.status === 404) continue;
    const estado = resp.ok ? String(datos?.status || "") : "desconocido";
    const numero = datos?.numberTemplate?.fullNumber || null;
    if (resp.ok && estado && estado !== "draft") {
      await admin.from("facturas_alegra").update({ estado: "emitida", numero }).eq("alegra_id", id);
    }
    const de = (tipo: string) => recibos.find((r: any) => r.factura_alegra_id === id && r.tipo === tipo) || null;
    lista.push({
      alegra_id: id, numero, estado,
      cliente: datos?.client?.name || fs[0].responsable || "",
      honorarios: fs.reduce((s: number, f: any) => s + Number(f.valor || 0), 0),
      saldo: datos?.balance != null ? Number(datos.balance) : null,
      clientes: fs.map((f: any) => {
        const c: any = porCedula.get(f.cedula) || { cedula: f.cedula, nombre: f.cedula };
        return {
          cedula: c.cedula, nombre: c.nombre, eps: n(c.valor_eps), pension: n(c.valor_pension), arl: n(c.valor_arl),
          caja: n(c.valor_caja), cajaNombre: c.caja || "", estadoCaja: c.estado_caja || "",
        };
      }),
      reciboAportes: de("aportes"), reciboHonorarios: de("honorarios"),
    });
  }
  const pend = (f: any) => (f.reciboAportes ? 0 : 1) + (f.reciboHonorarios || f.estado === "draft" ? 0 : 1);
  lista.sort((a, b) => pend(b) - pend(a) || String(a.cliente).localeCompare(String(b.cliente)));
  return { ok: true, facturas: lista };
}

// Crea un recibo de caja en Alegra: tipo "aportes" (otros ingresos 2815) o "honorarios" (pago a la factura)
export async function crearRecibo(admin: any, alegra: Pedir, pedir: PedirCrudo, quien: string, cuerpo: any, hoy: string) {
  const id = String(cuerpo.alegra_id || "").trim();
  const mes = String(cuerpo.mes || "").trim();
  const tipo = cuerpo.tipo === "honorarios" ? "honorarios" : "aportes";
  const medio = MEDIO_A_ALEGRA[String(cuerpo.medioPago || "")];
  if (!id || !mes) return { error: "Faltan la factura o el mes.", status: 400 };
  if (!medio) return { error: "Escoja el medio de pago.", status: 400 };
  const conf = await leerConfig(admin);
  if (!conf.recibo_banco_id || !conf.recibo_cuenta_id) return { error: "Primero escoja la cuenta del banco y la cuenta 2815 en Cuentas.", status: 400 };

  const { data: fs } = await admin.from("facturas_alegra").select("cedula, valor").eq("mes", mes).eq("alegra_id", id);
  if (!fs?.length) return { error: "Esa factura no es de este mes en la app.", status: 404 };

  const { resp, datos: inv } = await pedir(`/invoices/${encodeURIComponent(id)}`);
  if (resp.status === 404) return { error: "La factura ya no existe en Alegra.", status: 404 };
  if (!resp.ok) return { error: "No pude leer la factura en Alegra.", status: 502 };
  if (inv.status === "void") return { error: "La factura está anulada en Alegra.", status: 400 };
  const clienteId = Number(inv.client?.id);
  const numero = inv?.numberTemplate?.fullNumber || "en borrador";

  let detalle: any[] = [], valor = 0, cuerpoPago: any;
  if (tipo === "aportes") {
    const permitidas = new Set(fs.map((f: any) => f.cedula));
    for (const v of Array.isArray(cuerpo.clientes) ? cuerpo.clientes : []) {
      const ced = String(v?.cedula || "");
      if (!permitidas.has(ced)) return { error: `La cédula ${ced} no está en esta factura.`, status: 400 };
      const x = Number(v?.valor);
      if (!Number.isFinite(x) || x < 0 || x > 20000000) return { error: `Revise el valor de la planilla de ${ced}.`, status: 400 };
      detalle.push({ cedula: ced, nombre: String(v?.nombre || ""), valor: Math.round(x), caja: !!v?.caja });
    }
    valor = detalle.reduce((s, d) => s + d.valor, 0);
    if (!(valor > 0)) return { error: "El valor de la planilla está en cero.", status: 400 };
    const nombres = detalle.filter(d => d.valor > 0).map(d => `${String(d.nombre).toUpperCase()} CC ${d.cedula}`).join("; ");
    cuerpoPago = {
      date: hoy, type: "in", bankAccount: Number(conf.recibo_banco_id), paymentMethod: medio, client: clienteId,
      categories: [{ id: Number(conf.recibo_cuenta_id), price: valor, quantity: 1, observations: `Aportes PILA ${mes} - ${nombres}` }],
      observations: `Ingresos recibidos para terceros: aportes a seguridad social (planilla PILA) de ${mes} de ${nombres}. Dinero en tránsito para el pago de la planilla; no es ingreso de PROSEGUROSNET.`,
    };
  } else {
    if (inv.status === "draft") return { error: "La factura sigue en borrador. Cuando el contador la emita, se hace este recibo.", status: 400 };
    valor = n(inv.balance ?? inv.total);
    if (!(valor > 0)) return { error: "La factura ya está pagada en Alegra.", status: 400 };
    cuerpoPago = {
      date: hoy, type: "in", bankAccount: Number(conf.recibo_banco_id), paymentMethod: medio, client: clienteId,
      invoices: [{ id: Number(inv.id), amount: valor }],
      observations: `Pago de honorarios por gestión de seguridad social de ${mes}, factura ${numero}.`,
    };
  }

  // Reserva: un solo recibo de cada tipo por factura
  const { data: reserva, error: errReserva } = await admin.from("recibos_caja")
    .insert({ factura_alegra_id: id, tipo, mes, honorarios: tipo === "honorarios" ? valor : 0, aportes: tipo === "aportes" ? valor : 0, detalle, creado_por: quien })
    .select("id").single();
  if (errReserva) {
    if (errReserva.code === "23505") return { error: tipo === "aportes" ? "Esta factura ya tiene recibo de aportes." : "Esta factura ya tiene recibo de honorarios.", status: 409 };
    throw errReserva;
  }
  try {
    const pago = await alegra("/payments", { method: "POST", body: JSON.stringify(cuerpoPago) });
    const ruta = await guardarPdf(admin, pedir, String(pago.id), `alegra/${mes}/recibo_${pago.id}.pdf`);
    await admin.from("recibos_caja").update({ estado: "creado", alegra_pago_id: String(pago.id), pdf_path: ruta }).eq("id", reserva.id);
    return { ok: true, id: reserva.id, alegra_pago_id: pago.id, valor, pdf: !!ruta };
  } catch (e) {
    await admin.from("recibos_caja").delete().eq("id", reserva.id).eq("estado", "creando");
    throw e;
  }
}

// Planillas pagadas del mes: lo que hay que sacar de la 2815 hacia Enlace Operativo
export async function pagosPendientes(admin: any, pedir: PedirCrudo, mes: string) {
  const { data: mesFila } = await admin.from("months").select("id").eq("name", mes).maybeSingle();
  if (!mesFila) return { error: "No encontré ese mes.", status: 404 };
  const { data: cl } = await admin.from("clients").select(`${CAMPOS_APORTES}, no_planilla_pagada, estado_tramite`).eq("month_id", mesFila.id);
  const grupos = new Map<string, any>();
  for (const c of cl || []) {
    const pl = String(c.no_planilla_pagada || "").trim();
    if (!pl) continue;
    if (!grupos.has(pl)) grupos.set(pl, { planilla: pl, personas: 0, valor: 0, nombres: [] as string[] });
    const g = grupos.get(pl);
    g.personas++; g.valor += n(c.valor_eps) + n(c.valor_pension) + n(c.valor_arl) + n(c.valor_caja);
    if (g.nombres.length < 4) g.nombres.push(c.nombre);
  }
  const { data: pagos0 } = await admin.from("pagos_enlace").select("*").eq("mes", mes);
  const pagos = await vigentes(admin, pedir, "pagos_enlace", pagos0 || []);
  const lista = [...grupos.values()].map(g => ({ ...g, pago: pagos.find((p: any) => p.planilla === g.planilla) || null }));
  lista.sort((a, b) => (a.pago ? 1 : 0) - (b.pago ? 1 : 0) || b.valor - a.valor);
  return { ok: true, planillas: lista };
}

// Pago (egreso) a Enlace Operativo desde la 2815
export async function crearPagoEnlace(admin: any, alegra: Pedir, pedir: PedirCrudo, quien: string, cuerpo: any, hoy: string) {
  const planilla = String(cuerpo.planilla || "").trim();
  const mes = String(cuerpo.mes || "").trim();
  const medio = MEDIO_A_ALEGRA[String(cuerpo.medioPago || "")];
  const valor = Number(cuerpo.valor);
  if (!planilla || !mes) return { error: "Faltan la planilla o el mes.", status: 400 };
  if (!medio) return { error: "Escoja el medio de pago.", status: 400 };
  if (!Number.isFinite(valor) || valor <= 0 || valor > 500000000) return { error: "Revise el valor pagado.", status: 400 };
  const conf = await leerConfig(admin);
  if (!conf.recibo_banco_id || !conf.recibo_cuenta_id) return { error: "Primero escoja las cuentas en Cuentas.", status: 400 };
  if (!conf.enlace_contacto_id) return { error: "Primero escoja a Enlace Operativo como proveedor en Cuentas.", status: 400 };

  const { data: reserva, error: errReserva } = await admin.from("pagos_enlace")
    .insert({ planilla, mes, valor: Math.round(valor), creado_por: quien }).select("id").single();
  if (errReserva) {
    if (errReserva.code === "23505") return { error: "Esta planilla ya tiene su pago en Alegra.", status: 409 };
    throw errReserva;
  }
  try {
    const pago = await alegra("/payments", {
      method: "POST",
      body: JSON.stringify({
        date: hoy, type: "out", bankAccount: Number(conf.recibo_banco_id), paymentMethod: medio, client: Number(conf.enlace_contacto_id),
        categories: [{ id: Number(conf.recibo_cuenta_id), price: Math.round(valor), quantity: 1, observations: `Pago planilla PILA N° ${planilla} - ${mes}` }],
        observations: `Pago de la planilla PILA N° ${planilla} de ${mes} a Enlace Operativo con los aportes recibidos para terceros (cuenta 2815).`,
      }),
    });
    const ruta = await guardarPdf(admin, pedir, String(pago.id), `alegra/${mes}/pago_${pago.id}.pdf`);
    await admin.from("pagos_enlace").update({ estado: "creado", alegra_pago_id: String(pago.id), pdf_path: ruta }).eq("id", reserva.id);
    return { ok: true, id: reserva.id, alegra_pago_id: pago.id, pdf: !!ruta };
  } catch (e) {
    await admin.from("pagos_enlace").delete().eq("id", reserva.id).eq("estado", "creando");
    throw e;
  }
}
