// Memos: criar, vincular a um código, e sair no .qde
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
await wait(3000);
const root = doc.getElementById("rootapp");
const nav = (t) => [...root.querySelectorAll("button")].find((x) => x.textContent.trim() === t);
const click = async (el, t) => { el.dispatchEvent(new W.MouseEvent("click", { bubbles: true })); await wait(t); };
const vis = () => [...root.querySelectorAll("div")].find((d) => d.style.display === "block" && d.style.height === "100%");
const pb = (re) => [...vis().querySelectorAll("button")].find((x) => re.test(x.textContent.trim()));
const ptxt = () => vis().textContent.replace(/\s+/g, " ").trim();
const ok = (c, msg) => { console.log((c ? "  ok  " : "  FALHA ") + msg); if (!c) process.exitCode = 1; };
const setV = (el, v, proto) => { Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new W.Event(proto === W.HTMLSelectElement.prototype ? "change" : "input", { bubbles: true })); };

let cap = null;
W.URL.createObjectURL = (b) => { cap = b; return "blob:t"; };
W.URL.revokeObjectURL = () => {};
W.HTMLAnchorElement.prototype.click = function () {};

await click(nav("Pular"), 400);
await click(nav("Texto"), 800);
await click(pb(/^Exemplo$/), 1200);
ok(!!nav("Memos"), "aba Memos existe");
await click(nav("Memos"), 700);
await click(pb(/\+ memo/), 700);
const titulo = [...vis().querySelectorAll("input")].find((i) => (i.placeholder || "").includes("título do memo"));
const corpo = [...vis().querySelectorAll("textarea")][0];
ok(!!titulo && !!corpo, "editor do memo abriu");
setV(titulo, "Por que separei 'sobrecarga' de 'dificuldade técnica'", W.HTMLInputElement.prototype); await wait(300);
setV(corpo, "Os dois apareciam juntos nas primeiras leituras, mas sobrecarga é sobre jornada e o outro é sobre infraestrutura.", W.HTMLTextAreaElement.prototype); await wait(400);
const selAlvo = [...vis().querySelectorAll("select")].find((x) => [...x.options].some((o) => /memo geral/.test(o.textContent)));
const opt = selAlvo && [...selAlvo.options].find((o) => /Sobrecarga/.test(o.textContent));
ok(!!opt, "códigos aparecem para vincular");
if (opt) { setV(selAlvo, opt.value, W.HTMLSelectElement.prototype); await wait(600); }
const t = ptxt();
ok(/Por que separei/.test(t), "memo salvo na lista");
ok(/código: Sobrecarga/.test(t), "memo vinculado ao código");

// o memo precisa sair no REFI-QDA
await click(nav("Texto"), 600);
await click(pb(/^\.qde$/), 900);
const xml = cap ? await cap.text() : "";
const notas = (xml.match(/<Note /g) || []).length;
console.log("  <Note> no .qde:", notas);
ok(/Por que separei/.test(xml), "memo exportado no .qde como Note");

const f = errors.filter((s) => !/opaque origins/.test(s));
console.log("\n=== erros ===\n" + (f.length ? f.slice(0, 4).join("\n") : "(nenhum)"));
W.close();
