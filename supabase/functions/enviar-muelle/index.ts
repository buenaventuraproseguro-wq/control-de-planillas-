import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";
import { PDFDocument } from "npm:pdf-lib@1.17.1";

// Envía a un muelle (Agua Dulce, Sociedad…) la cédula, la planilla y el comprobante de pago del mes,
// cada uno en PDF, desde el correo del equipo (proseguros44@gmail.com) por SMTP de Gmail.
// Solo se envía cuando una persona del equipo toca «Enviar ahora» en la app (nunca solo).
// La clave de aplicación de Gmail vive SOLO aquí, en los secretos de Supabase (GMAIL_USER, GMAIL_APP_PASSWORD).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GMAIL_USER = (Deno.env.get("GMAIL_USER") || "").trim();
const GMAIL_APP_PASSWORD = (Deno.env.get("GMAIL_APP_PASSWORD") || "").replace(/\s+/g, "");
const BUCKET = "documentos-clientes";
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", ...CORS } });
const propio = (s: string) => String(s || "").toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
const mesISO = (nombre: string) => {
  const m = String(nombre || "").toLowerCase().match(/^(\S+)\s+de\s+(\d{4})$/);
  const i = m ? MESES.indexOf(m[1]) : -1;
  return i < 0 ? "" : `${m![2]}-${String(i + 1).padStart(2, "0")}`;
};

// Convierte el archivo guardado (foto o PDF) en un PDF
async function aPDF(bytes: Uint8Array): Promise<Uint8Array> {
  const esPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (esPdf) return bytes;
  const doc = await PDFDocument.create();
  const esPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  const img = esPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const A = 612, B = 792, margen = 24; // carta
  const esc = Math.min((A - 2 * margen) / img.width, (B - 2 * margen) / img.height, 1);
  const w = img.width * esc, h = img.height * esc;
  const p = doc.addPage([A, B]);
  p.drawImage(img, { x: (A - w) / 2, y: B - margen - h, width: w, height: h });
  return await doc.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: quien, error: eq } = await admin.auth.getUser(token);
  if (eq || !quien?.user) return json({ error: "No autenticado" }, 401);
  const { data: perfil } = await admin.from("profiles").select("role,full_name").eq("id", quien.user.id).maybeSingle();
  if (!perfil?.role) return json({ error: "Su usuario no es del equipo." }, 403);

  let cuerpo: any;
  try { cuerpo = await req.json(); } catch { return json({ error: "Cuerpo inválido" }, 400); }
  const accion = String(cuerpo.accion || "enviar");
  const cedula = String(cuerpo.cedula || "").replace(/\D/g, "");
  const muelle = String(cuerpo.muelle || "").trim();
  if (!cedula || !muelle) return json({ error: "Faltan la cédula o el muelle." }, 400);

  const { data: cf } = await admin.from("configuracion").select("valor").eq("clave", "correos_muelles").maybeSingle();
  const destino = cf?.valor?.[muelle];
  if (!destino?.para) return json({ error: `No hay correo guardado para ${muelle}.` }, 400);

  const { data: mes } = await admin.from("months").select("id,name").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  if (!mes) return json({ error: "No encontré el mes actual." }, 500);
  const { data: c } = await admin.from("clients").select("cedula,nombre,servicios_muelle").eq("month_id", mes.id).eq("cedula", cedula).maybeSingle();
  if (!c) return json({ error: `La cédula ${cedula} no está en ${mes.name}.` }, 404);
  const iso = mesISO(mes.name);

  // Documentos: cédula (sin mes), planilla y comprobante del mes
  const pedidos: [string, string, string][] = [["cedula", "", "Cedula"], ["planilla_pagada", iso, "Planilla"], ["comprobante_pago", iso, "Comprobante_de_pago"]];
  const { data: docs } = await admin.from("documentos").select("tipo,mes,storage_path").eq("cedula", cedula);
  const faltan: string[] = [];
  const rutas: [string, string][] = [];
  for (const [tipo, m, nombre] of pedidos) {
    const d = (docs || []).find((x: any) => x.tipo === tipo && String(x.mes || "") === m);
    if (!d) faltan.push(nombre.replace(/_/g, " ").replace("Cedula", "cédula").toLowerCase());
    else rutas.push([d.storage_path, nombre]);
  }
  const nombre = propio(c.nombre);
  const enrol = c.servicios_muelle && typeof c.servicios_muelle === "object" && "enrolamiento" in c.servicios_muelle;
  const asunto = `${enrol ? "Enrolamiento" : "Actualización"} ${muelle} · CC ${cedula} · ${nombre}`;
  // Saludo según la hora de Bogotá; mensaje corto y formal
  const hora = Number(new Date().toLocaleString("en-US", { timeZone: "America/Bogota", hour: "numeric", hour12: false })) % 24;
  const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
  const texto = `${saludo}.\n\nPor favor ${enrol ? "enrolar" : "actualizar"} a ${nombre}, CC ${cedula}, en ${muelle}. Adjuntamos cédula, planilla de seguridad social de ${mes.name} y comprobante de pago.\n\nMuchas gracias.\n\nPROSEGUROSNET · 311 613 3523`;

  if (accion === "vista") {
    return json({ ok: true, para: destino.para, desde: GMAIL_USER || destino.desde || "", asunto, texto, faltan, adjuntos: rutas.map(([, n]) => `${n}_${cedula}.pdf`), listo: !!(GMAIL_USER && GMAIL_APP_PASSWORD) });
  }
  if (faltan.length) return json({ error: `Falta subir: ${faltan.join(", ")}.` }, 400);
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return json({ error: "Falta conectar el correo de envío (GMAIL_USER y GMAIL_APP_PASSWORD en Supabase)." }, 500);

  try {
    const adjuntos = [];
    for (const [ruta, n] of rutas) {
      const { data: blob, error } = await admin.storage.from(BUCKET).download(ruta);
      if (error || !blob) return json({ error: `No pude abrir el archivo de ${n.toLowerCase()}.` }, 500);
      const pdf = await aPDF(new Uint8Array(await blob.arrayBuffer()));
      adjuntos.push({ filename: `${n}_${cedula}.pdf`, content: pdf, contentType: "application/pdf" });
    }
    const transporte = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } });
    // «prueba»: el mismo correo, pero a proseguros44 (no al muelle) y sin anotarlo como enviado
    if (accion === "prueba") {
      await transporte.sendMail({ from: `PROSEGUROSNET <${GMAIL_USER}>`, to: GMAIL_USER, subject: `[PRUEBA] ${asunto}`, text: texto, attachments: adjuntos });
      return json({ ok: true, prueba: true, para: GMAIL_USER });
    }
    const info = await transporte.sendMail({ from: `PROSEGUROSNET <${GMAIL_USER}>`, to: destino.para, subject: asunto, text: texto, attachments: adjuntos });
    await admin.from("envios_muelle").upsert({
      month_id: mes.id, cedula, nombre: c.nombre, muelle, correo: destino.para, enviado_at: new Date().toISOString(),
      enviado_por: quien.user.id, estado: "enviado", respuesta: null, respuesta_at: null,
    }, { onConflict: "month_id,cedula,muelle" });
    return json({ ok: true, para: destino.para, id: info?.messageId || null });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    console.error("enviar-muelle:", msg);
    if (/535|Username and Password not accepted|Invalid login/i.test(msg)) return json({ error: "Gmail no aceptó la clave de aplicación. Revise GMAIL_APP_PASSWORD en Supabase." }, 502);
    return json({ error: "No se pudo enviar el correo. Intente de nuevo." }, 502);
  }
});
