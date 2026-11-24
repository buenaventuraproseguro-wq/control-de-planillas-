import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

// Correo de recordatorios de cada mañana (lo dispara pg_cron, tarea «recordatorios-diarios»).
// SOLO LEE la base de datos: clientes que no han pagado el mes, pagos sin número de planilla
// y los recordatorios con fecha límite de la tabla recordatorios_fijos (por ejemplo Comfenalco).
// Envía desde proseguros44@gmail.com (mismos secretos que enviar-muelle) a recordatorios_config.para.
// Para que nadie más lo dispare, pide la clave interna guardada en recordatorios_config.token.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GMAIL_USER = (Deno.env.get("GMAIL_USER") || "").trim();
const GMAIL_APP_PASSWORD = (Deno.env.get("GMAIL_APP_PASSWORD") || "").replace(/\s+/g, "");

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const propio = (s: string) => String(s || "").toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()).trim();
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const sinTilde = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

function hoyBogota(): Date {
  const t = new Date(Date.now() - 5 * 3600 * 1000); // Colombia no cambia de hora
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}
const FECHA = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

Deno.serve(async (req) => {
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: conf } = await db.from("recordatorios_config").select("para, token, activo").eq("id", 1).maybeSingle();
  const clave = (req.headers.get("x-recordatorios") || "").trim();
  if (!conf || !clave || clave !== conf.token) return json({ error: "No autorizado" }, 401);
  if (!conf.activo) return json({ ok: true, apagado: true });
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return json({ error: "Falta GMAIL_USER / GMAIL_APP_PASSWORD" }, 500);
  let cuerpo: Record<string, unknown> = {};
  try { cuerpo = await req.json(); } catch { /* sin cuerpo */ }

  // Mes actual = el de mayor orden
  const { data: mes } = await db.from("months").select("id, name").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  if (!mes) return json({ error: "Sin mes" }, 500);
  const { data: filas, error } = await db.from("clients")
    .select("row_no, cedula, nombre, empresa, telefono, estado_tramite, no_planilla_pagada, dinero_recibido")
    .eq("month_id", mes.id).order("row_no");
  if (error) return json({ error: error.message }, 500);

  const est = (r: any) => sinTilde(r.estado_tramite).replace(/\s+/g, " ");
  const porPagar = (filas || []).filter((r: any) => ["SIN PAGO", "DIAS PROPORCIONALES"].includes(est(r)) && !r.dinero_recibido);
  const conDinero = (filas || []).filter((r: any) => ["SIN PAGO", "DIAS PROPORCIONALES"].includes(est(r)) && r.dinero_recibido);
  const deben = (filas || []).filter((r: any) => est(r) === "DEBE");
  const sinPlanilla = (filas || []).filter((r: any) => ["PAGO", "PAGO CONDUCTOR"].includes(est(r)) && !String(r.no_planilla_pagada || "").trim());

  const hoy = hoyBogota();
  const { data: fijos } = await db.from("recordatorios_fijos").select("titulo, detalle, fecha_limite").eq("activo", true).order("fecha_limite", { nullsFirst: false });
  const avisos = (fijos || []).map((f: any) => {
    if (!f.fecha_limite) return { ...f, dias: null as number | null };
    const d = Math.round((Date.parse(f.fecha_limite + "T00:00:00Z") - hoy.getTime()) / 86400000);
    return { ...f, dias: d };
  }).filter((f: any) => f.dias === null || f.dias >= -7); // deja de avisar una semana después del plazo

  const fila = (r: any, extra = "") => `<tr><td>${esc(String(r.row_no ?? ""))}</td><td>${esc(propio(r.nombre))}</td><td>${esc(r.cedula)}</td><td>${esc(r.telefono || "")}</td><td>${esc(propio(r.empresa || ""))}${extra}</td></tr>`;
  const tabla = (lista: any[]) => lista.length
    ? `<table cellpadding="4" style="border-collapse:collapse;font-size:13px" border="1"><tr style="background:#eef2f7"><th>N.º</th><th>Nombre</th><th>Cédula</th><th>Teléfono</th><th>Empresa</th></tr>${lista.map((r) => fila(r)).join("")}</table>`
    : `<p>Ninguno. 👍</p>`;
  const plazo = (d: number | null) => d === null ? "" : d > 1 ? `faltan <b>${d} días</b>` : d === 1 ? "<b>vence mañana</b>" : d === 0 ? "<b>vence HOY</b>" : `<b style="color:#D92D20">venció hace ${-d} días</b>`;

  const fechaTxt = FECHA.format(hoy);
  const html = `<div style="font-family:Arial,sans-serif;color:#1d2939;max-width:760px">
<h2 style="margin:0 0 4px">Recordatorios de hoy · ${esc(fechaTxt)}</h2>
<p style="margin:0 0 16px;color:#667085">${esc(mes.name)}. Este correo lo envía la app sola cada mañana; solo lee los datos, no cambia nada.</p>
${avisos.length ? `<h3>⏰ Fechas límite</h3><ul>${avisos.map((a: any) => `<li><b>${esc(a.titulo)}</b>${a.fecha_limite ? ` · plazo ${esc(a.fecha_limite.split("-").reverse().join("/"))}, ${plazo(a.dias)}` : ""}<br><span style="color:#475467">${esc(a.detalle)}</span></li>`).join("")}</ul>` : ""}
<h3>🔴 No han pagado este mes (${porPagar.length})</h3>${tabla(porPagar)}
${deben.length ? `<h3>🟠 Deben (${deben.length})</h3>${tabla(deben)}` : ""}
${conDinero.length ? `<h3>💵 Ya pagaron, falta subir planilla y comprobante (${conDinero.length})</h3>${tabla(conDinero)}` : ""}
<h3>📄 Pagos sin número de planilla (${sinPlanilla.length})</h3>${sinPlanilla.length ? `<p>Se arreglan subiendo la planilla en «Subir planilla pagada».</p>${tabla(sinPlanilla)}` : "<p>Ninguno. 👍</p>"}
<p style="margin-top:20px"><a href="https://buenaventuraproseguro-wq.github.io/control-de-planillas-/">Abrir la app</a></p></div>`;
  const texto = `Recordatorios de hoy (${fechaTxt}) · ${mes.name}\n` +
    avisos.map((a: any) => `- ${a.titulo}${a.dias !== null ? ` (${a.dias >= 0 ? `faltan ${a.dias} días` : `venció hace ${-a.dias} días`})` : ""}`).join("\n") +
    `\nNo han pagado: ${porPagar.length} · Deben: ${deben.length} · Pagos sin número de planilla: ${sinPlanilla.length}`;

  const prueba = cuerpo.prueba === true;
  const asunto = `${prueba ? "[PRUEBA] " : ""}Recordatorios PROSEGUROSNET · ${porPagar.length} sin pagar${avisos.some((a: any) => a.dias !== null && a.dias <= 7) ? " · ⏰ plazo cerca" : ""}`;
  const transporte = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } });
  await transporte.sendMail({ from: `PROSEGUROSNET App <${GMAIL_USER}>`, to: conf.para, subject: asunto, text: texto, html });
  return json({ ok: true, para: conf.para, sin_pagar: porPagar.length, deben: deben.length, sin_planilla: sinPlanilla.length, avisos: avisos.length });
});
