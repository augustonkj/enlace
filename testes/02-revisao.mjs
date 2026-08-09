// Testa a Revisão de literatura: tabela, contagens, modos, diagrama e importação.
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
const nav = (t) => [...root.querySelectorAll("button")].find((x) => x.textContent.trim() === t);
const click = async (el, ms) => { el.dispatchEvent(new W.MouseEvent("click", { bubbles: true })); await wait(ms); };
const vis = () => [...root.querySelectorAll("div")].find((d) => d.style.display === "block" && d.style.height === "100%");
const pb = (re) => [...vis().querySelectorAll("button")].find((x) => re.test(x.textContent.trim()));
const ptxt = () => vis().textContent.replace(/\s+/g, " ").trim();
const ok = (c, m) => { console.log((c ? "  ok  " : "  FALHA ") + m); if (!c) process.exitCode = 1; };
const setSel = (el, v) => { Object.getOwnPropertyDescriptor(W.HTMLSelectElement.prototype, "value").set.call(el, v); el.dispatchEvent(new W.Event("change", { bubbles: true })); };
const setInp = (el, v) => { Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new W.Event("input", { bubbles: true })); };

await click(nav("Pular"));
ok(!!nav("Revisão"), "sub-aba Revisão existe");
await click(nav("Revisão"), 700);
console.log("REVISÃO ->", ptxt().slice(0, 110));

// exemplo
await click(pb(/^Projeto/), 300);
await click(pb(/Carregar exemplo/), 900);
const linhas = vis().querySelectorAll("tbody tr").length;
const t = ptxt();
const cont = {};
["identificados", "duplicados", "triados", "excluídos na triagem", "não recuperados", "avaliados", "excluídos na leitura", "incluídos"]
  .forEach((k) => { const m = t.match(new RegExp(k.replace(/[()]/g, "\\$&") + ": (\\d+)")); cont[k] = m ? +m[1] : null; });
console.log("  linhas na tabela:", linhas, "| contagens:", JSON.stringify(cont));
ok(linhas === 14, "14 referências no exemplo");
ok(cont.identificados === 14 && cont.duplicados === 2 && cont.triados === 12, "identificados/duplicados/triados");
ok(cont["excluídos na triagem"] === 4 && cont["não recuperados"] === 1 && cont.avaliados === 7, "triagem, não recuperados e avaliados");
ok(cont["excluídos na leitura"] === 3 && cont.incluídos === 4, "excluídos na leitura e incluídos (7 = 3 + 4)");

// diagrama
await click(nav("Diagrama"), 800);
const svg = vis().querySelector("svg");
const caixas = svg ? svg.querySelectorAll("rect").length : 0;
const txts = svg ? [...svg.querySelectorAll("text")].map((x) => x.textContent) : [];
console.log("  caixas:", caixas, "| textos:", txts.length);
console.log("  " + txts.filter((x) => /n = /.test(x)).join(" ; "));
ok(caixas >= 8, "diagrama PRISMA desenhado");
ok(txts.some((x) => /identificados nas bases \(n\s*=\s*14\)/.test(x)), "caixa de identificados com n = 14 (sem quebrar o número)");
ok(txts.some((x) => /incluídos na revisão \(n\s*=\s*4\)/.test(x)), "caixa de incluídos com n = 4");
ok(txts.some((x) => /Scopus: /.test(x)), "quebra por base na identificação");
ok(txts.some((x) => /não é pesquisa empírica: 1/.test(x)) && txts.some((x) => /fora da educação básica: 2/.test(x)), "motivos de exclusão agrupados");

// editar uma caixa (sobrescrever o número) e recalcular
// (o clique no SVG não é testável aqui: o jsdom não faz layout, então
//  getBoundingClientRect devolve zeros — uso o seletor de caixas do painel)
const selCaixa = [...vis().querySelectorAll("select")].find((s) => [...s.options].some((o) => /incluídos na revisão/i.test(o.textContent)));
ok(!!selCaixa, "painel lista as caixas do diagrama");
if (selCaixa) {
  const opt = [...selCaixa.options].find((o) => /incluídos na revisão/i.test(o.textContent));
  setSel(selCaixa, opt.value);
  await wait(500);
  const campoN = [...vis().querySelectorAll("input")].find((i) => /^calculado: /.test(i.placeholder || ""));
  if (campoN) {
    setInp(campoN, "9");
    await wait(600);
    const t2 = [...vis().querySelectorAll("svg text")].map((x) => x.textContent);
    ok(t2.some((x) => /incluídos na revisão \(n\s*=\s*9\)/.test(x)), "número sobrescrito à mão aparece no diagrama");
    const rec = pb(/Recalcular esta caixa/);
    if (rec) { await click(rec, 600); const t3 = [...vis().querySelectorAll("svg text")].map((x) => x.textContent); ok(t3.some((x) => /incluídos na revisão \(n\s*=\s*4\)/.test(x)), "recalcular devolve o valor da tabela"); }
  } else ok(false, "campo de número não encontrado");
}

