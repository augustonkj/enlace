// Testa o corpus multi-documento, atributos e consultas na Análise Qualitativa.
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
await wait(3000);
const root = doc.getElementById("rootapp");
const nav = (t) => [...root.querySelectorAll("button")].find((x) => x.textContent.trim() === t);
const click = async (el, ms) => { el.dispatchEvent(new W.MouseEvent("click", { bubbles: true })); await wait(ms); };
const vis = () => [...root.querySelectorAll("div")].find((d) => d.style.display === "block" && d.style.height === "100%");
const pb = (re) => [...vis().querySelectorAll("button")].find((x) => re.test(x.textContent.trim()));
const ptxt = () => vis().textContent.replace(/\s+/g, " ").trim();
const vals = () => [...vis().querySelectorAll("input")].map((i) => i.value).join(" | ");
const ok = (c, m) => { console.log((c ? "  ok  " : "  FALHA ") + m); if (!c) process.exitCode = 1; };
const setInp = (el, v) => { Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new W.Event("input", { bubbles: true })); };
const setSel = (el, v) => { Object.getOwnPropertyDescriptor(W.HTMLSelectElement.prototype, "value").set.call(el, v); el.dispatchEvent(new W.Event("change", { bubbles: true })); };

await click(nav("Pular"));
await click(nav("Texto"), 800);

// exemplo (projeto antigo de um texto só) precisa migrar sem perder recortes
await click(pb(/^Exemplo$/), 1200);
ok(/Documentos/.test(ptxt()) && /Consultas/.test(ptxt()), "abas Documentos e Consultas aparecem");

await click(nav("Documentos"), 700);
let linhas = vis().querySelectorAll("tbody tr").length;
console.log("  documentos após migrar o exemplo:", linhas, "|", vals().slice(0, 80));
ok(linhas === 1, "projeto antigo virou 1 documento (migração)");
ok(/8/.test(ptxt()), "os 8 recortes do exemplo sobreviveram à migração");

// importar dois documentos de uma vez
const inputArquivo = [...vis().querySelectorAll('input[type="file"]')].find((i) => (i.accept || "").includes(".txt"));
const f1 = new W.File(["Entrevista com a professora A. Ela fala sobre autonomia na escola."], "prof-a.txt", { type: "text/plain" });
const f2 = new W.File(["Entrevista com o professor B. Ele fala sobre sobrecarga e tempo."], "prof-b.txt", { type: "text/plain" });
Object.defineProperty(inputArquivo, "files", { value: [f1, f2], configurable: true });
inputArquivo.dispatchEvent(new W.Event("change", { bubbles: true }));
await wait(1200);
linhas = vis().querySelectorAll("tbody tr").length;
console.log("  documentos após importar 2:", linhas, "|", vals().slice(0, 90));
ok(linhas === 3, "dois arquivos viraram dois documentos, sem apagar o primeiro");
ok(/prof-a/.test(vals()) && /prof-b/.test(vals()), "nome do arquivo virou nome do documento");

// atributo + valores
const campoAttr = [...vis().querySelectorAll("input")].find((i) => /escola, turno/.test(i.placeholder || ""));
setInp(campoAttr, "turno"); await wait(200);
await click(pb(/^adicionar$/), 600);
ok(/turno/.test(ptxt()), "atributo criado");
const celas = [...vis().querySelectorAll("tbody input")].filter((i) => i.placeholder === "—");
console.log("  células de atributo:", celas.length);
setInp(celas[0], "manhã"); await wait(150);
setInp(celas[1], "tarde"); await wait(150);
setInp(celas[2], "tarde"); await wait(400);
ok(celas.length === 3, "cada documento ganhou uma célula do atributo");

// consultas: recuperação entre documentos
await click(nav("Consultas"), 800);
const t = ptxt();
console.log("  " + (t.match(/\d+ recorte\(s\) em \d+ documento\(s\)/) || ["(sem contagem)"])[0]);
ok(/8 recorte\(s\) em 1 documento/.test(t), "sem filtro, recupera os 8 recortes do corpus");
// filtrar por um código
const caixas = [...vis().querySelectorAll('input[type="checkbox"]')];
console.log("  códigos disponíveis:", caixas.length);
caixas[0].click(); await wait(600);
const t2 = ptxt();
console.log("  " + (t2.match(/\d+ recorte\(s\) em \d+ documento\(s\)/) || [""])[0]);
ok(/[1-9] recorte\(s\)/.test(t2), "filtro por código recupera recortes");
// modo "todos (E)" com dois códigos deve reduzir
caixas[5] && caixas[5].click(); await wait(400);
const antes = +(ptxt().match(/(\d+) recorte\(s\)/) || [0, 0])[1];
await click(pb(/todos no mesmo recorte/), 600);
const depois = +(ptxt().match(/(\d+) recorte\(s\)/) || [0, 0])[1];
console.log(`  OU = ${antes} recortes · E = ${depois} recortes`);
ok(depois <= antes, "operador E é mais restritivo que OU");
await click(pb(/nenhum \(NÃO\)/), 600);
const neg = +(ptxt().match(/(\d+) recorte\(s\)/) || [0, 0])[1];
console.log("  NÃO =", neg, "recortes");
ok(neg + antes === 8, "OU + NÃO cobrem todo o corpus (8)");

// comparação por grupo
await click(pb(/qualquer \(OU\)/), 300);
const selGrupo = [...vis().querySelectorAll("select")].find((s) => [...s.options].some((o) => o.textContent === "turno"));
ok(!!selGrupo, "seletor de comparação por grupo existe");
if (selGrupo) {
  setSel(selGrupo, "turno"); await wait(700);
  const t3 = ptxt();
  console.log("  cruzamento:", /Comparação por grupo/.test(t3) ? (t3.match(/manhã.{0,40}/) || [""])[0] : "(vazio)");
  ok(/manhã/.test(t3) && /tarde/.test(t3), "tabela código × grupo montada");
}

const eb = doc.getElementById("errbox");
if (W.getComputedStyle(eb).display !== "none" && eb.textContent.trim()) console.log("\n!! ERRO EM TELA:", eb.textContent.slice(0, 500));
const f = errors.filter((s) => !/opaque origins/.test(s));
console.log("\n=== erros ===\n" + (f.length ? f.slice(0, 6).join("\n") : "(nenhum)"));
W.close();
