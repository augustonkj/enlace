// Testa a Revisão de literatura: tabela, contagens, diagrama, notas em caixas e importação.
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
// os exemplos saíram do app: os dados de teste vêm de testes/fixtures, pelo botão Abrir
const abrirFixture = async (nome, ms) => {
  const inp = [...vis().querySelectorAll('input[type="file"]')].find((i) => (i.accept || "").includes("json"));
  const f = new W.File([readFileSync(new URL("./fixtures/" + nome, import.meta.url), "utf8")], nome, { type: "application/json" });
  Object.defineProperty(inp, "files", { value: [f], configurable: true });
  inp.dispatchEvent(new W.Event("change", { bubbles: true }));
  await wait(ms);
};
const setSel = (el, v) => { Object.getOwnPropertyDescriptor(W.HTMLSelectElement.prototype, "value").set.call(el, v); el.dispatchEvent(new W.Event("change", { bubbles: true })); };
const setInp = (el, v) => { Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new W.Event("input", { bubbles: true })); };
const setTxt = (el, v) => { Object.getOwnPropertyDescriptor(W.HTMLTextAreaElement.prototype, "value").set.call(el, v); el.dispatchEvent(new W.Event("input", { bubbles: true })); };

await click(nav("Pular"));
ok(!!nav("Revisão"), "sub-aba Revisão existe");
await click(nav("Revisão"), 700);
console.log("REVISÃO ->", ptxt().slice(0, 110));

// exemplo
await abrirFixture("revisao-modelagem.json", 900);
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

// um fluxo só: sem alternador de modo, Protocolo sempre à mão
ok(!nav("Narrativa") && !nav("Sistemática"), "sem alternador Narrativa/Sistemática");
ok(!!nav("Protocolo"), "aba Protocolo sempre disponível");
ok(!/sistem[aá]tica/i.test(ptxt()), "o termo 'sistemática' não aparece na janela");

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

// notas / extração de dados: quantas caixas a pessoa quiser
const caixasNota = () => [...vis().querySelectorAll("textarea")].filter((x) => x.placeholder === "anotações");
await click(vis().querySelector("tbody tr"), 500);
ok(caixasNota().length === 1, "referência selecionada começa com uma caixa de notas");
await click(pb(/^\+ Caixa$/), 400);
await click(pb(/^\+ Caixa$/), 400);
ok(caixasNota().length === 3, "+ Caixa acrescenta caixas (3 agora)");
setTxt(caixasNota()[1], "amostra: 32 estudantes do 9º ano");
await wait(400);
ok(caixasNota()[1].value === "amostra: 32 estudantes do 9º ano", "cada caixa guarda o próprio texto");
const remover = [...vis().querySelectorAll("button")].filter((b) => b.title === "remover esta caixa");
await click(remover[2], 400);
ok(caixasNota().length === 2 && caixasNota()[1].value === "amostra: 32 estudantes do 9º ano", "remover tira só a caixa escolhida");

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
  ok(o.revisao.refs[0].notas.length === 2 && o.revisao.refs[0].notas[1].texto === "amostra: 32 estudantes do 9º ano", "as caixas de notas vão junto no .json");
} else ok(false, "nada gerado ao salvar");

// arquivo salvo no formato antigo: notas num texto só e modo narrativa
const antigo = { modo: "narrativa", protocolo: { pergunta: "pergunta antiga" }, over: {},
  refs: [{ id: "r1", autores: "Souza, A.", ano: "2020", titulo: "Estudo antigo", veiculo: "", base: "", tipo: "artigo", doi: "", link: "", resumo: "", notas: "anotação antiga", tags: "", etapa: "incluido", motivo: "" }] };
const jInput = [...vis().querySelectorAll('input[type="file"]')][1];
Object.defineProperty(jInput, "files", { value: [new W.File([JSON.stringify(antigo)], "revisao.json", { type: "application/json" })], configurable: true });
jInput.dispatchEvent(new W.Event("change", { bubbles: true }));
await wait(1000);
ok(/identificados: 1(?!\d)/.test(ptxt()) && /avaliados: 1(?!\d)/.test(ptxt()) && !!nav("Protocolo"), "arquivo antigo abre com o fluxo completo");
await click(vis().querySelector("tbody tr"), 500);
ok(caixasNota().length === 1 && caixasNota()[0].value === "anotação antiga", "a nota antiga virou a primeira caixa");

const eb = doc.getElementById("errbox");
if (W.getComputedStyle(eb).display !== "none" && eb.textContent.trim()) console.log("\n!! ERRO EM TELA:", eb.textContent.slice(0, 400));
const f = errors.filter((s) => !/opaque origins/.test(s));
console.log("\n=== erros ===\n" + (f.length ? f.slice(0, 6).join("\n") : "(nenhum)"));
W.close();
