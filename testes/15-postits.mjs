// Categorias como quadro de post-its: arrastar recortes entre categorias,
// copiar com Alt, tirar soltando em "Sem categoria", mover por clique, e o
// reflexo no Quantitativo, no desfazer e no arquivo salvo.
import { readFileSync } from "node:fs";
const m = await import("jsdom");
const { JSDOM, VirtualConsole } = m.default ?? m;
const errors = []; const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e.message || e)));
const dom = new JSDOM(readFileSync(new URL("../Enlace.html", import.meta.url), "utf8"), {
  runScripts: "dangerously", pretendToBeVisual: true, url: "https://l.test/x.html", virtualConsole: vc,
  beforeParse(w) { w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; w.scrollTo = () => {}; },
});
const W = dom.window, doc = W.document;
const wait = (t = 400) => new Promise((r) => setTimeout(r, t));
await wait(2800);
const root = doc.getElementById("rootapp");
const nav = (t) => [...root.querySelectorAll("button")].find((x) => x.textContent.trim() === t);
const click = async (el, ms = 400) => { el.dispatchEvent(new W.MouseEvent("click", { bubbles: true })); await wait(ms); };
const vis = () => [...root.querySelectorAll("div")].find((d) => d.style.display === "block" && d.style.height === "100%");
const pb = (re) => [...vis().querySelectorAll("button")].find((x) => re.test(x.textContent.trim()));
const ok = (c, msg) => { console.log((c ? "  ok  " : "  FALHA ") + msg); if (!c) process.exitCode = 1; };
const setInp = (el, v) => { Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new W.Event("input", { bubbles: true })); };

// arrastar de verdade: dragstart no post-it, dragover + drop na coluna, com o mesmo DataTransfer
const arrastar = async (postit, coluna, { alt = false } = {}) => {
  const dt = { d: {}, types: [], dropEffect: "", effectAllowed: "", setData(t, v) { this.d[t] = v; if (!this.types.includes(t)) this.types.push(t); }, getData(t) { return this.d[t] || ""; } };
  const ev = (tipo) => { const e = new W.Event(tipo, { bubbles: true, cancelable: true }); Object.defineProperty(e, "dataTransfer", { value: dt }); Object.defineProperty(e, "altKey", { value: alt }); return e; };
  postit.dispatchEvent(ev("dragstart"));
  coluna.dispatchEvent(ev("dragover"));
  coluna.dispatchEvent(ev("drop"));
  await wait(500);
};
const coluna = (nome) => nome === null ? vis().querySelector('[data-coluna=""]')
  : [...vis().querySelectorAll("[data-coluna]")].find((c) => [...c.querySelectorAll("input,textarea")].some((i) => i.value === nome));
const ids = (col) => [...col.querySelectorAll("[data-recorte]")].map((p) => p.dataset.recorte);

await click(nav("Pular"));
await click(nav("Texto"), 800);
const inp = [...vis().querySelectorAll('input[type="file"]')].find((i) => (i.accept || "").includes("json"));
Object.defineProperty(inp, "files", { value: [new W.File([readFileSync(new URL("./fixtures/texto-entrevista.json", import.meta.url), "utf8")], "t.json")], configurable: true });
inp.dispatchEvent(new W.Event("change", { bubbles: true }));
await wait(1500);
await click(pb(/^Categorias$/), 700);

ok(vis().querySelectorAll("[data-recorte]").length >= 8, "os recortes aparecem como post-its");
const desafios = coluna("Desafios da transição"), ganhos = coluna("Ganhos percebidos");
ok(!!desafios && !!ganhos, "cada categoria é uma coluna");
ok(ids(coluna(null)).length === 0, "pela associação de códigos, nenhum recorte começa sem categoria");

// nova categoria e arrastar um post-it que está lá "por código": vira cópia
await click(pb(/categoria emergente/), 500);
const alvoNome = "Organização do tempo";
{ const ta = coluna("Nova categoria").querySelector("textarea"); Object.getOwnPropertyDescriptor(W.HTMLTextAreaElement.prototype, "value").set.call(ta, alvoNome); ta.dispatchEvent(new W.Event("input", { bubbles: true })); }
await wait(700);
const p1 = coluna("Desafios da transição").querySelector("[data-recorte]");
const id1 = p1.dataset.recorte;
await arrastar(p1, coluna(alvoNome));
ok(ids(coluna(alvoNome)).includes(id1), "arrastar põe o recorte na outra categoria");
ok(ids(coluna("Desafios da transição")).includes(id1), "um recorte que está na categoria por código continua lá (tracejado)");

