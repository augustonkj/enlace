// Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y funcionam em todas as janelas; dentro de um
// campo de texto o atalho fica com o navegador (desfaz a digitação).
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
const click = async (el, t) => { el.dispatchEvent(new W.MouseEvent("click", { bubbles: true })); await wait(t); };
const vis = () => [...root.querySelectorAll("div")].find((d) => d.style.display === "block" && d.style.height === "100%");
const ok = (c, msg) => { console.log((c ? "  ok  " : "  FALHA ") + msg); if (!c) process.exitCode = 1; };
const tecla = async (key, { shift = false, meta = false } = {}) => {
  W.dispatchEvent(new W.KeyboardEvent("keydown", { key, ctrlKey: !meta, metaKey: meta, shiftKey: shift, bubbles: true, cancelable: true }));
  await wait(400);
};
const digitar = async (inp, v) => {
  Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, "value").set.call(inp, v);
  inp.dispatchEvent(new W.Event("input", { bubbles: true }));
  await wait(800); // > tempo de agrupamento: cada digitação vira um passo
};
const tirarFoco = () => { doc.activeElement && doc.activeElement.blur && doc.activeElement.blur(); };

await click(nav("Pular"), 400);

// --- Análise textual: nome do projeto ---
await click(nav("Texto"), 900);
const nomeProj = () => [...vis().querySelectorAll("input")].find((i) => i.style.width === "130px");
const original = nomeProj().value;
await digitar(nomeProj(), "Projeto renomeado");
nomeProj().focus();
await tecla("z");
ok(nomeProj().value === "Projeto renomeado", "Texto: com o foco no campo, Ctrl+Z fica com o navegador");
tirarFoco();
await tecla("z");
ok(nomeProj().value === original, "Texto: Ctrl+Z desfaz");
await tecla("z", { shift: true });
ok(nomeProj().value === "Projeto renomeado", "Texto: Ctrl+Shift+Z refaz");
await tecla("z", { meta: true });
ok(nomeProj().value === original, "Texto: ⌘Z (Mac) desfaz");
await tecla("y");
ok(nomeProj().value === "Projeto renomeado", "Texto: Ctrl+Y refaz");

// --- Revisão ---
await click(nav("Revisão"), 900);
const linhas = () => { const m = vis().textContent.match(/(\d+) de (\d+)/); return m ? +m[2] : 0; };
const antes = linhas();
await click([...vis().querySelectorAll("button")].find((b) => b.textContent.trim() === "+ Referência"), 800);
ok(linhas() === antes + 1, "Revisão: referência adicionada");
tirarFoco(); await tecla("z");
ok(linhas() === antes, "Revisão: Ctrl+Z desfaz");
await tecla("z", { shift: true });
ok(linhas() === antes + 1, "Revisão: Ctrl+Shift+Z refaz");

// --- Quantitativa: célula da grade ---
await click(nav("Análise Quantitativa"), 1200);
const celula = () => vis().querySelector("td input");
const v0 = celula().value;
await digitar(celula(), "42");
tirarFoco(); await tecla("z");
ok(celula().value === v0, "Quantitativa: Ctrl+Z desfaz a edição da grade");
await tecla("y");
ok(celula().value === "42", "Quantitativa: Ctrl+Y refaz");

// --- a janela escondida não reage ---
await click(nav("Análise Qualitativa"), 400);
await click(nav("Texto"), 600);
await tecla("z");
await click(nav("Análise Quantitativa"), 800);
ok(celula().value === "42", "Ctrl+Z numa janela não mexe nas outras");

const f = errors.filter((s) => !/opaque origins/.test(s));
console.log("\n=== erros ===\n" + (f.length ? f.slice(0, 4).join("\n") : "(nenhum)"));
W.close();
