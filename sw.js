// PROSEGUROSNET · Copia de la app en el navegador para poder abrirla sin internet.
// - La app (index.html) se pide primero a internet, para tener siempre la última versión;
//   si no hay conexión, se usa la copia guardada.
// - La librería de la base de datos y las fuentes se guardan una vez y se reutilizan.
// - Los datos (clientes, pagos, documentos) NO pasan por aquí: los maneja la app.
const VERSION = "prosegurosnet-v1";
const APP = ["./", "./index.html"];
const LIBRERIAS = ["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    for (const url of [...APP, ...LIBRERIAS]){
      try{ await cache.add(new Request(url, { cache: "reload" })); }catch(e){ /* se guardará en la próxima visita */ }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter(n => n.startsWith("prosegurosnet-") && n !== VERSION).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Nunca interceptar la base de datos (datos, inicio de sesión, documentos).
  if (url.hostname.endsWith("supabase.co")) return;

  // La app: primero internet (última versión), si no hay, la copia guardada.
  const esApp = req.mode === "navigate" && url.origin === self.location.origin && !url.pathname.endsWith("portal.html");
  if (esApp){
    event.respondWith((async () => {
      try{
        const resp = await fetch(req);
        if (resp && resp.ok){
          const cache = await caches.open(VERSION);
          cache.put("./index.html", resp.clone());
        }
        return resp;
      }catch(e){
        const cache = await caches.open(VERSION);
        return (await cache.match("./index.html")) || (await cache.match("./")) || Response.error();
      }
    })());
    return;
  }

  // Librería de la base de datos y fuentes: la copia guardada, y si no hay, internet.
  const esLibreria = url.hostname === "cdn.jsdelivr.net" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (esLibreria){
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const guardada = await cache.match(req);
      if (guardada) return guardada;
      try{
        const resp = await fetch(req);
        if (resp && (resp.ok || resp.type === "opaque")) cache.put(req, resp.clone());
        return resp;
      }catch(e){
        return Response.error();
      }
    })());
  }
});
