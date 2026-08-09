// Busca no texto bruto de todos os documentos.
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
const setInp = (el, v) => { Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new W.Event("input", { bubbles: true })); };

await click(nav("Pular"), 400);
await click(nav("Texto"), 800);
await click(pb(/^Exemplo$/), 1300);

// acrescenta um segundo documento com uma palavra acentuada
await click(nav("Documentos"), 700);
const inpArq = [...vis().querySelectorAll('input[type="file"]')].find((i) => (i.accept || "").includes(".txt"));
const f = new W.File(["A professora falou sobre a ROTINA da escola e sobre rotinas de estudo em casa."], "prof.txt", { type: "text/plain" });
Object.defineProperty(inpArq, "files", { value: [f], configurable: true });
inpArq.dispatchEvent(new W.Event("change", { bubbles: true }));
await wait(1000);
ok(vis().querySelectorAll("tbody tr").length === 2, "dois documentos no corpus");

await click(nav("Consultas"), 800);
const alvo = pb(/^no texto$/);
ok(!!alvo, "existe o alternador 'no texto'");
await click(alvo, 500);
const campo = [...vis().querySelectorAll("input")].find((i) => /palavra no texto/.test(i.placeholder || ""));
ok(!!campo, "campo de busca no corpus aparece");
setInp(campo, "rotina");
await wait(800);
const t = ptxt();
const cont = t.match(/(\d+) ocorrência\(s\) de “rotina” em (\d+) documento\(s\)/);
console.log("  " + (cont ? cont[0] : "(sem contagem)"));
ok(!!cont, "conta as ocorrências no corpus");
ok(cont && +cont[2] === 2, "achou nos DOIS documentos, não só no aberto");
// "ROTINA" maiúscula e "rotinas" no plural precisam entrar
ok(cont && +cont[1] >= 3, `pegou maiúscula e plural (${cont && cont[1]} ocorrências)`);
ok(/fora de qualquer recorte/.test(t), "separa o que ainda não foi codificado");
ok(/não codificado/.test(t), "marca cada ocorrência não codificada");
ok(/abrir e codificar/.test(t), "oferece abrir o documento para codificar");

// acento: procurar sem acento tem de achar com acento
setInp(campo, "ansios");
await wait(700);
setInp(campo, "experiencia");
await wait(700);
const t2 = ptxt();
const c2 = t2.match(/(\d+) ocorrência\(s\) de “experiencia”/);
console.log("  sem acento:", c2 ? c2[0] : "(nada)");
ok(!!c2 && +c2[1] >= 1, "busca sem acento encontra 'Experiência'");

// voltar para 'nos recortes' não pode deixar resíduo
await click(pb(/^nos recortes$/), 600);
ok(!/ocorrência\(s\) de/.test(ptxt()), "ao voltar, a busca no corpus some");

const fe = errors.filter((s) => !/opaque origins/.test(s));
console.log("\n=== erros ===\n" + (fe.length ? fe.slice(0, 4).join("\n") : "(nenhum)"));
W.close();
