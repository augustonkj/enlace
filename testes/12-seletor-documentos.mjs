// Seletor de documentos da Codificação: uma linha que abre uma coluna, não um botão por documento.
import { readFileSync } from "node:fs";
const m = await import("jsdom");
const { JSDOM, VirtualConsole } = m.default ?? m;
const errors = []; const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e.message || e)));
vc.on("error", (...a) => errors.push("err: " + a.join(" ").slice(0, 140)));
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
// os exemplos saíram do app: os dados de teste vêm de testes/fixtures, pelo botão Abrir
const abrirFixture = async (nome, ms) => {
  const inp = [...vis().querySelectorAll('input[type="file"]')].find((i) => (i.accept || "").includes("json"));
  const f = new W.File([readFileSync(new URL("./fixtures/" + nome, import.meta.url), "utf8")], nome, { type: "application/json" });
  Object.defineProperty(inp, "files", { value: [f], configurable: true });
  inp.dispatchEvent(new W.Event("change", { bubbles: true }));
  await wait(ms);
};
const setInp = (el, v) => { Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new W.Event("input", { bubbles: true })); };

await click(nav("Pular"), 400);
await click(nav("Texto"), 800);
await abrirFixture("texto-entrevista.json", 1300);

// 14 documentos a mais
await click(nav("Documentos"), 700);
const inpArq = [...vis().querySelectorAll('input[type="file"]')].find((i) => (i.accept || "").includes(".txt"));
const arqs = Array.from({ length: 14 }, (_, k) => new W.File([`Entrevista número ${k + 1}, sobre a escola.`], `Escola ${String(k + 1).padStart(2, "0")}.txt`, { type: "text/plain" }));
Object.defineProperty(inpArq, "files", { value: arqs, configurable: true });
inpArq.dispatchEvent(new W.Event("change", { bubbles: true }));
await wait(1200);
ok(vis().querySelectorAll("tbody tr").length === 15, "15 documentos no corpus");

await click(nav("Codificação"), 700);
const botoesDoc = () => [...vis().querySelectorAll("button")].filter((b) => /^Escola \d+/.test(b.textContent.trim()));
ok(botoesDoc().length === 0, "fechado: nenhum botão por documento na tela");
const seletor = [...vis().querySelectorAll("button")].find((b) => b.getAttribute("aria-expanded") === "false" && /☰/.test(b.textContent));
ok(!!seletor, "uma linha com o documento atual (☰)");
ok(/\d+ de 15/.test(ptxt()), "mostra a posição: N de 15");

await click(seletor, 400);
const coluna = vis().querySelector('[role="dialog"][aria-label="Documentos do projeto"]');
ok(!!coluna, "clicar abre a coluna de documentos");
ok(coluna && coluna.querySelectorAll("button").length >= 15, "a coluna lista os 15 documentos");

const filtro = coluna.querySelector("input");
setInp(filtro, "escola 07");
await wait(400);
const visiveis = [...coluna.querySelectorAll("button")].filter((b) => /Escola/.test(b.textContent));
ok(visiveis.length === 1, `filtro por nome deixa só um (${visiveis.length})`);
await click(visiveis[0], 600);
ok(!vis().querySelector('[role="dialog"][aria-label="Documentos do projeto"]'), "escolher fecha a coluna");
ok(/Entrevista número 7,/.test(ptxt()), "o documento escolhido abriu");

const prox = [...vis().querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "próximo documento");
await click(prox, 500);
ok(/Entrevista número 8,/.test(ptxt()), "› vai para o próximo documento");

if (errors.length) { console.log("  === erros ==="); errors.slice(0, 4).forEach((e) => console.log("  " + e)); }
process.exit();
