# CLAUDE.md · Arranque rápido (PROSEGUROSNET · Control de planillas)

Léeme primero. Detalle e historia completa: `PROYECTO.md`.
El usuario es Nestor (dueño de PROSEGUROSNET, Buenaventura). **Responder siempre en español, claro y sin tecnicismos.**

## Dónde está todo
- App del equipo: https://buenaventuraproseguro-wq.github.io/control-de-planillas-/ (GitHub Pages, rama `main`, se publica al hacer push)
- Portal de clientes: `portal.html` (https://buenaventuraproseguro-wq.github.io/control-de-planillas-/portal.html, corto: https://prosnet.co/portal) · App Muelles y Seguros: `seguros.html` (https://buenaventuraproseguro-wq.github.io/control-de-planillas-/seguros.html, misma base y clave; edita muelles, vehículo, SOAT y pólizas con avisos 20/7/1; pagos y datos del cliente siguen en la app principal; la ficha y Hoy de la app principal la enlazan: `resumenSegurosFicha`, `avisosSegurosHoy`, `abrirAppSeguros`) · Service worker: `sw.js` (red primero)
- Página web pública (repo aparte `buenaventuraproseguro-wq/prosegurosnet-web`, dominio prosnet.co): inicio https://prosnet.co · conductores https://prosnet.co/conductores · muelles https://prosnet.co/muelles · cotizar https://prosnet.co/cotizar · enviar documentos https://prosnet.co/documentos · política de datos https://prosnet.co/privacidad
- Todo el código de la app está en un solo archivo: `index.html` (HTML + CSS + JS)
- Supabase proyecto `jjygarfwdmhzspqonvql`. Admin de la app: buenaventuraproseguro@gmail.com
- Mes actual en la tabla `months` (Noviembre 2026 = id 22). Clientes en `clients` (una fila por cliente y mes)

## Regla fija: nunca afectar la información guardada
1. Antes de publicar: `select public.crear_respaldo('antes de cambio: <qué>')` y contar clientes y pagos del mes actual.
2. Cambios de diseño o pantallas: no tocan la base de datos ni la forma de guardar/sincronizar.
3. Si un cambio toca cómo se guarda o sincroniza: solo agrega o completa, nunca borra ni reemplaza datos de la nube. Probar antes.
4. Después del push: volver a contar y comparar. Decirle al usuario los conteos.

## Reglas de seguridad (no negociables)
- Nunca pedir ni escribir en el chat: token de Alegra, credenciales de la API de Enlace, clave de consignaciones, datos de tarjetas, clave de Hostinger. Los secretos van en Supabase.
- No poner claves de usuarios: cada uno cambia la suya (botón 🔑 Clave o «¿Olvidó su clave?»).
- Gmail: solo leer y resumir; borradores solo si los pide. Nunca enviar, borrar ni archivar sin que lo pida.
- Facturas: solo borradores en Alegra; el contador las emite. La app nunca emite a la DIAN. Recibos y pagos sí. Incapacidades no se facturan.
- Consignaciones: solo cuenta *8222.

## Cómo trabajar rápido
- Clonar: repo `buenaventuraproseguro-wq/control-de-planillas-` en `/home/claude/control-de-planillas-`.
- Revisar sintaxis: extraer los `<script>` de `index.html` y correr `node --check`.
- Ver cambios visuales: Playwright (ya instalado) abriendo `file://.../index.html` con las peticiones a supabase/cdn bloqueadas.
- Commits a `main`, mensaje en español, con las líneas de atribución que indique la sesión.
- Anotar cada cambio importante al final de `PROYECTO.md` (fecha · qué · por qué).

## Mapa del código (buscar por nombre)
- Sincronización con la nube: `sincronizarClientesMes`, `calcularPendientes`, `filtrarPendientesSeguros` (protege de copias viejas), `aplicarPendientesSobreNube`
- Carga inicial: `cargarStoreDesdeSupabase`; entrada: `mostrarAppPrincipal`, `initAuth`, `pedirClaveNuevaPorEnlace`
- Lista de clientes: `renderList` (búsqueda por cédula, nombre o N.º); ficha: `showBreakdown`
- Menú lateral: `numerarMenu` (numera solo, en orden); pantalla Hoy: `abrirHoy`
- Avanzar de mes: botón `advanceBtn` + `construirRegistroMesSiguiente`
- Empresas: `renderListaEmpresasEditar`, `abrirDocsEmpresa` (RUT y Cámara en storage `documentos-clientes/empresa-<nombre>/`)
- Afiliaciones en trámite: `abrirAfilTramites`, `renderAfilTramites`, `atDeFichas`, `diasHabilesEntre`; tabla `afiliaciones_tramite`; el correo entra con `registrar_afiliacion_correo` (tarea "Correo a la app")
- Contrato de mandato: `abrirMandato`, `textoMandato`, `pintarBotonMandato`; firmados en storage `documentos-clientes/contratos-mandato/<documento>`
- Registro de cambios (solo admin): `abrirRegistroCambios`, `renderRegistroCambios`; tabla `registro_cambios`
- Cierre del mes para el contador (solo admin, solo lee): `abrirCierreContador`, `datosCierreContador`, `descargarCierreContador`
- Seguros y pólizas: `abrirPolizas`, `renderPolizas`, `mensajePoliza`; tabla `polizas`; la comisión entra en `resumenIngresos`
- Envío de planillas: en pausa con `var ENVIO_PLANILLAS_EN_PAUSA = true` (reactivar cuando llegue la API de Enlace)

## Protecciones en la base de datos
- Trigger `a_bloquear_copia_vieja` en `clients`: ignora escrituras con `ultima_edicion` 12 h más vieja que la nube; las anota en `escrituras_bloqueadas`.
- Trigger `impedir_borrado_masivo_clients`. Trigger `registrar_fecha_pago` (pone/quita `fecha_pago` según el estado).
- Trigger `z_registro_cambios` en `clients`: anota cada cambio en `registro_cambios` (nunca bloquea el guardado).
- Respaldo diario 04:00 UTC (pg_cron `respaldo-semanal`, tabla `respaldos`; se guardan 21 días + los lunes).

## Pendientes (actualizar al cerrar cada tema)
- 13 pagos de Noviembre sin número de planilla (se perdió el 12-nov). Consulta: `estado_tramite='PAGO' and no_planilla_pagada=''` en el mes 22.
- Revisar a José Adier Velandia, Luis Delio Herrera Gil, Johan Grajales y Sebastián Muriel (cambios del 9 al 12 de nov. que pudieron perderse).
- Comfenalco Valle: inexactitud por aportes de caja de $100 (planilla 89893112341; plazo de 30 días desde el 9 de nov.), 3 reportados sin afiliación y 8 afiliados sin reportar. Avisos diarios a nestor.fabian.garzon.29@gmail.com.
- Reactivar envío de planillas cuando Enlace dé la API.
- Contrato de mandato: falta que el contador o un abogado revise el texto modelo.
