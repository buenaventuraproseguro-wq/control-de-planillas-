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
- Foto de cédula: la app lee número y nombre (tesseract.js en el navegador; si falta algo, repite con la foto mejorada). Muestra lo leído en recuadros corregibles y no lo pega hasta que la cédula sea válida y estén apellidos y nombres. Un cliente nuevo o una cédula corregida no se guarda si empieza en 0. Al corregir la cédula de un cliente, sus documentos pasan al número nuevo.
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
- EPS: lista EPS_COLOMBIA (29 EPS con su código contributivo para PILA) en el campo EPS de agregar/editar cliente; debajo se ve el código que va a la planilla. Los códigos de 14.1 salen de esa lista.
- Estado AFP "Indemnizacion Sustitutiva" (indemnización sustitutiva o devolución de saldos): no paga pensión, en 14.1 va con subtipo 05. Pensionado → subtipo 01.
- Caja mínima: CAJA_MINIMA = 100. Afiliados de PROSEGUROSNET sin caja llevan Valor Caja $100 (al escoger "Sin Caja", al guardar, y al avanzar de mes). Un valor de $100 NO cuenta como tener caja (tieneCaja/pilaTieneCaja > 100). Independientes, conductores, muelles y otras empresas no.
- Actividad ARL: PILA_ACTIVIDAD_CORTA convierte la actividad corta de Sura (4 dígitos) a la de 7 del Decreto 768: 1|6511→1651101, 4|4923→4492301, 5|5521→5521001, 5|4220→5422001, 5|5493→5493001 (este último lo sugirió SUAPORTE). Debajo del campo ARL del cliente se ve la actividad que va a la planilla; si no la reconoce pide escribir la de 7 dígitos.
- Certificado ARL: al subirlo se leen riesgo, centro de trabajo y actividad (7 dígitos, o la corta convertida) y el campo ARL queda "sura 5 cd 005 ac 5493001".
- Certificado AFP: toma el fondo que más se nombra en el certificado (no se confunde con traslados), muestra el código y lo que tenía el cliente; si dice pensionado o indemnización sustitutiva pone ese Estado AFP. Debajo del campo AFP se ve el código de la planilla.
- Subtipos de pensión (lista de SUAPORTE) por Estado AFP: Pensionado → 01, No cumple semanas / no obligado por edad → 03, Requisitos cumplidos → 04, Indemnización sustitutiva → 05; "no aporta pensión" escrito en AFP sin estado → 05. Todos sin cobro de pensión.
- Lugar de trabajo: menús Departamento y Municipio con DIVIPOLA completa (33 departamentos, 1.121 municipios, tomada de pasosdeJesus/sip). Se guarda "Municipio (Departamento)"; los textos viejos ("Buga", "Bogotá") se reconocen. Debajo se ve el código (ej. 68-001) que va a la planilla.
- ARL_TABLE redondeada como en la planilla: I 9.200, II 18.300, III 42.700, IV 76.200, V 121.900. Al avanzar de mes normalizarPensionArl deja ARL según el nivel y pensión 280.200 (0 si no aporta) a los afiliados de PROSEGUROSNET.
- 14.1: buscador (nombre, cédula, responsable, empresa), "Marcar los que se ven", "Desmarcar todos", resumen de marcados con total y el botón Descargar muestra cuántos van.
- Documentos por mes: planilla_pagada y comprobante_pago se guardan con columna "mes" (YYYY-MM del mes de cobro), ruta "cedula/tipo_YYYY-MM" y único (cedula,tipo,mes). Cada mes muestra solo los suyos; al pasar de mes el cliente queda sin planilla ni comprobante. El portal dice de qué mes es cada planilla. Los demás documentos tienen mes "".
- Recordatorios: opción "Enviar también el QR del banco" en el editor del mensaje (configMensaje.qr, se guarda para todo el equipo). Al enviar un recordatorio se abre el chat con el texto y queda copiada la imagen del QR con el valor del cliente para pegarla.
- 16 Libro contable: gastos.tipo (gasto|ingreso). Ingresos con categorías fijas (pagos de clientes en efectivo/transferencia, servicios, otros). Cierre del mes: ingresos por medio y por tipo, gastos pagados por categoría y por tercero, efectivo del mes y resultado; referencia de lo pagado por clientes en la app. Exportar CSV con totales. Categoría "Pagos a terceros" agregada.
- Recordatorios: "mensajero" (y variantes) no es un responsable sino una actividad: cada mensajero recibe su recordatorio a su nombre.
- Agregar/editar cliente: si la actividad del código ARL es de un riesgo distinto al nivel escogido, se avisa en rojo debajo del campo y NO deja guardar (claseDeActividad / errorRiesgoArl).
- ARL: si no se reconoce la actividad (o el certificado no se leyó bien) se muestran botones con las actividades recomendadas para ese riesgo (las más usadas por los clientes primero); al tocar una, el campo queda "sura N cd 00X ac XXXXXXX". Si hay choque de riesgo, ofrece "Poner nivel X".
- 15.2 Ganancias de gestiones: solo las del mes (por la fecha de la tarea). Campo tareas.cobrada; las no cobradas de meses anteriores salen como "Deudas de meses anteriores" con botón "✅ Ya pagó". Las anteriores a noviembre 2026 quedaron como cobradas.
- Libro contable: recuadro "Resultado mes a mes" (ingresos, gastos pagados, pendientes, resultado y acumulado por mes).
- Alegra: función de Supabase `alegra` (secretos ALEGRA_EMAIL y ALEGRA_TOKEN) y tabla `facturas_alegra` (una por cédula y mes). Botón "Facturar en Alegra" solo para el administrador, con el cliente en PAGO: toma el costo del servicio de la base de datos y crea un BORRADOR con numeración FE. Todavía no emite a la DIAN. Falta confirmar la forma de pago y activar la emisión. La resolución FE va de 1 a 500: falta el aviso cuando queden pocos números.
- Responsables → 🧾 Datos para factura: nombre o razón social, tipo y número de documento, correo y teléfono, más "cada cliente se factura a su nombre" (factura_individual). Arriba se ve lo que falta para facturar (responsables y clientes sin correo). Facturar: con responsable real sale un borrador a su nombre, una línea por cada cliente en PAGO sin facturar; sin responsable o con grupo general, a nombre del cliente. Se pide el medio de pago. Si el borrador se elimina en Alegra, los clientes quedan libres al volver a facturar.
- Beneficiarios: el documento se puede subir como foto o PDF. El PDF (hasta 6 páginas) se convierte siempre en una imagen JPG y se guarda como imagen; si no se puede convertir, no se guarda y se pide una foto.
- Muelles independientes: servicio 🎓 Curso con tipo y valor (servicios_muelle: curso y _cursoTipo). El curso se queda en el mes en que se hizo: no pasa al mes siguiente ni se copia al editar un mes anterior, esté pagado o no. Quien solo tomó un curso no pasa de mes.
- 15 Cartera → 📈 Ingresos del mes: tarjetas (ingreso de la empresa, hoy, por cobrar, aportes, total), avance, detalle por día con nombres y por línea. clients.fecha_pago la pone el trigger registrar_fecha_pago al pasar a PAGO; si sale de PAGO se borra. fecha_pago_aprox = fecha tomada de la última edición (pagos anteriores al 4 nov. 2026). Los cobros extra no se suman porque la app no sabe si ya se pagaron.
- Planilla individual (tipo planilla_individual, por mes): al importar la planilla, cada afiliado recibe una copia JPG idéntica a la planilla original, con los mismos totales y encabezados, donde solo se tapan las filas de los demás afiliados; lleva una nota pequeña que lo explica. Si la planilla tiene un solo afiliado se usa el PDF tal cual. Si la fila no se encuentra exacta no se crea y se avisa. La planilla completa (planilla_pagada) es solo del equipo: el portal no la lee (RLS en documentos y storage). 14.2 Separar planillas del mes procesa lo ya subido.
- Consignaciones: el administrador cambia la clave del celular desde la ventana de consignaciones (función cambiar_clave_consignaciones). La clave se muestra una sola vez y no se guarda en la app.
- Documentos: casilla Radicado EPS (radicado_eps). Cada documento se clasifica por su contenido (clasificarDocumento): si está en la casilla equivocada no se usa ningún dato y se ofrece pasarlo a la suya. La cédula y el nombre del formulario solo salen de la foto de la cédula; la cédula de la empresa (aportante) no cuenta como la del afiliado.
- Recibo detallado: el recibo impreso y la imagen separan servicio, recargo y aportes por subsistema; no reemplaza la factura. 15 Cartera → 🧾 Aportes recibidos y pagados: aportes de clientes pagados, con y sin planilla, por subsistema y por planilla, con descarga CSV para el contador. Son valores de la app y se comparan con la planilla y el banco.
- 15 Cartera → 🧾 Crear borradores en Alegra (solo administrador): lista los pagos sin factura del mes, por responsable o cliente, con casillas y medio de pago, y crea los borradores en grupo. No envía nada a la DIAN; el contador los revisa en Alegra.
- Punto 7 → 🩺 Pagos de incapacidades (tabla incapacidades): persona, entidad, fechas, dinero que entra, pago a la persona y comisión. Estados Por recibir, Por pagar y Pagada. Solo la comisión de las pagadas suma en Ingresos del mes, en la fecha de pago. El administrador elimina.
- Incapacidades pagadas con comisión: el administrador crea en Alegra un borrador de la comisión (acción incapacidad de la función alegra). La plata de la persona no va en la factura. Emitir a la DIAN se hace desde Alegra.
- Documentos repetidos: documentos.huella (SHA-256 del archivo guardado) y huella_origen (del archivo escogido). Si el mismo archivo ya está en ese cliente y casilla no se vuelve a subir; si está en otra casilla u otro cliente se avisa con opción de quitarlo. Planillas y comprobantes se excluyen porque se comparten. Los documentos guardados antes del 6 nov. 2026 no tienen huella.
- 6 nov. 2026: la planilla individual se desactivó y se borraron las existentes, hasta que Enlace dé acceso o integración. La planilla completa sigue oculta en el portal.
- 6 nov. 2026: documentos de otra cédula (cédula, certificados EPS/ARL/AFP/Caja, radicado EPS, licencia) se sacan de la casilla y no se guardan; botón "Sí es de este cliente, dejarlo" por si la lectura falló.
- 8 nov. 2026: el envío une planilla + comprobante en UN PDF (pdf-lib 1.17.1) y el mensaje es corto; WhatsApp repetía el texto en cada archivo.
- 6 nov. 2026: botón "📤 Enviar planillas pagadas" (barra de recordatorios) y "Enviar planilla y comprobante" en cada cliente. Sin API: en celular usa Compartir con los archivos; en PC descarga los archivos y abre WhatsApp Web con el mensaje. Agrupa por responsable, no repite archivos iguales, marca clients.soporte_enviado. La planilla con varias personas se manda completa (decisión del usuario) hasta tener el certificado individual de Enlace.
- 7 nov. 2026: Ingresos del mes incluye las afiliaciones (estado AFILIACIÓN, $149.000 todo ingreso) en la línea "Afiliaciones", con la fecha de ingreso como día.
- 8 nov. 2026: reenvío desde la ficha: mensaje formal "Como lo solicitó, le reenviamos la planilla pagada de MES, con fecha de pago DD/MM/AAAA" y selector de mes para reenviar planillas de meses anteriores (no cambia la marca del mes actual).
- 9 nov. 2026: página pública para clientes en /web/ (entrada con tractomula, servicios, "Trabajamos con", cotizador con mínimo 2026 y redondeo PILA, cédula + autorización Ley 1581, preguntas). Se genera desde el tablero de diseño; no toca la app ni el portal.
- 9 nov. 2026: conductores mandan cédula, planilla y comprobante desde /web/ (sección #conductores). Tabla solicitudes_conductores (anon solo inserta; equipo ve/atiende) y bucket privado solicitudes-conductores (anon solo sube a pendiente/, 8 MB, imagen o PDF). En la app: menú "Documentos de conductores (web)" con contador; "Guardar en el cliente" copia cédula → cedula, planilla → planilla_pagada y comprobante → comprobante_pago del mes que se ve.
- 9 nov. 2026: el formulario de documentos de la web sirve también para muelles (columna servicio: actualizacion_conductor, actualizacion_muelles, enrolamiento, curso; archivo extra "otro"). Las tarjetas de muelles llevan primero al formulario. En la app el menú se llama "Documentos recibidos (web)" y muestra el trámite.
- 9 nov. 2026: dominio prosegurosnet.com (Hostinger, 3 años, en revisión). La página pública vive en el repo buenaventuraproseguro-wq/prosegurosnet-web (CNAME prosegurosnet.com; atajos /muelles /conductores /cotizar /documentos). Se arma con el script del tablero de diseño; /web/ de este repo queda como copia.

## 9 nov. 2026 — Soporte de pago en blanco
- Los comprobantes en PDF protegido (con contraseña de dueño) salían en blanco al unirlos con pdf-lib.
  Ahora `unirEnUnPdf` detecta `isEncrypted` (o un PDF que pdf-lib no abre) y dibuja esas páginas como imagen con pdf.js (`pdfComoImagenes`).
- Se marcaron como enviados (soporte_enviado = 9 nov.) los 37 clientes de noviembre en PAGO / PAGO CONDUCTOR / RETIRO que estaban sin marcar, a pedido del usuario: desde ahora la cola solo muestra los nuevos pagos.

## 9 nov. 2026 — Cambiar contraseña
- Botón "🔑 Clave" junto a "Salir": el usuario con sesión abierta cambia su propia contraseña (sb.auth.updateUser). Nadie más la ve.

## 10 nov. 2026 — Recibos de caja en Alegra (guía del contador)
- Modelo: la factura electrónica lleva SOLO los honorarios. El recibo de caja (pago tipo "in" en Alegra) cruza la factura por los honorarios y lleva los aportes de la planilla a la cuenta 2815 "Ingresos recibidos para terceros". Nada va a la DIAN.
- 15 Cartera → 🧾 Recibos de caja en Alegra (solo administrador): lista las facturas del mes creadas por la app. Borrador = aún no se puede (hay que emitirla en Alegra). Por factura: valor de la planilla por persona (EPS + pensión + ARL + caja, de la ficha) editable, casilla "Paga caja" con su valor, medio de pago y botón Crear recibo.
- Función alegra (archivo recibos.ts): acciones recibos_config, recibos_config_guardar (banco y cuenta 2815 guardados en configuracion.alegra), recibos_pendientes, recibo. Tabla recibos_caja (una por factura; si el recibo se borra en Alegra, la factura queda libre).
- Pendiente de verificar con el primer recibo real: formato exacto que Alegra acepta en /payments (bankAccount, paymentMethod, categories).
- 10 nov. 2026 (mensajes de Neider, contador): recibo de APORTES separado ("Otros ingresos", cuenta 2815) que se hace ANTES de emitir la factura; recibo de HONORARIOS (pago a la factura) después de emitida; PAGO (egreso, tipo out) a Enlace Operativo por planilla, desde la 2815. Cada recibo y pago se descarga de Alegra en PDF y se guarda en documentos-clientes/alegra/<mes>/ (botón Ver PDF). Tablas recibos_caja (tipo aportes|honorarios, pdf_path) y pagos_enlace. Configuración: banco, cuenta 2815 y proveedor Enlace (configuracion.alegra).
- 10 nov. 2026: la gestión de cobro de incapacidades NO se factura (indicación del contador). Se quitó el botón y la acción de la función.

## 10 nov. 2026 — Presunción de costos
- Menú Clientes → 10.1 Presunción de costos (independientes): calculadora (Res. UGPP 532 de 2024, porcentajes por CIIU, ARL 1-5, caja opcional, sin/con presunción) y botón para bajar Presuncion_de_costos_independientes.xlsx (en la raíz del repo).
- Presunción: con la cédula trae nombre, celular, servicio y ARL del cliente; "Trabajadores a su cargo" (sugiere los que tienen el mismo celular) suma su total del mes; botón Enviar cobro por WhatsApp y Copiar mensaje.
- Ficha del cliente → botón 📊 Presunción de costos: casilla "liquida cada mes con presunción" (configuracion.presuncion_costos), ingreso del mes, actividad y costos reales; "Aplicar" cambia salud, pensión, ARL y caja del mes y guarda la base en pila_base_independientes (Excel SUAPORTE). El botón se pone en color mientras falte el ingreso del mes. Sebastián Muriel Ríos (1235139380) quedó activo, actividad F.
- 10 nov. 2026: los cobros ya no mencionan Nequi. Datos de pago: llave Bre-B 0078275062, cuenta de ahorros Bancolombia 84317568222 a nombre de Nestor Fabian Garzón — prosegurosnet (constantes LLAVE_BREB, CUENTA_BANCOLOMBIA, TITULAR_CUENTA).
- 10 nov. 2026: Excel SUAPORTE de "Otras empresas": si hay empleados que aún no están en PAGO, pregunta si se incluyen (antes el botón quedaba deshabilitado; caso Jhonatan Muriel Ríos, empresa renovat, aportante Sebastián Muriel Ríos).
- 10 nov. 2026: consignaciones automáticas (correo y celular) SOLO de la cuenta *8222; se borraron las de otras cuentas no aplicadas. Tareas "Correo a la app" y "Resumen diario" actualizadas.
- 11 nov. 2026: sincronización de clientes: si la cédula ya existe en la nube en ese mes (error 23505), no se bloquea todo: se toma la fila de la nube y solo se llenan los campos vacíos; un cliente con error no detiene a los demás. Caso: operador proseguros44 con su cola trabada (409 cada 9 s).

## Nuevo diseño · Paso 1 (menú lateral y barra de arriba) — nov 2026
- Menú lateral reagrupado (mismos botones e IDs): Hoy · **Mes actual** (Cartera, Consignaciones, Subir planilla, SUAPORTE, Documentos web) · **Clientes** · **Equipo y empresa** · "Más opciones" (Consultas, Respaldos y archivos, Ajustes). Los números viejos (1–24) se conservan.
- La última opción tocada queda iluminada (clase `active` + barra de luz `::before` con `--gold`) aunque se cierre la ventana; se recuerda en `localStorage` ("prosegurosnet_nav_activo"). Función: `marcarNavActivo`.
- Tema nuevo "Azul y naranja" (`data-tema="naranja"`), por defecto en equipos que no han escogido colores.
- Barra de arriba: chip del mes de trabajo (`#mesChip`, copia de `#monthSelect`) y buscador rápido Ctrl+K (`#overlayBuscarRapido`): busca opciones del menú por nombre o número y, con una cédula o nombre, llena `#searchInput`.
- Grupo "Lo más usado" justo debajo de Hoy: Agregar cliente (1), Guía de afiliaciones por EPS (10) y Enlaces rápidos (17).
- Números del menú: ahora se ponen solos en orden (1, 2, 3…) de arriba hacia abajo con `numerarMenu()`; las opciones ocultas no cuentan y las de adentro de Cartera llevan 5.1, 5.2… Se vuelven a numerar cuando una opción aparece o se oculta.
- "Hoy" (ícono de casita) y "Agregar cliente" van sin número; la numeración empieza en 1 con la siguiente opción.
- "Guía y enlaces" (`#navAyudasBtn`) despliega Guía de afiliaciones y Enlaces rápidos (`#ayudasSub`); se recuerda abierto/cerrado ("prosegurosnet_menu_ayudas"). Barra lateral más ancha (296 px en computador) y opciones más compactas.

## Nuevo diseño · Paso 2 (pantalla "Hoy") — nov 2026
- `abrirHoy()` ahora arma: 4 tarjetas (clientes del mes, planillas pagadas con barra, pendientes de pago, soportes por enviar), tabla de pendientes de pago (N.º, cliente, responsable, valor, estado: Sin pago / Cobro enviado / Pasó el día 16; tocar una fila abre la ficha) y el panel "Para hoy" con tarjetas que llevan a cada sección (soportes, consignaciones, tareas, vencimientos, retiros, datos con problemas; las que son listas se despliegan).
- Botón naranja "Agregar cliente" arriba. Acciones nuevas en `data-hoy`: soportes, pendientes (filtro `__PENDIENTES__`), pagadas, todos, nuevo. La lógica de `datosHoy()` no cambió. Sigue abriéndose sola la primera vez del día como antes.

## Nuevo diseño · Paso 3.1 (lo que se repite) — nov 2026
- Estados con colores fijos en modo claro: PAGO verde, SIN PAGO rojo, AFILIACIÓN/DEBE azul, DÍAS PROPORCIONALES naranja, RETIRO gris, SIN INICIAR gris claro (etiquetas redondas).
- Botones con borde fino y esquinas de 10 px; en el tema "Azul y naranja" el botón principal (`.btn.primary`) es naranja oscuro (#C2410C, buen contraste) y "danger" rojo.
- Ventanas: esquinas de 16 px, sombra suave, títulos de 19 px y botón × arriba a la derecha que usa el botón Cerrar/Cancelar de esa ventana (solo se agrega si existe, para no romper ventanas con lógica propia).
