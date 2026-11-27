// Prueba automática de la REGLA FIJA DE ARL (Nestor, 27-nov-2026).
// Correr: node tests/arl-regla.test.js   (falla si alguien cambia la regla)
const fs = require("fs"), assert = require("assert");
const src = fs.readFileSync(__dirname + "/../index.html", "utf8");
const trozo = (nombre) => { const i = src.indexOf("function " + nombre); assert(i >= 0, "falta " + nombre); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++){ if (src[k] === "{") d++; if (src[k] === "}" && --d === 0) return src.slice(i, k + 1); } };
const PILA_TARIFA_ARL = { 1: 0.00522, 2: 0.01044, 3: 0.02436, 4: 0.0435, 5: 0.0696 };
assert(src.includes("const PILA_TARIFA_ARL = { 1: 0.00522, 2: 0.01044, 3: 0.02436, 4: 0.0435, 5: 0.0696 }"), "tarifas ARL cambiaron");
const ctx = `const PILA_TARIFA_ARL=${JSON.stringify(PILA_TARIFA_ARL)}; const PILA_SALARIO=1750905;
const techo100=n=>Math.ceil(n/100)*100; const numOrZero=v=>Number(v)||0; const esConductorExcluido=r=>!!r._cond;
const clasificarRiesgoArl=()=>0; const lleveSalario=()=>false; const salarioDe=()=>0;
${trozo("arlCobrar")}\n${trozo("valorArlDelMes")}\n return {arlCobrar, valorArlDelMes};`;
const { arlCobrar, valorArlDelMes } = new Function(ctx)();
// Katerine: nivel 4, ingreso 24-oct → 7 días → igual que la planilla ($17.800)
assert.strictEqual(arlCobrar({ "ARL Nivel": 4 }, 7 / 30), 17800);
// Nivel 5, ingreso 20-oct → 11 días
assert.strictEqual(arlCobrar({ "ARL Nivel": 5 }, 11 / 30), 44700);
// Se cobra aunque el valor guardado esté vacío o mal
assert.strictEqual(valorArlDelMes({ "ARL Nivel": 4, "Valor ARL": 0 }, 7 / 30), 17800);
assert.strictEqual(valorArlDelMes({ "ARL Nivel": 4, "Valor ARL": 999999 }, 7 / 30), 17800);
assert.strictEqual(valorArlDelMes({ "ARL Nivel": 4, "Valor ARL": 0 }, 1), 76200);
// Mes completo con valor guardado: no cambia
assert.strictEqual(valorArlDelMes({ "ARL Nivel": 4, "Valor ARL": 76200 }, 1), 76200);
// Conductor excluido: sin ARL, usa lo guardado (0)
assert.strictEqual(valorArlDelMes({ _cond: 1, "ARL Nivel": 4, "Valor ARL": 0 }, 7 / 30), 0);
// La app debe usar la regla en total y aportes
assert(/valorArlDelMes\(r, factorAportes\)/.test(src) && /arl: valorArlDelMes\(r, factor\)/.test(src), "calcularTotalPagar/calcularAportesApp ya no usan la regla fija de ARL");
console.log("✅ Regla fija de ARL: todas las pruebas pasan");
