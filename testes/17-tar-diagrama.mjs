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
// cada item da legenda liga e desliga sozinho
const itemMed = chk(/^mediador \(produz diferença\)$/);
ok(!!itemMed && /mediador \(produz diferença\)/.test(svg()), "o item 'mediador' está na legenda e no painel");
await toggle(itemMed);
ok(!/mediador \(produz diferença\)/.test(svg()) && /intermediário \(transmite/.test(svg()), "desmarcar um item tira só ele da legenda");
await toggle(chk(/^mediador \(produz diferença\)$/));
ok(/mediador \(produz diferença\)/.test(svg()), "marcar de novo devolve o item");
await toggle(chk(/^Mostrar legenda$/));
ok(!/>Legenda</.test(svg()), "desmarcar Mostrar legenda tira a legenda do desenho");
const antes = (svg().match(/Novo actante/g) || []).length;
await toggle(chk(/^Intermediário$/));
const depois = (svg().match(/Novo actante/g) || []).length;
ok(antes === 16 && depois === 8, `desmarcar um tipo tira os actantes dele do desenho (${antes} → ${depois})`);
ok(/8 actante\(s\) fora do desenho/.test(vis().textContent), "o painel avisa quantos actantes estão fora do desenho");
o = await salvo();
ok(o.nodes.length === 16 && o.ocultarTipos.includes("intermediario") && o.showLegend === false, "os dados continuam no projeto e a escolha é salva");
await toggle(chk(/^Intermediário$/));
ok((svg().match(/Novo actante/g) || []).length === 16, "marcar de novo traz os actantes de volta");

// esconder tudo / mostrar tudo
await click(pb(/^Esconder tudo$/), 400);
o = await salvo();
ok(o.showLegend === false && o.showNature === false && o.showSources === false && o.mostrar.titulo === false && !/>Legenda</.test(svg()), "Esconder tudo deixa só caixas e linhas");
ok((svg().match(/Novo actante/g) || []).length === 16, "Esconder tudo não some com os actantes");
await click(pb(/^Mostrar tudo$/), 400);
o = await salvo();
ok(o.showLegend === true && !Object.keys(o.mostrar).length && !o.legendaOculta.length && /\>Legenda</.test(svg()), "Mostrar tudo devolve tudo");

// Tabela e Diagrama são a mesma rede: editar numa aparece na outra na hora
await click(nav("Tabela"), 500);
const celula = [...vis().querySelectorAll("td input")].find((i) => i.value === "Novo actante");
const setter = Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, "value").set;
celula.dispatchEvent(new W.FocusEvent("focus", { bubbles: true }));
setter.call(celula, "Escola renomeada");
celula.dispatchEvent(new W.Event("input", { bubbles: true }));
await wait(300);
await click(pb(/^\+ Actante$/), 300);
await click(nav("Diagrama"), 600);
ok(/Escola renomeada/.test(svg()), "renomear na Tabela aparece no Diagrama ao voltar");
ok((svg().match(/Novo actante/g) || []).length === 16, "actante criado na Tabela aparece no Diagrama");
await click(pb(/^\+ Mediador/), 300);
await click(nav("Tabela"), 500);
ok([...vis().querySelectorAll("td input")].filter((i) => i.value === "Novo actante").length === 17, "actante criado no Diagrama aparece na Tabela");

// "Os dois": diagrama e tabela na mesma tela; editar a tabela redesenha na hora
await click(nav("Os dois"), 600);
ok(!!vis().querySelector("svg") && vis().querySelectorAll("td input").length > 0, "Os dois mostra diagrama e tabela juntos");
const cel2 = [...vis().querySelectorAll("td input")].find((i) => i.value === "Novo actante");
cel2.dispatchEvent(new W.FocusEvent("focus", { bubbles: true }));
setter.call(cel2, "Ao vivo");
cel2.dispatchEvent(new W.Event("input", { bubbles: true }));
await wait(400);
ok(/Ao vivo/.test(svg()), "em Os dois, editar a tabela atualiza o diagrama sem trocar de vista");
