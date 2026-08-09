// Dados gravados quando o programa se chamava QualMap precisam ser adotados,
// e a chave antiga precisa desaparecer depois da primeira abertura.
import { readFileSync } from "node:fs";
const m = await import("jsdom");
const { JSDOM, VirtualConsole } = m.default ?? m;
const errors = []; const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e.message || e)));
vc.on("error", (...a) => errors.push("err: " + a.join(" ").slice(0, 140)));

const html = readFileSync(new URL("../Enlace.html", import.meta.url), "utf8");
const antigos = {
  qualmap_tour_done: "1",
  qualmap_geral_v2: JSON.stringify({ nodes: [{ id: "n1", text: "Conceito de antes", x: 300, y: 200, color: "#cfe0e8" }], edges: [] }),
  qualmap_quant_v2: JSON.stringify({ grid: { headers: ["idade", "nota"], rows: [["12", "7"], ["13", "8"]] } }),
};
const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true, url: "https://l.test/x.html", virtualConsole: vc,
  beforeParse(w) {
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; w.scrollTo = () => {};
    for (const [k, v] of Object.entries(antigos)) w.localStorage.setItem(k, v); // estado de quem já usava
  },
});
const W = dom.window, doc = W.document;
const wait = (t = 400) => new Promise((r) => setTimeout(r, t));
await wait(3000);
const root = doc.getElementById("rootapp");
const nav = (t) => [...root.querySelectorAll("button")].find((x) => x.textContent.trim() === t);
const click = async (el, t) => { el.dispatchEvent(new W.MouseEvent("click", { bubbles: true })); await wait(t); };
const vis = () => [...root.querySelectorAll("div")].find((d) => d.style.display === "block" && d.style.height === "100%");
const ptxt = () => vis().textContent.replace(/\s+/g, " ").trim();
const ok = (c, msg) => { console.log((c ? "  ok  " : "  FALHA ") + msg); if (!c) process.exitCode = 1; };
const ls = (k) => W.localStorage.getItem(k);

// tutorial: quem já viu não vê de novo
ok(!/Tutorial do Enlace/.test(root.textContent), "quem já viu o tutorial no nome antigo não vê de novo");
ok(ls("enlace_tour_done") === "1", "a marca do tutorial foi adotada com o nome novo");
ok(ls("qualmap_tour_done") === null, "a chave antiga do tutorial sumiu");

// mapa conceitual salvo antes precisa aparecer
await click(nav("Mapa conceitual"), 1200);
const svgTxt = [...vis().querySelectorAll("svg text")].map((t) => t.textContent).join(" ");
ok(/Conceito de antes/.test(svgTxt), "o mapa conceitual salvo no nome antigo foi carregado");
ok(ls("qualmap_geral_v2") === null, "a chave antiga do mapa sumiu");
ok(!!ls("enlace_geral_v2") && /Conceito de antes/.test(ls("enlace_geral_v2")), "o conteúdo está agora sob o nome novo");

// grade da quantitativa idem
await click(nav("Análise Quantitativa"), 1200);
const valores = [...vis().querySelectorAll("input")].map((i) => i.value);
ok(valores.includes("idade") && valores.includes("nota"), "a grade salva no nome antigo foi carregada");
ok(ls("qualmap_quant_v2") === null, "a chave antiga da grade sumiu");
ok(!!ls("enlace_quant_v2") && /idade/.test(ls("enlace_quant_v2")), "a grade está sob o nome novo");

// nenhuma chave com o nome antigo pode sobrar
const sobraram = Object.keys(W.localStorage).filter((k) => /qualmap/i.test(k));
console.log("  chaves antigas restantes:", sobraram.length ? sobraram.join(", ") : "(nenhuma)");
ok(sobraram.length === 0, "nenhuma chave 'qualmap' sobrou no navegador");

const f = errors.filter((s) => !/opaque origins/.test(s));
console.log("\n=== erros ===\n" + (f.length ? f.slice(0, 4).join("\n") : "(nenhum)"));
W.close();
