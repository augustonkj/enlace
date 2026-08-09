// Testa a nova estrutura: TAR dentro da Qualitativa + janela Campo (Bourdieu).
import { readFileSync } from "node:fs";
const jsdomMod = await import("jsdom");
const { JSDOM, VirtualConsole } = jsdomMod.default ?? jsdomMod;
const html = readFileSync(new URL("../Enlace.html", import.meta.url), "utf8");
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e.message || e)));
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));
const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true,
  url: "https://local.test/Enlace.html", virtualConsole: vc,
  beforeParse(w) {
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.HTMLCanvasElement.prototype.getContext = () => ({ measureText: () => ({ width: 10 }), fillText() {}, save() {}, restore() {}, clearRect() {}, beginPath() {}, stroke() {} });
    w.SVGElement.prototype.getBBox = w.SVGElement.prototype.getBBox || (() => ({ x: 0, y: 0, width: 10, height: 10 }));
    w.scrollTo = () => {};
  },
});
const W = dom.window, doc = W.document;
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
await wait(2500);
const root = doc.getElementById("rootapp");
const all = (t) => [...root.querySelectorAll("button")].filter((x) => x.textContent.trim() === t);
const nav = (t) => all(t)[0];
const click = async (el, ms) => { el.dispatchEvent(new W.MouseEvent("click", { bubbles: true })); await wait(ms); };
const vis = () => [...root.querySelectorAll("div")].find((d) => d.style.display === "block" && d.style.height === "100%");
const pb = (re) => [...vis().querySelectorAll("button")].find((x) => re.test(x.textContent.trim()));
const ptxt = () => vis().textContent.replace(/\s+/g, " ").trim();
const ok = (c, m) => console.log((c ? "  ok  " : "  FALHA ") + m);

await click(nav("Pular"));

// 1) abas do topo
const topo = [...root.querySelectorAll("button")].slice(0, 3).map((b) => b.textContent.trim());
console.log("ABAS DO TOPO:", topo.join(" | "));
ok(topo.join("|") === "Análise Qualitativa|Mapa conceitual|Análise Quantitativa", "três janelas, começando na Qualitativa");

// 2) sub-abas da qualitativa
const subs = ["Texto", "Ator-Rede", "Campo (Bourdieu)"].filter((t) => all(t).length);
console.log("SUB-ABAS presentes:", subs.join(" | "));
ok(subs.length === 3, "sub-abas Texto / Ator-Rede / Campo");

// 3) Ator-Rede com alternador Tabela/Diagrama
await click(nav("Ator-Rede"), 600);
ok(!!nav("Tabela") && !!nav("Diagrama"), "alternador Tabela/Diagrama aparece");
console.log("  TAR tabela ->", ptxt().slice(0, 70));
await click(nav("Diagrama"), 700);
console.log("  TAR diagrama ->", ptxt().slice(0, 70));
ok(/Diagrama TAR/.test(ptxt()), "alterna para o diagrama da mesma rede");
await click(nav("Tabela"), 500);

// 4) Campo (Bourdieu)
await click(nav("Campo (Bourdieu)"), 700);
console.log("CAMPO ->", ptxt().slice(0, 120));
const proj = pb(/^Projeto/); await click(proj, 300);
const ex = pb(/Carregar exemplo/); await click(ex, 900);
const painel = vis();
const circles = painel.querySelectorAll("circle").length;
const textos = painel.querySelectorAll("text").length;
const linhas = painel.querySelectorAll("tbody tr").length;
console.log(`  gráfico: ${circles} círculos, ${textos} textos | tabela: ${linhas} agentes`);
ok(circles >= 8 && linhas === 8, "exemplo carregou 8 agentes e desenhou o espaço social");
const t = ptxt();
const mres = t.match(/volume médio ([\d,\.]+) \(de (\d+) a (\d+)\)/);
console.log("  resumo:", mres ? mres[0] : "(não achado)");
const mpolo = t.match(/Polo cultural: (\d+) · polo econômico: (\d+)/);
console.log("  polos:", mpolo ? mpolo[0] : "(não achado)");
ok(!!mres && !!mpolo, "resumo do espaço calculado");
// selecionar um agente pelo chip e ver as proximidades
const chip = [...painel.querySelectorAll("button")].find((b) => /Professor temporário/.test(b.textContent));
if (chip) { await click(chip, 500); const t2 = ptxt(); const i = t2.indexOf("Posições próximas"); console.log("  " + t2.slice(i, i + 180)); ok(i > 0, "proximidades no espaço social"); }
else ok(false, "chip do agente não encontrado");

// 5) método de Bourdieu na análise de texto
await click(nav("Texto"), 600);
const sel = [...vis().querySelectorAll("select")].find((s) => [...s.options].some((o) => /Bardin/.test(o.textContent)));
if (sel) {
  const metodos = [...sel.options].map((o) => o.textContent.trim());
  console.log("MÉTODOS (" + metodos.length + "):", metodos.join(" | "));
  const opt = [...sel.options].find((o) => /Bourdieu/.test(o.textContent));
  ok(!!opt, "método praxiológico (Bourdieu) disponível");
  if (opt) {
    Object.getOwnPropertyDescriptor(W.HTMLSelectElement.prototype, "value").set.call(sel, opt.value);
    sel.dispatchEvent(new W.Event("change", { bubbles: true }));
    await wait(600);
    const exq = pb(/^Exemplo$/); if (exq) await click(exq, 900);
    const tq = ptxt();
    console.log("  abas do método:", (tq.match(/Indícios \(capital\/habitus\)|Categorias praxiológicas|Interpretação/g) || []).join(" · "));
    ok(/Indícios \(capital\/habitus\)/.test(tq), "terminologia do método aplicada");
    ok(/escolha do curso superior/i.test(tq), "exemplo bourdieusiano carregado");
  }
} else ok(false, "seletor de métodos não encontrado");

// 6) "Salvar Enlace" precisa levar junto o campo de Bourdieu
let capturado = null;
W.URL.createObjectURL = (b) => { capturado = b; return "blob:teste"; };
W.URL.revokeObjectURL = () => {};
W.HTMLAnchorElement.prototype.click = function () {};
const arq = [...root.querySelectorAll("button")].find((b) => /^Arquivo/.test(b.textContent.trim()));
await click(arq, 300);
const salvar = [...root.querySelectorAll("button")].find((b) => /^Salvar Enlace/.test(b.textContent.trim()));
if (salvar) {
  await click(salvar, 900);
  if (capturado) {
    const o = JSON.parse(await capturado.text());
    console.log("SALVAR ENLACE -> chaves:", Object.keys(o).join(", "));
    ok(!!o.campo && Array.isArray(o.campo.agentes) && o.campo.agentes.length === 8, `o .json leva o campo (${o.campo && o.campo.agentes ? o.campo.agentes.length : 0} agentes)`);
    ok(!!o.tar && !!o.qual, "o .json continua levando TAR e texto");
  } else ok(false, "nada foi gerado ao salvar");
} else ok(false, "item 'Salvar Enlace…' não encontrado");

const eb = doc.getElementById("errbox");
if (W.getComputedStyle(eb).display !== "none" && eb.textContent.trim()) console.log("\n!! ERRO EM TELA:", eb.textContent.slice(0, 400));
const f = errors.filter((s) => !/opaque origins/.test(s));
console.log("\n=== erros ===\n" + (f.length ? f.slice(0, 6).join("\n") : "(nenhum)"));
W.close();
