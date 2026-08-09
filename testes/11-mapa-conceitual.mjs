// Mapa conceitual: formas, cores, fontes, tamanho, seleção múltipla e alinhamento.
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
const btnTitulo = (re) => [...vis().querySelectorAll("button")].find((x) => re.test(x.getAttribute("title") || ""));
const svg = () => vis().querySelector("svg");
// grupo de nó = tem forma e NÃO tem linha (grupo de ligação tem line, e rect do rótulo)
const nosG = () => [...svg().querySelectorAll("g")].filter((g) => g.querySelector("rect, ellipse, polygon") && !g.querySelector("line"));
const ok = (c, msg) => { console.log((c ? "  ok  " : "  FALHA ") + msg); if (!c) process.exitCode = 1; };
const ptDown = (el, extra = {}) => el.dispatchEvent(new W.MouseEvent("pointerdown", { bubbles: true, ...extra }));

await click(nav("Pular"), 400);
await click(nav("Mapa conceitual"), 900);
await click(pb(/^Projeto/), 300);
await click(pb(/Carregar exemplo/), 900);

// o exemplo já traz formas diferentes
const formas = { rect: svg().querySelectorAll("rect").length, ellipse: svg().querySelectorAll("ellipse").length, polygon: svg().querySelectorAll("polygon").length };
console.log("  formas no desenho:", JSON.stringify(formas));
ok(formas.ellipse >= 1, "elipse desenhada");
ok(formas.polygon >= 1, "losango/hexágono desenhados (polygon)");

// selecionar um nó abre o painel com todos os controles novos
const g1 = nosG()[0];
ptDown(g1);
await wait(500);
const t = vis().textContent.replace(/\s+/g, " ");
ok(/Forma/.test(t) && /Preenchimento/.test(t) && /Borda/.test(t) && /Cor do texto/.test(t), "painel traz forma e as três cores");
ok(/Fonte/.test(t) && /Tamanho/.test(t), "painel traz fonte e tamanho");

// trocar a forma para elipse
const antesEl = svg().querySelectorAll("ellipse").length;
const btnElipse = btnTitulo(/^elipse$/);
ok(!!btnElipse, "botão de forma elipse existe");
if (btnElipse) { await click(btnElipse, 600); ok(svg().querySelectorAll("ellipse").length === antesEl + 1, "trocar a forma vira elipse no desenho"); }

// negrito e corpo da fonte
const btnN = btnTitulo(/^negrito$/);
if (btnN) {
  const antes = [...svg().querySelectorAll("text")].map((x) => x.getAttribute("font-weight")).join(",");
  await click(btnN, 500);
  const depois = [...svg().querySelectorAll("text")].map((x) => x.getAttribute("font-weight")).join(",");
  ok(antes !== depois, "negrito alterna o peso do texto no desenho");
  await click(btnN, 500); // volta ao estado do exemplo
  ok([...svg().querySelectorAll("text")].map((x) => x.getAttribute("font-weight")).join(",") === antes, "alternar de novo volta ao anterior");
}
const campoCorpo = [...vis().querySelectorAll("input")].find((i) => (i.getAttribute("title") || "") === "corpo da fonte");
if (campoCorpo) {
  Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, "value").set.call(campoCorpo, "26");
  campoCorpo.dispatchEvent(new W.Event("input", { bubbles: true }));
  await wait(600);
  const tamanhos = [...svg().querySelectorAll("text")].map((x) => +x.getAttribute("font-size"));
  ok(tamanhos.includes(26), "corpo da fonte muda o texto no desenho");
}

// seleção múltipla com shift
ptDown(nosG()[1], { shiftKey: true });
await wait(400);
ptDown(nosG()[2], { shiftKey: true });
await wait(500);
const t2 = vis().textContent.replace(/\s+/g, " ");
console.log("  " + (t2.match(/\d+ nós selecionados/) || ["(sem contagem)"])[0]);
ok(/3 nós selecionados/.test(t2), "shift+clique acumula seleção");
ok(/vale para todos/.test(t2), "avisa que a edição vale para todos");

// alinhar precisa mover de verdade
const yAntes = [...svg().querySelectorAll("ellipse, rect, polygon")].length;
const btnAlinhar = btnTitulo(/alinhar ao topo/);
ok(!!btnAlinhar, "botão de alinhar ao topo ativo com vários selecionados");
if (btnAlinhar) {
  const posAntes = nosG().map((g) => g.querySelector("text").getAttribute("y"));
  await click(btnAlinhar, 700);
  const posDepois = nosG().map((g) => g.querySelector("text").getAttribute("y"));
  ok(JSON.stringify(posAntes) !== JSON.stringify(posDepois), "alinhar moveu os nós");
}

// ligação: tracejado e pontas
const linhas = [...svg().querySelectorAll("g")].filter((g) => g.querySelector("line"));
if (linhas.length) {
  ptDown(linhas[0]);
  await wait(500);
  const t3 = vis().textContent.replace(/\s+/g, " ");
  ok(/Ligação selecionada/.test(t3) && /Espessura/.test(t3) && /tracejada/.test(t3), "painel da ligação traz espessura e tracejado");
}

const f = errors.filter((s) => !/opaque origins/.test(s));
console.log("\n=== erros ===\n" + (f.length ? f.slice(0, 4).join("\n") : "(nenhum)"));
W.close();
