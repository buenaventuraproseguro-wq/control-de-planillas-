# PROSEGUROSNET · Control de planillas

Ficha para retomar el proyecto en cualquier conversación nueva con Claude.
**Aquí no van contraseñas ni claves.**

## Dónde está todo
- **App (equipo):** https://buenaventuraproseguro-wq.github.io/control-de-planillas-/
- **Portal de clientes:** https://buenaventuraproseguro-wq.github.io/control-de-planillas-/portal.html
- **Código:** este repositorio (`index.html`, `portal.html`, `sw.js`)
- **Base de datos:** Supabase, proyecto `jjygarfwdmhzspqonvql`

## Reglas que siempre se respetan
- Cada cliente solo ve sus propias planillas y documentos.
- Los trabajadores editan clientes, incluidos el costo del servicio y los valores de EPS, ARL, AFP y caja. El recargo por mora y la contabilidad general (gastos, informes) son del administrador.
- Gastos: los trabajadores ven y agregan, pero no borran.
- Toda acción de borrar pide confirmación.
- Consignaciones: nunca se usan claves del banco y la app nunca aplica pagos sola. Se lee solo la cuenta *8222; otras cuentas solo cuando hay relación exacta con una planilla.

## Funciones principales
- Planillas por mes
- Importar PILA, incluido ingreso/retiro
- Caja de compensación
- Traslados de EPS (no van en Lista de tareas)
- Recargo por mora: $5.000 después del día 21, SIN PAGO y DÍAS PROPORCIONALES
- Enlaces rápidos
- Guía de afiliaciones por EPS con archivos
- Copiar cédula
- Lugar de trabajo junto a Estado ARL
- Consignaciones desde el celular (MacroDroid)
- Reingreso: estado REINGRESO en Agregar cliente (o al escribir una cédula que ya estuvo) trae sus datos, pone fecha de ingreso de hoy y costo de afiliación; se guarda como AFILIACIÓN con nota "reingreso dd/mm/aaaa" y etiqueta 🔁
- Colores de la página (menú 18): cada persona escoge su tema; se guarda en su propio equipo
- Retiros: al avanzar de mes, el RETIRO sin soporte (PSN: planilla; otra empresa: imagen o planilla de la novedad) pasa al mes siguiente
- Retiro PROSEGUROSNET: el botón "Pedir retiro" (o elegir RETIRO al editar) deja el retiro pendiente; pasa a RETIRO solo al subir la planilla o el soporte. Otra empresa se marca directo.
- Ayudas inteligentes (menú 19–23): Hoy (se abre sola 1 vez al día), Estado de cuenta por responsable/empresa (imagen con QR), Revisión de datos (cédulas repetidas, teléfonos, EPS/empresas/AFP escritas distinto, PAGO sin planilla), Quién se atrasa más, Respaldos automáticos
- Foto de cédula: la app lee número y nombre (tesseract.js en el navegador) y pregunta antes de usarlos
- Consignaciones: también sugiere el pago de un grupo (responsable/empresa) cuando el valor es la suma exacta de sus afiliados
- Respaldo semanal: tabla `respaldos` (solo admin la ve), función `crear_respaldo`, pg_cron lunes 04:00 UTC; guarda las 8 últimas. No incluye fotos/PDF.
- Vehículo y licencia (Editar cliente, sección opcional): placa, vencimientos de licencia, SOAT, tecnomecánica y póliza + fotos/PDF (licencia, SOAT y tecno juntos, póliza; el PDF se guarda como imagen). Menú 24 "Vencimientos": desde 30 días antes y hasta 60 después, con mensaje de WhatsApp de la empresa; queda marcado "avisado". También sale en "Hoy".
- Muelles independientes (Actualización de Muelles): fecha de vencimiento por cada muelle (venc_por_muelle: Sociedad, TC Buen, Agua Dulce), planilla y comprobante de su empresa (PDF→imagen) y sección de vehículo/licencia; avisos en "Vencimientos" y "Hoy".
- Certificados EPS/ARL/AFP/Caja en Agregar/Editar cliente: la app lee cédula, EPS, fecha de afiliación (→ fecha de ingreso), ARL (nivel y actividad), AFP y caja; pregunta "Llenar estos datos" y avisa si la cédula no coincide.
- Muelles independientes: servicios por persona con su valor (servicios_muelle jsonb {"act:Sociedad","act:TC Buen","act:Agua Dulce", enrolamiento; "actualizacion" = de antes}; Costo = suma). Antes: servicio_muelle: actualización (se cobra cada mes) y enrolamiento (una sola vez: pagado no pasa al mes siguiente; sin pagar pasa en DEBE). Recibo por persona.
- Fecha del sistema (bajo el selector de mes): hoy, mes en que se trabaja y día del próximo paso de mes. Cuando el mes real empieza, al administrador se le propone pasar de mes con UN solo "Sí" (si dice no, se repite al día siguiente; botón "Pasar a …" en el recuadro). Crear un mes que no ha empezado pide escribir su nombre.
- 14.1 Generar Excel para SUAPORTE: formato "Formato_Ayuda" de Enlace Operativo (fila 1-2 aportante Nestor Fabián Garzón CC 1112904783, fila 3 títulos, 98 columnas por afiliado, sin totales). Periodo = mes anterior al cobro. Lista "listos" = PAGO sin planilla este mes (número, archivo o subida a la nube desde el 1.º) + retiros que deben; "todavía no pagan" sin marcar. Cálculo sobre 1 SMMLV con techo a la centena; sin caja = IBC y aporte CCF $100. Probado contra 7 afiliados de planillas reales de sept-2026: valores, días, novedades y códigos iguales. Códigos EPS/AFP/CCF en configuracion.codigos_pila. Se sube en Autoliquidación de aportes → Cargar archivo.

