// REFI-QDA (ida e volta) + leitura de PDF com páginas.
import { readFileSync } from "node:fs";
const jsdomMod = await import("jsdom");
const { JSDOM, VirtualConsole } = jsdomMod.default ?? jsdomMod;
const html = readFileSync(new URL("../Enlace.html", import.meta.url), "utf8");
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e.message || e)));
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ").slice(0, 200)));
const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true,
  url: "https://local.test/Enlace.html", virtualConsole: vc,
  beforeParse(w) {
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.HTMLCanvasElement.prototype.getContext = () => ({ measureText: () => ({ width: 10 }), fillText() {}, save() {}, restore() {}, clearRect() {}, beginPath() {}, stroke() {} });
    w.scrollTo = () => {};
    // APIs que todo navegador tem e o jsdom não: sem elas o pdf.js nem carrega
    w.DOMMatrix = class DOMMatrix { constructor(i) { this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0; if (Array.isArray(i)) [this.a, this.b, this.c, this.d, this.e, this.f] = i; } };
    w.Path2D = class Path2D {};
    w.ImageData = class ImageData { constructor(d, x, y) { this.data = d; this.width = x; this.height = y; } };
    w.structuredClone = w.structuredClone || ((o) => JSON.parse(JSON.stringify(o)));
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
const ok = (c, m) => { console.log((c ? "  ok  " : "  FALHA ") + m); if (!c) process.exitCode = 1; };

let cap = null;
W.URL.createObjectURL = (b) => { cap = b; return "blob:t"; };
W.URL.revokeObjectURL = () => {};
W.HTMLAnchorElement.prototype.click = function () {};

await click(nav("Pular"));
await click(nav("Texto"), 800);
await click(pb(/^Exemplo$/), 1200);

// --- exportar .qde
await click(pb(/^\.qde$/), 900);
ok(!!cap, "botão .qde gerou arquivo");
const xml = cap ? await cap.text() : "";
console.log("  tamanho do .qde:", xml.length, "bytes");
ok(/urn:QDA-XML:project:1\.0/.test(xml), "namespace REFI-QDA correto");
ok((xml.match(/<Code /g) || []).length === 6, `6 códigos exportados (${(xml.match(/<Code /g) || []).length})`);
ok((xml.match(/<PlainTextSelection /g) || []).length === 8, `8 recortes exportados (${(xml.match(/<PlainTextSelection /g) || []).length})`);
ok(/<TextSource /.test(xml) && /<PlainTextContent>/.test(xml), "documento e conteúdo presentes");
ok(/startPosition="\d+" endPosition="\d+"/.test(xml), "posições de início e fim gravadas");
// XML precisa ser válido
const parsed = new W.DOMParser().parseFromString(xml, "text/xml");
ok(!parsed.querySelector("parsererror"), "XML válido (sem erro de parser)");

// --- reimportar o mesmo .qde
const inputAbrir = [...vis().querySelectorAll('input[type="file"]')].find((i) => (i.accept || "").includes(".qde"));
ok(!!inputAbrir, "campo Abrir aceita .qde");
if (inputAbrir) {
  const f = new W.File([xml], "reimportado.qde", { type: "application/xml" });
  Object.defineProperty(inputAbrir, "files", { value: [f], configurable: true });
  inputAbrir.dispatchEvent(new W.Event("change", { bubbles: true }));
  await wait(1500);
  await click(nav("Documentos"), 700);
  const t = ptxt();
  const linhas = vis().querySelectorAll("tbody tr").length;
  console.log("  após reimportar:", linhas, "documento(s) |", t.slice(0, 120));
  ok(linhas === 1, "1 documento reimportado");
  ok(/\b8\b/.test(t), "os 8 recortes voltaram com o documento");
  await click(nav("Consultas"), 700);
  const t2 = ptxt();
  console.log("  " + (t2.match(/\d+ recorte\(s\) em \d+ documento\(s\)/) || [""])[0]);
  ok(/8 recorte\(s\)/.test(t2), "recortes reimportados são recuperáveis");
  const caixas = [...vis().querySelectorAll('input[type="checkbox"]')];
  ok(caixas.length === 6, `6 códigos reimportados (${caixas.length})`);
}

// (a seção de PDF saiu junto com o pdf.js — ver README_build.md)

const eb = doc.getElementById("errbox");
if (W.getComputedStyle(eb).display !== "none" && eb.textContent.trim()) console.log("\n!! ERRO EM TELA:", eb.textContent.slice(0, 400));
const f2 = errors.filter((s) => !/opaque origins/.test(s));
console.log("\n=== erros ===\n" + (f2.length ? f2.slice(0, 5).join("\n") : "(nenhum)"));
W.close();
