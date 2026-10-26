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
- Reingreso: al agregar una cédula que ya estuvo en meses anteriores, ofrece traer sus datos
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

## Pendiente por decidir
- Más adelante: versión para vender a otras empresas, CRM nivel 2 (IA) y nivel 3 (WhatsApp Business).
