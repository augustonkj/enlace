// Ator-Rede simplificado: tipo, natureza/simetria e fonte ficam sempre à vista;
// os demais conceitos (prova de força, centro de cálculo, momentos da tradução,
// programa/antiprograma, porta-voz, delegação, cadeia de referência) só com o
// botão "Avançado" — nem um projeto que já usa esses campos liga o modo sozinho.
import { readFileSync } from "node:fs";
const jsdomMod = await import("jsdom");
const { JSDOM, VirtualConsole } = jsdomMod.default ?? jsdomMod;
const vc = new VirtualConsole();
const dom = new JSDOM(readFileSync(new URL("../Enlace.html", import.meta.url), "utf8"), {
  runScripts: "dangerously", pretendToBeVisual: true,
  url: "https://local.test/Enlace.html", virtualConsole: vc,
  beforeParse(w) {
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.HTMLCanvasElement.prototype.getContext = () => ({ measureText: () => ({ width: 10 }), fillText() {}, save() {}, restore() {}, clearRect() {}, beginPath() {}, stroke() {} });
    w.SVGElement.prototype.getBBox = w.SVGElement.prototype.getBBox || (() => ({ x: 0, y: 0, width: 10, height: 10 }));
    w.scrollTo = () => {};
  },
});
const W = dom.window;
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
await wait(2500);
const root = W.document.getElementById("rootapp");
const nav = (t) => [...root.querySelectorAll("button")].find((x) => x.textContent.trim() === t);
const click = async (el, ms = 400) => { el.dispatchEvent(new W.MouseEvent("click", { bubbles: true })); await wait(ms); };
const vis = () => [...root.querySelectorAll("div")].find((d) => d.style.display === "block" && d.style.height === "100%");
const pb = (re) => [...vis().querySelectorAll("button")].find((x) => re.test(x.textContent.trim()));
const ptxt = () => vis().textContent.replace(/\s+/g, " ").trim();
const cabecalhos = () => [...vis().querySelectorAll("th")].map((t) => t.textContent.trim());
const ok = (c, m) => console.log((c ? "  ok  " : "  FALHA ") + m);

await click(nav("Pular"));
await click(nav("Ator-Rede"), 600);

// modo simples: o essencial está, o avançado não
ok(/Natureza/.test(ptxt()) && /Fontes/.test(ptxt()) && /Por tipo/.test(ptxt()), "Tabela simples mostra tipo, natureza e fontes");
ok(!/Momentos da tradução/.test(ptxt()) && !/Estabilização/.test(ptxt()) && !/Frentes e relações/.test(ptxt()), "momentos, estabilização e frentes ficam escondidos");
ok(!cabecalhos().includes("Momento") && cabecalhos().includes("Fonte"), "tabela de associações sem a coluna Momento, com Fonte");
ok(!/Importar planilha/.test(ptxt()), "importar CSV fica no avançado");

// liga o Avançado: tudo volta
await click(pb(/Avançado$/), 400);
ok(/Momentos da tradução/.test(ptxt()) && /Estabilização/.test(ptxt()) && /Importar planilha/.test(ptxt()), "Avançado mostra os demais conceitos");
ok(cabecalhos().includes("Momento") && cabecalhos().includes("Centro cálc."), "Avançado devolve as colunas Momento e Centro cálc.");
await click(pb(/Avançado$/), 400);
ok(!/Momentos da tradução/.test(ptxt()), "desligar o Avançado esconde de novo");

// projeto que usa um campo avançado abre no modo simples; os dados ficam guardados
const projeto = { nodes: [{ id: "a", label: "Secretaria", x: 100, y: 100, type: "mediador", nat: "humano", estab: "prova" }, { id: "b", label: "Plataforma", x: 300, y: 100, type: "mediador", nat: "nao" }], edges: [{ id: "e1", from: "a", to: "b", directed: true, style: "solida", moment: "interessamento" }], titles: { a: "", b: "" }, subs: { a: "", b: "" }, legend: {}, W: 900, H: 540 };
const inp = [...vis().querySelectorAll('input[type="file"]')].find((i) => (i.accept || "").includes("json"));
Object.defineProperty(inp, "files", { value: [new W.File([JSON.stringify(projeto)], "rede.json")], configurable: true });
inp.dispatchEvent(new W.Event("change", { bubbles: true }));
await wait(800);
ok(/Secretaria/.test([...vis().querySelectorAll("input")].map((i) => i.value).join(" ")), "o projeto abriu");
ok(!/Momentos da tradução/.test(ptxt()) && !cabecalhos().includes("Momento"), "projeto com momento e prova de força abre no modo simples");
await click(pb(/Avançado$/), 400);
const valores = [...vis().querySelectorAll("select")].map((x) => x.value);
ok(valores.includes("interessamento") && valores.includes("prova"), "ao clicar em Avançado, o momento e a prova de força do projeto estão lá");
