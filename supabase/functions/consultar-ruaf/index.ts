import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Consulta el RUAF (salud, pensión, ARL, caja, cesantías) en Verifik con la cédula y su fecha de expedición.
// Solo responde a personas del equipo. No guarda nada: devuelve los datos a la app y la persona decide.
// La clave de Verifik vive SOLO en los secretos de Supabase (VERIFIK_TOKEN). Sin esa clave, la consulta está apagada.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFIK_TOKEN = (Deno.env.get("VERIFIK_TOKEN") || "").trim();
const VERIFIK_URL = "https://api.verifik.co/v2/co/afiliaciones";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", ...CORS } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: quien, error: eq } = await admin.auth.getUser(token);
  if (eq || !quien?.user) return json({ error: "No autenticado" }, 401);
  const { data: perfil } = await admin.from("profiles").select("role").eq("id", quien.user.id).maybeSingle();
  if (!perfil?.role) return json({ error: "Su usuario no es del equipo." }, 403);

  let cuerpo: any;
  try { cuerpo = await req.json(); } catch { return json({ error: "Cuerpo inválido" }, 400); }

  // La app pregunta primero si la consulta está activa (no cuesta nada)
  if (String(cuerpo.accion || "") === "estado") return json({ activo: !!VERIFIK_TOKEN });
  if (!VERIFIK_TOKEN) return json({ apagado: true, error: "La consulta en línea aún no está activa (falta la cuenta de Verifik)." }, 200);

  const cedula = String(cuerpo.cedula || "").replace(/\D/g, "");
  const tipo = ["CC", "CE", "PA", "PE"].includes(String(cuerpo.tipo || "CC").toUpperCase()) ? String(cuerpo.tipo || "CC").toUpperCase() : "CC";
  const fecha = String(cuerpo.fechaExpedicion || "").trim();
  if (cedula.length < 5 || cedula.length > 12) return json({ error: "Escriba bien la cédula." }, 400);
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(fecha)) return json({ error: "Escriba la fecha de expedición como DD/MM/AAAA." }, 400);

  const url = `${VERIFIK_URL}?documentType=${tipo}&documentNumber=${cedula}&date=${encodeURIComponent(fecha)}`;
  let resp: Response;
  try {
    resp = await fetch(url, { headers: { "Authorization": `Bearer ${VERIFIK_TOKEN}`, "Accept": "application/json" }, signal: AbortSignal.timeout(60000) });
  } catch {
    return json({ error: "Verifik no respondió. Intente de nuevo en un rato o use la captura." }, 502);
  }
  const r: any = await resp.json().catch(() => ({}));
  const msg = String(r?.message || r?.error || "");
  if (resp.status === 404) {
    return json({ error: /expedition|expedici/i.test(msg)
      ? "La fecha de expedición no coincide con la cédula. Revísela en la cédula (esta consulta sí se cobra)."
      : "No se encontró esa cédula en el RUAF (esta consulta sí se cobra)." }, 404);
  }
  if (resp.status === 401 || resp.status === 403) return json({ error: "La clave de Verifik venció o no sirve. Hay que renovarla." }, 502);
  if (resp.status === 409) return json({ error: "Verifik no pudo conectarse con el RUAF ahora (no se cobra). Intente más tarde o use la captura." }, 502);
  if (!resp.ok) return json({ error: "Verifik respondió con un error. Use la captura por ahora." }, 502);
  return json({ ok: true, datos: r?.data ?? r });
});
