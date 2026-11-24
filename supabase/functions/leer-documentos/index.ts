import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@1.13.0";

// Asistente de afiliaciones: lee las fotos o PDF (ya convertidos a imagen en la app) de los documentos
// de un cliente (cédula, RUAF, certificados de EPS/ARL/pensión/caja, formularios a mano, registros civiles)
// y devuelve los datos encontrados. NO guarda nada: la app los muestra para que una persona los revise.
// La clave de la IA vive SOLO aquí, en los secretos de Supabase (ANTHROPIC_API_KEY).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
const MODELO = (Deno.env.get("MODELO_DOCUMENTOS") || "claude-opus-5-5").trim();
const MAX_IMAGENES = 12;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", ...CORS } });

const S = { type: "string" };
const I = { type: "integer" };
const obj = (props: Record<string, unknown>) => ({ type: "object", properties: props, required: Object.keys(props), additionalProperties: false });
const ESQUEMA = obj({
  documentos: { type: "array", items: obj({
    indice: I,
    tipo: { type: "string", enum: ["cedula", "ruaf", "certificado_eps", "certificado_arl", "certificado_pension", "certificado_caja", "formulario_eps", "registro_civil", "otro"] },
    descripcion: S,
    legible: { type: "boolean" },
    problema: S,
  }) },
  persona: obj({
    cedula: S, primer_nombre: S, segundo_nombre: S, primer_apellido: S, segundo_apellido: S,
    fecha_nacimiento: S, sexo: { type: "string", enum: ["M", "F", ""] },
    direccion: S, barrio: S, municipio: S, telefono: S, correo: S,
    estado_civil: { type: "string", enum: ["SOLTERO(A)", "CASADO(A)", "UNIÓN LIBRE", "SEPARADO(A)", "VIUDO(A)", ""] },
    cargo: S, salario: S,
  }),
  eps_actual: obj({ nombre: S, regimen: S, estado: S, tipo_afiliado: S, fecha_afiliacion: S, municipio: S, fuente: I }),
  eps_solicitada: obj({ nombre: S, fuente: I }),
  pension: obj({ fondo: S, regimen: S, estado: S, fecha_afiliacion: S, fuente: I }),
  arl: obj({ nombre: S, nivel_riesgo: { type: "string", enum: ["1", "2", "3", "4", "5", ""] }, estado: S, fecha: S, fuente: I }),
  caja: obj({ nombre: S, estado: S, fuente: I }),
  beneficiarios: { type: "array", items: obj({
    nombre: S, documento: S, parentesco: { type: "string", enum: ["Cónyuge", "Hijo/a", "Otro"] }, fecha_nacimiento: S, fuente: I,
  }) },
  dudas: { type: "array", items: obj({ campo: S, motivo: S }) },
});

