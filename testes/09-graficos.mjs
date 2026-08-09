// Caracterização dos gráficos da janela quantitativa.
// Serve de rede de segurança: registra o que cada tipo desenha HOJE, para a
// troca da biblioteca de gráficos por SVG à mão não passar despercebida.
import { readFileSync } from "node:fs";
const m = await import("jsdom");
const { JSDOM, VirtualConsole } = m.default ?? m;
const errors = []; const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e.message || e)));
vc.on("error", (...a) => errors.push("err: " + a.join(" ").slice(0, 140)));
const dom = new JSDOM(readFileSync(new URL("../Enlace.html", import.meta.url), "utf8"), {
  runScripts: "dangerously", pretendToBeVisual: true, url: "https://l.test/x.html", virtualConsole: vc,
  beforeParse(w) {
    w.ResizeObserver = class { constructor(cb) { this.cb = cb; } observe(el) { this.cb([{ target: el, contentRect: { width: 640, height: 320 } }]); } unobserve() {} disconnect() {} };
    w.scrollTo = () => {};
    // o recharts mede o contêiner: sem layout no jsdom, forçamos um tamanho
    Object.defineProperty(w.HTMLElement.prototype, "offsetWidth", { get() { return 640; }, configurable: true });
    Object.defineProperty(w.HTMLElement.prototype, "offsetHeight", { get() { return 320; }, configurable: true });
    w.HTMLElement.prototype.getBoundingClientRect = function () { return { x: 0, y: 0, top: 0, left: 0, right: 640, bottom: 320, width: 640, height: 320 }; };
  },
});
const W = dom.window, doc = W.document;
const wait = (t = 400) => new Promise((r) => setTimeout(r, t));
await wait(2800);
const root = doc.getElementById("rootapp");
const nav = (t) => [...root.querySelectorAll("button")].find((x) => x.textContent.trim() === t);
const click = async (el, t) => { el.dispatchEvent(new W.MouseEvent("click", { bubbles: true })); await wait(t); };
const vis = () => [...root.querySelectorAll("div")].find((d) => d.style.display === "block" && d.style.height === "100%");
const pb = (re) => [...vis().querySelectorAll("button")].find((x) => re.test(x.textContent.trim()));
const ok = (c, msg) => { console.log((c ? "  ok  " : "  FALHA ") + msg); if (!c) process.exitCode = 1; };
const setSel = (el, v) => { Object.getOwnPropertyDescriptor(W.HTMLSelectElement.prototype, "value").set.call(el, v); el.dispatchEvent(new W.Event("change", { bubbles: true })); };

await click(nav("Pular"), 400);
await click(nav("Análise Quantitativa"), 900);
const selTeste = [...vis().querySelectorAll("select")].find((s) => [...s.options].some((o) => /Teste t/.test(o.textContent)));
ok(!!selTeste, "seletor de teste encontrado");

// desenha o gráfico de cada família e registra o que apareceu
const casos = [
  [/duas amostras independentes/, ["Barras", "Barras horizontais", "Linha", "Boxplot"]],
  [/Correlação de Pearson/, ["Dispersão (pontos)", "Linha"]],
  [/Qui-quadrado/, ["Barras agrupadas", "Barras empilhadas"]],
  [/Medidas descritivas/, ["Histograma (barras)", "Polígono de frequência", "Área"]],
];
for (const [reTeste, tipos] of casos) {
  const opt = [...selTeste.options].find((o) => reTeste.test(o.textContent));
  if (!opt) { ok(false, "teste não encontrado: " + reTeste); continue; }
  setSel(selTeste, opt.value);
  await wait(500);
  const ex = pb(/Carregar exemplo deste teste/);
  if (!ex) { ok(false, "sem exemplo para " + opt.textContent.trim()); continue; }
  await click(ex, 1100);
  const selTipo = [...vis().querySelectorAll("select")].find((s) => [...s.options].some((o) => tipos.includes(o.textContent.trim())));
  ok(!!selTipo, `${opt.textContent.trim()}: seletor de tipo de gráfico`);
  if (!selTipo) continue;
  for (const tipo of tipos) {
    const o = [...selTipo.options].find((x) => x.textContent.trim() === tipo);
    if (!o) { ok(false, `tipo ausente: ${tipo}`); continue; }
    setSel(selTipo, o.value);
    await wait(700);
    const svg = vis().querySelector("svg.recharts-surface") || vis().querySelector("svg");
    const marcas = svg ? svg.querySelectorAll("path, rect, circle, line").length : 0;
    const textos = svg ? svg.querySelectorAll("text").length : 0;
    console.log(`     ${tipo.padEnd(24)} marcas=${String(marcas).padStart(4)}  textos=${String(textos).padStart(3)}`);
    ok(!!svg && marcas >= 3, `${tipo}: desenhou o gráfico`);
  }
}

const f = errors.filter((s) => !/opaque origins/.test(s));
console.log("\n=== erros ===\n" + (f.length ? f.slice(0, 4).join("\n") : "(nenhum)"));
W.close();
