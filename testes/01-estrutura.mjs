// Testa a estrutura: três janelas, com Texto, Revisão e Ator-Rede dentro da Qualitativa.
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
const subs = ["Texto", "Revisão", "Ator-Rede"].filter((t) => all(t).length);
console.log("SUB-ABAS presentes:", subs.join(" | "));
ok(subs.length === 3 && !all("Campo (Bourdieu)").length, "sub-abas Texto / Revisão / Ator-Rede");

// 3) Ator-Rede com alternador Tabela/Diagrama
await click(nav("Ator-Rede"), 600);
ok(!!nav("Tabela") && !!nav("Diagrama"), "alternador Tabela/Diagrama aparece");
console.log("  TAR tabela ->", ptxt().slice(0, 70));
await click(nav("Diagrama"), 700);
console.log("  TAR diagrama ->", ptxt().slice(0, 70));
ok(/Diagrama TAR/.test(ptxt()), "alterna para o diagrama da mesma rede");
await click(nav("Tabela"), 500);

// 4) análise de texto: só a análise livre, com seis abas
await click(nav("Texto"), 600);
const botoes = [...vis().querySelectorAll("button")].map((b) => b.textContent.trim());
const abas = ["Documentos", "Codificação", "Categorias", "Consultas", "Quantitativo", "Metatexto"];
console.log("ABAS DO TEXTO:", abas.filter((a) => botoes.includes(a)).join(" | "));
ok(abas.every((a) => botoes.includes(a)), "abas Documentos / Codificação / Categorias / Consultas / Quantitativo / Metatexto");
ok(!["Confiabilidade", "Rede", "Memos"].some((a) => botoes.includes(a)), "sem as abas Confiabilidade, Rede e Memos");
ok(!/Método de análise/.test(ptxt()), "sem seletor de método");

// 5) "Salvar Enlace" reúne as ferramentas num único .json
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
    ok(!!o.tar && !!o.qual, "o .json continua levando TAR e texto");
  } else ok(false, "nada foi gerado ao salvar");
} else ok(false, "item 'Salvar Enlace…' não encontrado");

const eb = doc.getElementById("errbox");
if (W.getComputedStyle(eb).display !== "none" && eb.textContent.trim()) console.log("\n!! ERRO EM TELA:", eb.textContent.slice(0, 400));
const f = errors.filter((s) => !/opaque origins/.test(s));
console.log("\n=== erros ===\n" + (f.length ? f.slice(0, 6).join("\n") : "(nenhum)"));
W.close();