const INSTRUCCIONES = `Eres el asistente de afiliaciones de una oficina colombiana que afilia trabajadores a seguridad social (EPS, pensión, ARL y caja de compensación).
Te llegan imágenes numeradas (0, 1, 2…) con los documentos de UNA persona: cédula de ciudadanía (frente y/o reverso), captura del RUAF o de ADRES, certificados de afiliación (EPS, ARL, pensión, caja), formularios de afiliación de EPS llenos a mano y registros civiles o documentos de beneficiarios.

Reglas:
- Copia los datos exactamente como aparecen. No inventes ni completes nada: si un dato no aparece o no se lee con seguridad, déjalo vacío ("") y anótalo en "dudas" con el motivo.
- Nombres y apellidos en MAYÚSCULAS, separados en primer/segundo nombre y primer/segundo apellido. Si la persona tiene un solo nombre o un solo apellido, deja vacío el segundo.
- Cédula: solo números, sin puntos.
- Fechas en formato DD/MM/AAAA.
- Sexo: "M" o "F". En la cédula colombiana el sexo y la fecha de nacimiento están en el reverso.
- Si un dato sale distinto en dos documentos, usa el de la cédula para identidad, y anota la diferencia en "dudas".
- En "documentos" pon una fila por cada imagen, con su índice, qué es, y si se lee bien. Si está borrosa, cortada, oscura, con reflejo o le falta una parte, pon legible=false y explica en "problema" qué pedir de nuevo (ej. "la foto está borrosa, pida otra con buena luz").
- eps_actual: la EPS en la que la persona está HOY según RUAF/ADRES o certificado de EPS (nombre corto, régimen contributivo/subsidiado, estado activo/retirado/suspendido, tipo de afiliado cotizante/beneficiario, fecha de afiliación, municipio). eps_solicitada: la EPS que aparece en el formulario de afiliación lleno (a la que se quiere afiliar), o "" si no hay formulario.
- pension: fondo de pensión (nombre corto, ej. PORVENIR, COLPENSIONES, PROTECCION, COLFONDOS, SKANDIA) y su estado.
- arl: nombre de la ARL (ej. SURA, POSITIVA, COLMENA, BOLIVAR, AXA COLPATRIA), nivel o clase de riesgo (1 a 5), estado y fecha.
- caja: caja de compensación y su estado.
- "fuente" es el índice de la imagen de donde sacaste ese bloque, o -1 si no hay.
- Para nombres de EPS usa el nombre corto común: NUEVA EPS, SURA, SANITAS, SALUD TOTAL, SOS, COMPENSAR, FAMISANAR, COMFENALCO VALLE, ALIANSALUD, COOSALUD, MUTUAL SER, SALUD MIA, EMSSANAR, ASMET SALUD, etc. (ej. "ENTIDAD PROMOTORA DE SALUD SERVICIO OCCIDENTAL DE SALUD S.A. S.O.S." es "SOS").
- beneficiarios: solo los que aparecen en registros civiles o en la parte de beneficiarios de un formulario.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: quien, error: eq } = await admin.auth.getUser(token);
  if (eq || !quien?.user) return json({ error: "No autenticado" }, 401);
  const { data: perfil } = await admin.from("profiles").select("role").eq("id", quien.user.id).maybeSingle();
  if (!perfil?.role) return json({ error: "Su usuario no es del equipo." }, 403);

  if (!API_KEY) return json({ error: "sin_clave", mensaje: "Falta poner la clave de la IA (ANTHROPIC_API_KEY) en los secretos de Supabase." }, 503);

  let cuerpo: any;
  try { cuerpo = await req.json(); } catch { return json({ error: "Cuerpo inválido" }, 400); }
  const imagenes = Array.isArray(cuerpo.imagenes) ? cuerpo.imagenes.slice(0, MAX_IMAGENES) : [];
  if (!imagenes.length) return json({ error: "No llegaron documentos." }, 400);

  const contenido: any[] = [];
  imagenes.forEach((im: any, i: number) => {
    const m = String(im.data || "").match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
    if (!m) return;
    contenido.push({ type: "text", text: `Imagen ${i}${im.nombre ? ` (archivo «${String(im.nombre).slice(0, 80)}»)` : ""}:` });
    contenido.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  });
  if (!contenido.length) return json({ error: "Los archivos no son imágenes válidas." }, 400);
  contenido.push({ type: "text", text: "Lee todos los documentos y devuelve los datos de la persona." });

  const client = new Anthropic({ apiKey: API_KEY });
  try {
    const r: any = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      system: INSTRUCCIONES,
      messages: [{ role: "user", content: contenido }],
    } as any);
    if (r.stop_reason === "refusal") return json({ error: "La IA no quiso leer estos documentos." }, 422);
    if (r.stop_reason === "max_tokens") return json({ error: "La respuesta quedó incompleta. Intente con menos documentos." }, 422);
    const texto = (r.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    let datos: any;
    try { datos = JSON.parse(texto); } catch { return json({ error: "La IA respondió algo que no se entiende. Intente de nuevo." }, 502); }
    return json({ datos, uso: r.usage ? { entrada: r.usage.input_tokens, salida: r.usage.output_tokens } : null });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "sin_clave", mensaje: "La clave de la IA no es válida. Revísela en los secretos de Supabase." }, 503);
    if (e instanceof Anthropic.PermissionDeniedError) return json({ error: "La cuenta de la IA no tiene permiso. Revise la cuenta en console.anthropic.com." }, 503);
    if (e instanceof Anthropic.RateLimitError) return json({ error: "La IA está ocupada. Espere un minuto e intente de nuevo." }, 429);
    if (e instanceof Anthropic.BadRequestError && /credit|balance|billing/i.test(String((e as any).message))) return json({ error: "sin_saldo", mensaje: "Se acabó el saldo de la cuenta de la IA. Recárguela en console.anthropic.com." }, 402);
    if (e instanceof Anthropic.APIError) return json({ error: `La IA respondió con error (${e.status}). Intente de nuevo.` }, 502);
    return json({ error: "No se pudo conectar con la IA." }, 502);
  }
});