// modo narrativa esconde protocolo e encurta o fluxo
await click(nav("Narrativa"), 700);
ok(!nav("Protocolo"), "modo narrativa esconde a aba Protocolo");
const caixasN = vis().querySelectorAll("svg rect").length;
console.log("  caixas no modo narrativa:", caixasN);
ok(caixasN < caixas, "fluxo narrativo é mais curto que o PRISMA");
await click(nav("Sistemática"), 700);
ok(!!nav("Protocolo"), "modo sistemática traz o Protocolo de volta");

// duplicatas: desmarcar as duas e deixar o app reencontrá-las
await click(nav("Referências"), 600);
const selects = [...vis().querySelectorAll("tbody select")];
const dups = selects.filter((s) => s.value === "duplicado");
dups.forEach((s) => setSel(s, "identificado"));
await wait(600);
console.log("  após desmarcar:", (ptxt().match(/duplicados: (\d+)/) || [])[0]);
await click(pb(/Marcar duplicatas/), 800);
const dep = ptxt();
console.log("  " + (dep.match(/\d+ duplicata\(s\) marcada\(s\)/) || ["(sem aviso)"])[0]);
ok(/duplicados: 2/.test(dep), "detecção de duplicatas reencontrou as 2 (título + ano)");

// importação de um .bib
const bib = `@article{silva2021,
  author = {Silva, Maria and Souza, Jo{\\~a}o},
  title = {Modelagem e {STEM} na escola},
  journal = {Revista de Ensino},
  year = {2021},
  doi = {10.1234/abc}
}
@phdthesis{lima2019,
  author = {Lima, Ana},
  title = {Uma tese sobre modelagem},
  school = {UNIOESTE},
  year = {2019}
}`;
const inputs = [...vis().querySelectorAll('input[type="file"]')];
const fInput = inputs[0];
const file = new W.File([bib], "scopus.bib", { type: "text/plain" });
Object.defineProperty(fInput, "files", { value: [file], configurable: true });
fInput.dispatchEvent(new W.Event("change", { bubbles: true }));
await wait(1200);
const t4 = ptxt();
// o conteúdo da tabela mora em <input value=…>, que não entra no textContent
const valores = [...vis().querySelectorAll("tbody input")].map((i) => i.value).join(" | ");
console.log("  " + (t4.match(/\d+ referência\(s\) importada\(s\)[^·]*(· \d+ duplicata\(s\) marcada\(s\))?/) || ["(sem aviso)"])[0]);
ok(/identificados: 16/.test(t4), "BibTeX importado: 14 + 2 = 16 registros");
ok(/Modelagem e STEM na escola/.test(valores), "título do .bib lido (chaves internas removidas)");
ok(/Silva, Maria; Souza, João/.test(valores), "autores do .bib: 'and' virou ';' e o acento LaTeX virou letra");
ok(/scopus/.test(valores), "base recebeu o nome do arquivo importado");

// salvar tudo leva a revisão
let cap = null;
W.URL.createObjectURL = (b) => { cap = b; return "blob:teste"; };
W.URL.revokeObjectURL = () => {};
W.HTMLAnchorElement.prototype.click = function () {};
await click([...root.querySelectorAll("button")].find((b) => /^Arquivo/.test(b.textContent.trim())), 300);
await click([...root.querySelectorAll("button")].find((b) => /^Salvar Enlace/.test(b.textContent.trim())), 900);
if (cap) {
  const o = JSON.parse(await cap.text());
  console.log("SALVAR ENLACE -> chaves:", Object.keys(o).join(", "));
  ok(!!o.revisao && o.revisao.refs.length === 16, `o .json leva a revisão (${o.revisao ? o.revisao.refs.length : 0} referências)`);
} else ok(false, "nada gerado ao salvar");

const eb = doc.getElementById("errbox");
if (W.getComputedStyle(eb).display !== "none" && eb.textContent.trim()) console.log("\n!! ERRO EM TELA:", eb.textContent.slice(0, 400));
const f = errors.filter((s) => !/opaque origins/.test(s));
console.log("\n=== erros ===\n" + (f.length ? f.slice(0, 6).join("\n") : "(nenhum)"));
W.close();
