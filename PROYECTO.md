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

## Pendiente por decidir
- Más adelante: versión para vender a otras empresas, CRM nivel 2 (IA) y nivel 3 (WhatsApp Business).
