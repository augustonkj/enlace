// Rede de códigos ligada às citações.
import { readFileSync } from "node:fs";
const m = await import("jsdom");
const { JSDOM, VirtualConsole } = m.default ?? m;
const errors = []; const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e.message || e)));
vc.on("error", (...a) => errors.push("err: " + a.join(" ").slice(0, 160)));
const dom = new JSDOM(readFileSync(new URL("../Enlace.html", import.meta.url), "utf8"), {
  runScripts: "dangerously", pretendToBeVisual: true, url: "https://l.test/x.html", virtualConsole: vc,
  beforeParse(w) { w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; w.scrollTo = () => {}; },
});
const W = dom.window, doc = W.document;
const wait = (t = 400) => new Promise((r) => setTimeout(r, t));
await wait(2800);
const root = doc.getElementById("rootapp");
const nav = (t) => [...root.querySelectorAll("button")].find((x) => x.textContent.trim() === t);
const click = async (el, t) => { el.dispatchEvent(new W.MouseEvent("click", { bubbles: true })); await wait(t); };
const vis = () => [...root.querySelectorAll("div")].find((d) => d.style.display === "block" && d.style.height === "100%");
const pb = (re) => [...vis().querySelectorAll("button")].find((x) => re.test(x.textContent.trim()));
const ptxt = () => vis().textContent.replace(/\s+/g, " ").trim();
const ok = (c, msg) => { console.log((c ? "  ok  " : "  FALHA ") + msg); if (!c) process.exitCode = 1; };

await click(nav("Pular"), 400);
await click(nav("Texto"), 800);
await click(pb(/^Exemplo$/), 1200);
ok(!!nav("Rede"), "aba Rede existe");
await click(nav("Rede"), 900);

if (!vis()) { console.log("APP CAIU. erros:"); console.log(errors.slice(0,3).join(String.fromCharCode(10))); process.exit(1); }
const svg = vis().querySelector("svg");
const circulos = svg ? svg.querySelectorAll("circle").length : 0;
const linhas = svg ? svg.querySelectorAll("line").length : 0;
const t = ptxt();
const cab = t.match(/(\d+) códigos · (\d+) ligações · (\d+) recortes/);
console.log("  " + (cab ? cab[0] : "(sem cabeçalho)"));
console.log("  desenho:", circulos, "círculos,", linhas, "linhas");
ok(!!cab && +cab[1] === 6, "6 códigos viraram nós");
ok(!!cab && +cab[3] === 8, "os 8 recortes do exemplo entraram");
// no exemplo, só o recorte e8 tem dois códigos (c6+c1) -> 1 ligação
ok(!!cab && +cab[2] === 1, "1 co-ocorrência detectada (recorte com dois códigos)");
ok(circulos >= 6 && linhas === 1, "nós e ligação desenhados");

// as ligações mais fortes aparecem e são clicáveis
ok(/Ligações mais fortes/.test(t), "painel lista as ligações mais fortes");
const linkTxt = [...vis().querySelectorAll("div")].find((d) => /^1×/.test(d.textContent.trim()) && d.children.length <= 2);
ok(!!linkTxt, "ligação clicável na lista");
if (linkTxt) {
  await click(linkTxt, 700);
  const t2 = ptxt();
  console.log("  seleção:", (t2.match(/Co-ocorrência[^0-9]*([^“]*)/) || ["", ""])[0].slice(0, 70));
  ok(/Co-ocorrência/.test(t2), "painel mostra a co-ocorrência");
  ok(/1 citação/.test(t2), "traz a citação que sustenta a ligação");
  ok(/Eram tarefas demais/.test(t2), "a citação certa (recorte com Sobrecarga + Dificuldade técnica)");
  ok(/Exemplo: entrevista/.test(t2), "citação identifica o documento de origem");
}

// filtro de co-ocorrência mínima
const campoMin = [...vis().querySelectorAll('input[type="number"]')][0];
if (campoMin) {
  Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, "value").set.call(campoMin, "2");
  campoMin.dispatchEvent(new W.Event("input", { bubbles: true }));
  await wait(700);
  const cab2 = ptxt().match(/(\d+) códigos · (\d+) ligações/);
  console.log("  com mínimo 2:", cab2 ? cab2[0] : "?");
  ok(cab2 && +cab2[2] === 0, "filtro de co-ocorrência mínima funciona");
}

const f = errors.filter((s) => !/opaque origins/.test(s));
console.log("\n=== erros ===\n" + (f.length ? f.slice(0, 4).join("\n") : "(nenhum)"));
W.close();