## Pendiente por decidir
- Más adelante: versión para vender a otras empresas, CRM nivel 2 (IA) y nivel 3 (WhatsApp Business).

- 14.1 PILA (ajustes tras la prueba en SUAPORTE): Tipo Salario = F; Actividad económica ARL (Decreto 768) según clase/centro de las planillas reales (1→1651101, 4/41→4492301, 5/8→5521001, 5/7→5422001) o el código de 7 dígitos del certificado; si no se conoce va vacío y SUAPORTE lo corrige. Nombres: botones ⇄ y ✏️; las partes (apellido1|apellido2|nombre1|nombre2) se guardan en configuracion clave "nombres_pila" para que un nombre de 3 palabras no se parta mal.
- 14.1 PILA: la caja siempre va como Comfenalco Valle (CCF56) y la ARL siempre Sura (14-11), diga lo que diga el cliente.
- 14.1 PILA: los independientes (Responsable/Grupo "independiente") NO van en el Excel de PROSEGUROSNET; pagan con su propia planilla (aportante = su cédula, IBC según sus aportes, su ARL p. ej. Positiva). Falta: Excel propio por independiente (pedir una planilla pagada de muestra).
- 14.1 PILA independientes: botón "Excel de su planilla" por cada uno (aportante = su nombre y cédula, forma U sin sucursal, tipo E). Base = aporte pensión / 0,16 (ajustada a múltiplos del mínimo); ARL Positiva si el cliente la tiene, si no Sura; caja Comfenalco ($100 si no tiene). Probado contra el comprobante 88606462 de Sebastián Muriel ($472.300).
- 14.1 independientes: selector Planilla I / E por persona (se guarda en configuracion "pila_tipo_independientes"; por defecto I). Planilla I = tipo cotizante 57, salud 12,5 %, caja 2 %, exonerado N, periodo salud = periodo pensión, tipo aportante 2. Probado contra la planilla 88967890 de Lenis ($1.312.000 sin mora).
- Brayan Villamizar (1005161028) paga planilla I en Aportes en Línea (9510824142): salud 12,5 %, sin caja (CCF vacío y $0), periodos 2026-09/2026-09, Bucaramanga. El lector de 14 lee bien las planillas de Aportes en Línea.
- 14.1 base del independiente: ✏️ para escribirla (configuracion "pila_base_independientes"); Sebastián Muriel cotiza sobre $2.094.734 (planilla I 88608488: Colpensiones, SOS, Positiva, sin caja = $742.900). Planilla I sin caja: días CCF 0.
- 14.1 Otras empresas: planilla E con el dueño como aportante (configuracion "pila_aportantes_empresas", empresa → {nombre, cedula}). renovat = SEBASTIAN MURIEL RIOS CC 1235139380, empleado Jhonatan Muriel Ríos (planilla 88606462 = $472.300). Se calcula igual que PROSEGUROSNET.
- 14.1 Otras empresas: solo salen las que tienen aportante guardado; a MANUEL no le liquidamos planillas.
- 14.1: quien no aporta pensión va con subtipo de cotizante (Estado AFP "Pensionado" → 1; "no aporta pensión" → 5, como pidió SUAPORTE para Willian Ochoa Torres) y días/IBC de pensión iguales a los demás con tarifa 0. Retiro antes del ingreso → mismo día del ingreso. Emssanar = ESSC18.
- Coosalud en planilla = EPS042 (contributivo; lo pagan los empleadores). ESSC24 es el subsidiado.