// tirar o código c4/c5 de "Ganhos": os recortes dele vão para Sem categoria
const g = coluna("Ganhos percebidos");
await click([...g.querySelectorAll("button")].find((b) => /códigos da categoria/.test(b.textContent)), 400);
const ligados = [...coluna("Ganhos percebidos").querySelectorAll("button")].filter((b) => b.style.opacity === "1");
for (const b of ligados) await click(b, 400);
const soltos = ids(coluna(null));
ok(soltos.length > 0, `desligar os códigos devolve os recortes à pilha Sem categoria (${soltos.length})`);

// arrastar da pilha para uma categoria: move
const p2 = coluna(null).querySelector("[data-recorte]"); const id2 = p2.dataset.recorte;
await arrastar(p2, coluna("Ganhos percebidos"));
ok(ids(coluna("Ganhos percebidos")).includes(id2) && !ids(coluna(null)).includes(id2), "da pilha para a categoria: move");

// entre categorias: move; com Alt: copia
await arrastar(coluna("Ganhos percebidos").querySelector(`[data-recorte="${id2}"]`), coluna(alvoNome));
ok(ids(coluna(alvoNome)).includes(id2) && !ids(coluna("Ganhos percebidos")).includes(id2), "entre categorias: move");
await arrastar(coluna(alvoNome).querySelector(`[data-recorte="${id2}"]`), coluna("Ganhos percebidos"), { alt: true });
ok(ids(coluna(alvoNome)).includes(id2) && ids(coluna("Ganhos percebidos")).includes(id2), "com Alt/Option: copia");

// soltar em Sem categoria tira da categoria de origem
await arrastar(coluna("Ganhos percebidos").querySelector(`[data-recorte="${id2}"]`), coluna(null));
ok(!ids(coluna("Ganhos percebidos")).includes(id2), "soltar em Sem categoria tira da categoria de origem");

// sem arrastar: clicar no post-it e em "colocar aqui"
await click(coluna(alvoNome).querySelector(`[data-recorte="${id2}"]`), 300);
await click([...coluna("Ganhos percebidos").querySelectorAll("button")].find((b) => /colocar o recorte selecionado aqui/.test(b.textContent)), 500);
ok(ids(coluna("Ganhos percebidos")).includes(id2) && !ids(coluna(alvoNome)).includes(id2), "clique + 'colocar aqui' move sem arrastar");

// desfazer
const tirarFoco = () => doc.activeElement && doc.activeElement.blur && doc.activeElement.blur();
tirarFoco(); await wait(700);
W.dispatchEvent(new W.KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true, cancelable: true })); await wait(500);
ok(ids(coluna(alvoNome)).includes(id2) && !ids(coluna("Ganhos percebidos")).includes(id2), "⌘Z desfaz a última movimentação");

// Quantitativo conta os recortes colocados à mão
await click(pb(/^Quantitativo$/), 700);
ok(new RegExp(alvoNome).test(vis().textContent), "a categoria nova aparece no Quantitativo");

// e o arquivo salvo guarda os vínculos
let cap = null;
W.URL.createObjectURL = (b) => { cap = b; return "blob:t"; }; W.URL.revokeObjectURL = () => {}; W.HTMLAnchorElement.prototype.click = function () {};
await click(pb(/^Salvar$/), 800);
const salvo = cap ? JSON.parse(await cap.text()) : null;
const cat = salvo && salvo.categories.find((c) => c.name === alvoNome);
ok(!!cat && cat.excerptIds.includes(id1) && cat.excerptIds.includes(id2), "o .json salvo guarda os recortes de cada categoria");

// ida e volta pelo .qde (REFI-QDA): as categorias e os recortes colocados nelas voltam
cap = null;
await click(pb(/^\.qde$/), 900);
const qde = cap ? await cap.text() : "";
ok(/Categorias: /.test(qde), "o .qde leva as categorias na descrição de códigos e recortes");
const inp2 = [...vis().querySelectorAll('input[type="file"]')].find((i) => (i.accept || "").includes("qde"));
Object.defineProperty(inp2, "files", { value: [new W.File([qde], "volta.qde")], configurable: true });
inp2.dispatchEvent(new W.Event("change", { bubbles: true }));
await wait(1500);
await click(pb(/^Categorias$/), 700);
const volta = coluna(alvoNome);
ok(!!volta && ids(volta).length === 2, `reaberto, o .qde recria a categoria com os 2 recortes colocados nela (${volta ? ids(volta).length : "sem coluna"})`);
ok(!!coluna("Desafios da transição") && ids(coluna("Desafios da transição")).length >= 3, "e as categorias que agrupam códigos");
ok(![...vis().querySelectorAll("[data-recorte]")].some((p) => /Categorias:/.test(p.title)), "o texto 'Categorias:' não vaza para a nota do recorte");

const f = errors.filter((s) => !/opaque origins/.test(s));
console.log("\n=== erros ===\n" + (f.length ? f.slice(0, 4).join("\n") : "(nenhum)"));
W.close();
