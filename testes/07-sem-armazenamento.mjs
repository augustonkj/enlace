// Nada do trabalho pode ser gravado no navegador; em troca, a página
// pergunta antes de fechar quando há alterações não salvas em arquivo.
import { readFileSync } from "node:fs";
const m = await import("jsdom");
const { JSDOM, VirtualConsole } = m.default ?? m;
const errors = []; const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e.message || e)));
vc.on("error", (...a) => errors.push("err: " + a.join(" ").slice(0, 120)));
const dom = new JSDOM(readFileSync(new URL("../Enlace.html", import.meta.url), "utf8"), {
  runScripts: "dangerously", pretendToBeVisual: true, url: "https://l.test/x.html", virtualConsole: vc,
  beforeParse(w) {
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; w.scrollTo = () => {};
    // dados que versões antigas deixaram no navegador não podem reaparecer
    w.localStorage.setItem("enlace_geral_v2", JSON.stringify({ nodes: [{ id: "n1", text: "Conceito velho", x: 300, y: 200 }], edges: [] }));
  },
});
const W = dom.window, doc = W.document;
const wait = (t = 400) => new Promise((r) => setTimeout(r, t));
await wait(2800);
const root = doc.getElementById("rootapp");
const nav = (t) => [...root.querySelectorAll("button")].find((x) => x.textContent.trim() === t);
const click = async (el, t) => { el.dispatchEvent(new W.MouseEvent("click", { bubbles: true })); await wait(t); };
const vis = () => [...root.querySelectorAll("div")].find((d) => d.style.display === "block" && d.style.height === "100%");
const ok = (c, msg) => { console.log((c ? "  ok  " : "  FALHA ") + msg); if (!c) process.exitCode = 1; };
const perguntaAoFechar = () => { const e = new W.Event("beforeunload", { cancelable: true }); W.dispatchEvent(e); return e.defaultPrevented; };
const chavesTrabalho = () => Object.keys(W.localStorage).filter((k) => k !== "enlace_tour_done" && k !== "tar_tour_done" && k !== "enlace_geral_v2");

if (!nav("Pular")) { console.log("APP NAO SUBIU. erros:"); console.log(errors.slice(0, 3).join("\n")); process.exit(1); }
await click(nav("Pular"), 400);
ok(!perguntaAoFechar(), "app recém-aberto, sem edição: fecha sem perguntar");

await click(nav("Mapa conceitual"), 1000);
const svgTxt = [...vis().querySelectorAll("svg text")].map((t) => t.textContent).join(" ");
ok(!/Conceito velho/.test(svgTxt), "o que versões antigas gravaram no navegador não é carregado");

// edição na Análise textual (abrir um arquivo de fixture e renomear)
await click(nav("Análise Qualitativa"), 400);
await click(nav("Texto"), 900);
const inp = [...vis().querySelectorAll('input[type="file"]')].find((i) => (i.accept || "").includes("json"));
const f = new W.File([readFileSync(new URL("./fixtures/texto-entrevista.json", import.meta.url), "utf8")], "t.json", { type: "application/json" });
Object.defineProperty(inp, "files", { value: [f], configurable: true });
inp.dispatchEvent(new W.Event("change", { bubbles: true }));
await wait(1500);
const nome = [...vis().querySelectorAll("input")].find((i) => i.value && /Entrevista/.test(i.value));
Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, "value").set.call(nome, "Entrevista editada");
nome.dispatchEvent(new W.Event("input", { bubbles: true }));
await wait(1500);
ok(perguntaAoFechar(), "com alterações não salvas, o navegador pergunta antes de fechar");
ok(chavesTrabalho().length === 0, "nada do trabalho foi gravado no navegador (" + (chavesTrabalho().join(", ") || "nenhuma chave") + ")");
ok(!/✓ salvo|salvando…/.test(vis().textContent), "não anuncia mais '✓ salvo' (não há salvamento automático)");

// Arquivo › Salvar Enlace… zera o aviso
let cap = null;
W.URL.createObjectURL = (b) => { cap = b; return "blob:t"; };
W.URL.revokeObjectURL = () => {};
W.HTMLAnchorElement.prototype.click = function () {};
await click([...root.querySelectorAll("button")].find((b) => /^Arquivo/.test(b.textContent.trim())), 300);
await click([...root.querySelectorAll("button")].find((b) => /^Salvar Enlace/.test(b.textContent.trim())), 900);
const conteudo = cap ? await cap.text() : "";
ok(/Entrevista editada/.test(conteudo), "o arquivo salvo tem a edição");
ok(!perguntaAoFechar(), "depois de Salvar Enlace, fecha sem perguntar");

// nova edição volta a pedir confirmação
Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, "value").set.call(nome, "Entrevista de novo");
nome.dispatchEvent(new W.Event("input", { bubbles: true }));
await wait(1000);
ok(perguntaAoFechar(), "nova edição depois de salvar: volta a perguntar");

const fe = errors.filter((s) => !/opaque origins/.test(s));
console.log("\n=== erros ===\n" + (fe.length ? fe.slice(0, 4).join("\n") : "(nenhum)"));
W.close();
