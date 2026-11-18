// Diagrama Ator-Rede: caixas não se sobrepõem (ao criar e ao organizar) e
// a seção "Mostrar no diagrama" tira do desenho o que a pessoa desmarca.
// O jsdom não faz layout: as posições vêm do .json salvo; o tamanho das caixas
// é estimado (as de "Novo actante" têm ~110×34). A aparência fina pede navegador.
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
const click = async (el, ms = 300) => { el.dispatchEvent(new W.MouseEvent("click", { bubbles: true })); await wait(ms); };
const vis = () => [...root.querySelectorAll("div")].find((d) => d.style.display === "block" && d.style.height === "100%");
const pb = (re) => [...vis().querySelectorAll("button")].find((x) => re.test(x.textContent.trim()));
const anyBtn = (re) => [...root.querySelectorAll("button")].find((x) => re.test(x.textContent.trim()));
const svg = () => vis().querySelector("svg").innerHTML;
const ok = (c, m) => console.log((c ? "  ok  " : "  FALHA ") + m);
const chk = (re) => [...vis().querySelectorAll("label")].find((l) => re.test(l.textContent.trim()))?.querySelector("input");
const toggle = async (input) => { input.dispatchEvent(new W.MouseEvent("click", { bubbles: true })); await wait(300); };

let capturado = null;
W.URL.createObjectURL = (b) => { capturado = b; return "blob:teste"; };
W.URL.revokeObjectURL = () => {};
W.HTMLAnchorElement.prototype.click = function () {};
const salvo = async () => { capturado = null; await click(pb(/^Projeto/)); await click(anyBtn(/^Salvar projeto/), 500); return JSON.parse(await capturado.text()); };
const sobrepostos = (ns) => { let k = 0; for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) if (Math.abs(ns[i].x - ns[j].x) < 110 && Math.abs(ns[i].y - ns[j].y) < 34) k++; return k; };

await click(nav("Pular"));
await click(nav("Ator-Rede"), 600);
await click(nav("Diagrama"), 700);

// criar 16 actantes pelos botões de tipo (antes, a partir da 4ª linha caíam todos no mesmo lugar)
const tipos = [/^\+ Mediador/, /^\+ Intermediário/];
for (let i = 0; i < 16; i++) await click(pb(tipos[i % 2]), 120);
let o = await salvo();
ok(o.nodes.length === 16, "16 actantes criados");
ok(sobrepostos(o.nodes) === 0, `caixas novas não se sobrepõem (${sobrepostos(o.nodes)} par(es))`);

// organizar: nada sobreposto e nada embaixo da legenda (aqui ela tem 1 linha: 50 px + 10 de folga)
for (const [nome, re] of [["orgânica", /^Orgânica/], ["círculo", /^Rede ○/], ["cascata vertical", /^Cascata vertical/]]) {
  await click(pb(/^Organizar/)); await click(anyBtn(re), 500);
  o = await salvo();
  const fundo = Math.max(...o.nodes.map((n) => n.y));
  ok(sobrepostos(o.nodes) === 0 && fundo + 17 < o.H - 50 - 10, `organizar (${nome}): sem sobreposição e acima da legenda (${o.W}×${o.H})`);
}

// mostrar no diagrama
ok(/>Legenda</.test(svg()), "a legenda aparece por padrão");
await toggle(chk(/^Legenda$/));
ok(!/>Legenda</.test(svg()), "desmarcar Legenda tira a legenda do desenho");
const antes = (svg().match(/Novo actante/g) || []).length;
await toggle(chk(/^Intermediário$/));
const depois = (svg().match(/Novo actante/g) || []).length;
ok(antes === 16 && depois === 8, `desmarcar um tipo tira os actantes dele do desenho (${antes} → ${depois})`);
ok(/8 actante\(s\) fora do desenho/.test(vis().textContent), "o painel avisa quantos actantes estão fora do desenho");
o = await salvo();
ok(o.nodes.length === 16 && o.ocultarTipos.includes("intermediario") && o.showLegend === false, "os dados continuam no projeto e a escolha é salva");
await toggle(chk(/^Intermediário$/));
ok((svg().match(/Novo actante/g) || []).length === 16, "marcar de novo traz os actantes de volta");
