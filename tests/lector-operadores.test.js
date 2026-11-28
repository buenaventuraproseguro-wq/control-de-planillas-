// Prueba la clasificación de páginas (planilla / comprobante) del lector PILA.
const fs = require("fs"), assert = require("assert");
const src = fs.readFileSync(__dirname + "/../index.html", "utf8");
const ini = src.indexOf("(function(global){\n  // Une los pedazos de texto del PDF");
const fin = src.indexOf("})(typeof window !== \"undefined\" ? window : globalThis);", ini);
assert(ini > 0 && fin > ini, "no se encontró el lector PILA");
const g = {}; new Function("globalThis", src.slice(ini, fin).replace("(function(global){", "var global=globalThis;") )(g);
const L = g.LectorPILA;
const planilla = ["Planilla Resumen", "LIQUIDACION DETALLADA", "2026-11 2026-11 123456789 9515155525 I 2026/11/27 2026/11/27 BANCO",
  "CC 75055328 QUINTERO CARLOS URIEL 30 $ 1.000.000 $ 160.000 $ 1.000.000 $ 125.000 $ 1.000.000 $ 40.000 $ 5.000 $ 1.000.000 $ 330.000"];
const recibo = ["Comprobante de pago", "Transacción aprobada", "CUS 123456", "Valor pagado $ 330.000", "Fecha 2026/11/27", "Planilla 9515155525"];
assert.strictEqual(L.clasificarPagina(planilla), "planilla");
assert.strictEqual(L.clasificarPagina(recibo), "comprobante");
assert.strictEqual(L.clasificarPagina([]), "sinTexto");
const d = L.datosComprobante(recibo);
assert.strictEqual(d.valor, 330000); assert.strictEqual(d.numeroPlanilla, "9515155525");
assert.strictEqual(L.operadorPorTexto("Mi Planilla pago"), "Mi Planilla");
assert.strictEqual(L.operadorPorTexto("Aportes en Línea"), "Aportes en Línea");
console.log("lector-operadores OK");
