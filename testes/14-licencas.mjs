// Sobre › Licenças e referências: licença do Enlace, bibliotecas embutidas
// (com o texto da licença, que MIT/ISC/BSD exigem) e referências.
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
const btn = (re) => [...root.querySelectorAll("button")].find((x) => re.test(x.textContent.trim()));
const click = async (el, t = 400) => { el.dispatchEvent(new W.MouseEvent("click", { bubbles: true })); await wait(t); };
const ok = (c, msg) => { console.log((c ? "  ok  " : "  FALHA ") + msg); if (!c) process.exitCode = 1; };

const L = W.ENLACE_LICENCAS || [];
ok(L.length >= 20, `o build embutiu a lista de bibliotecas (${L.length})`);
for (const p of ["react", "react-dom", "recharts", "mammoth", "lodash", "d3-scale", "jszip"])
  ok(L.some((x) => x.nome === p && x.licenca && x.texto.length > 200), `${p}: licença e texto presentes`);

await click(btn(/^Pular$/));
await click(btn(/^Sobre$/));
const dlg = () => doc.querySelector('[role="dialog"][aria-label="Sobre o Enlace"]');
ok(!!dlg(), "o Sobre abre");
await click([...dlg().querySelectorAll("button")].find((b) => b.textContent.trim() === "Licenças e referências"));
const t = dlg().textContent;
ok(/CC BY-NC 4\.0/.test(t), "mostra a licença do Enlace");
ok(/pdf\.js/.test(t) && /Apache-2\.0/.test(t), "lista o pdf.js, carregado sob demanda");
ok(/PRISMA 2020/.test(t) && /REFI-QDA/.test(t) && /LATOUR/.test(t) && /SIEGEL/.test(t) && /MOREIRA/.test(t), "lista as referências");
const ver = [...dlg().querySelectorAll("button")].find((b) => b.textContent.trim() === "ver licença");
await click(ver);
ok(/Permission is hereby granted|Redistribution and use|Permission to use, copy/.test(dlg().querySelector("pre")?.textContent || ""), "'ver licença' mostra o texto");

const f = errors.filter((s) => !/opaque origins/.test(s));
console.log("\n=== erros ===\n" + (f.length ? f.slice(0, 4).join("\n") : "(nenhum)"));
W.close();
