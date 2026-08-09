// Cota do navegador estourando: o app precisa avisar, não dizer "salvo".
import { readFileSync } from "node:fs";
const m = await import("jsdom");
const { JSDOM, VirtualConsole } = m.default ?? m;
const errors = []; const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e.message || e)));
vc.on("error", (...a) => errors.push("err: " + a.join(" ").slice(0, 120)));
let recusar = false;
const dom = new JSDOM(readFileSync(new URL("../Enlace.html", import.meta.url), "utf8"), {
  runScripts: "dangerously", pretendToBeVisual: true, url: "https://l.test/x.html", virtualConsole: vc,
  beforeParse(w) {
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; w.scrollTo = () => {};
    const real = w.Storage.prototype.setItem;
    w.Storage.prototype.setItem = function (k, v) {
      if (recusar) { const e = new Error("quota"); e.name = "QuotaExceededError"; e.code = 22; throw e; }
      return real.call(this, k, v);
    };
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
const ptxt = () => vis().textContent.replace(/\s+/g, " ").trim();
const ok = (c, msg) => { console.log((c ? "  ok  " : "  FALHA ") + msg); if (!c) process.exitCode = 1; };

if (!nav("Pular")) { console.log("APP NAO SUBIU. erros:"); console.log(errors.slice(0,3).join(String.fromCharCode(10))); console.log("root:", root.textContent.slice(0,120)); process.exit(1); }
await click(nav("Pular"), 400);
await click(nav("Texto"), 900);
await click(pb(/^Exemplo$/), 1500);
ok(/✓ salvo/.test(ptxt()), "com memória disponível, mostra '✓ salvo'");

// a partir daqui o navegador recusa toda gravação
recusar = true;
const nome = [...vis().querySelectorAll("input")].find((i) => i.value && /Exemplo/.test(i.value));
if (nome) {
  Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, "value").set.call(nome, "Exemplo editado");
  nome.dispatchEvent(new W.Event("input", { bubbles: true }));
}
await wait(2600);
const t = ptxt();
ok(!/✓ salvo/.test(t), "NÃO diz mais '✓ salvo' quando a gravação falha");
ok(/⚠ não salvo/.test(t), "indicador mostra '⚠ não salvo'");
ok(/o trabalho NÃO foi salvo no navegador/.test(t), "faixa de alerta aparece");
ok(/A memória do navegador encheu/.test(t), "explica que a cota estourou");
ok(/Salvar arquivo agora/.test(t), "oferece a saída: salvar em arquivo");

// e a saída precisa funcionar de verdade
let cap = null;
W.URL.createObjectURL = (b) => { cap = b; return "blob:t"; };
W.URL.revokeObjectURL = () => {};
W.HTMLAnchorElement.prototype.click = function () {};
await click(pb(/Salvar arquivo agora/), 900);
const conteudo = cap ? await cap.text() : "";
ok(!!cap && conteudo.length > 500, `o botão gera o arquivo de fato (${conteudo.length} bytes)`);
ok(/"docs"/.test(conteudo) && /"excerpts"/.test(conteudo), "o arquivo salvo tem os documentos e os recortes");

// voltando a haver espaço, o app se recupera
recusar = false;
if (nome) {
  Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, "value").set.call(nome, "Exemplo recuperado");
  nome.dispatchEvent(new W.Event("input", { bubbles: true }));
}
await wait(2600);
const t2 = ptxt();
ok(/✓ salvo/.test(t2) && !/⚠ não salvo/.test(t2), "volta a '✓ salvo' quando a gravação funciona de novo");

const f = errors.filter((s) => !/opaque origins|storage/.test(s));
console.log("\n=== erros ===\n" + (f.length ? f.slice(0, 4).join("\n") : "(nenhum além do log esperado de storage)"));
W.close();
