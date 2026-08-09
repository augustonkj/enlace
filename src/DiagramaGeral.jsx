import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { wrapText, esc, SUITE, Menu, MenuItem, salvarLocal, AvisoArmazenamento, migrarChaveAntiga } from "./lib.js";

/*
  Mapa conceitual — nós e ligações rotuladas, sem as regras da Teoria Ator-Rede.

  Cada nó guarda forma, cores (preenchimento, borda e texto), fonte (família,
  corpo, negrito, itálico) e, se o usuário quiser, largura e altura fixas; senão
  o tamanho sai do texto. Cada ligação guarda cor, espessura, traço e pontas.

  A figura é montada UMA vez: `formaDoNo` devolve a geometria e os mesmos dados
  alimentam o desenho na tela (JSX, interativo) e a exportação (string SVG).
  Sem isso, o que se vê e o que se exporta divergem na primeira mudança.

  Estado próprio; entra no "Salvar Enlace" pela ponte SUITE (getGeral/setGeral).
*/

const VBW = 1000, VBH = 620;
const PADX = 14, PADY = 9, WRAP = 18;

const CORES = ["#ffffff", "#cfe0e8", "#bfe0cc", "#f6d7a8", "#f3c0c0", "#d9cde8", "#cfd6dd",
  "#3a6ea5", "#2e7d4f", "#c98a2b", "#b3402f", "#7a5ea8", "#1abc9c", "#34495e"];
const FORMAS = [
  ["arred", "▢", "retângulo arredondado"],
  ["ret", "▭", "retângulo"],
  ["elipse", "◯", "elipse"],
  ["losango", "◇", "losango (decisão/condição)"],
  ["hex", "⬡", "hexágono (processo)"],
];
const FONTES = {
  sistema: { css: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", larg: 0.56, rotulo: "Sistema" },
  serifada: { css: "Georgia, 'Times New Roman', serif", larg: 0.52, rotulo: "Serifada" },
  mono: { css: "ui-monospace, 'Courier New', monospace", larg: 0.62, rotulo: "Monoespaçada" },
};
const PONTAS = [["fim", "→"], ["ambas", "↔"], ["nenhuma", "—"]];

const uid = () => "g" + Math.random().toString(36).slice(2, 8);
const NO_PADRAO = { shape: "arred", color: "#ffffff", stroke: "#34495e", textColor: "#2b3a48", font: "sistema", fontSize: 14, bold: false, italic: false, w: 0, h: 0 };
const LIG_PADRAO = { color: "#7a8b99", width: 1.6, dash: false, arrow: "fim", curva: "reta" };
const noCompleto = (n) => ({ ...NO_PADRAO, ...n });
const ligCompleta = (e) => ({ ...LIG_PADRAO, ...e });

function seedGeral() {
  return {
    nodes: [
      { id: "n1", text: "Conceito central", x: 500, y: 120, color: "#cfe0e8", shape: "arred", fontSize: 16, bold: true },
      { id: "n2", text: "Ideia A", x: 250, y: 320, color: "#ffffff" },
      { id: "n3", text: "Ideia B", x: 750, y: 320, color: "#ffffff" },
      { id: "n4", text: "É o caso?", x: 500, y: 330, color: "#f6d7a8", shape: "losango" },
      { id: "n5", text: "Detalhe", x: 750, y: 500, color: "#bfe0cc", shape: "elipse" },
    ],
    edges: [
      { id: "e1", from: "n1", to: "n2", text: "leva a" },
      { id: "e2", from: "n1", to: "n3", text: "relaciona" },
      { id: "e3", from: "n1", to: "n4", text: "" },
      { id: "e4", from: "n3", to: "n5", text: "inclui", dash: true, curva: "cotovelo" },
      { id: "e5", from: "n2", to: "n4", text: "compara", curva: "curva", arrow: "ambas" },
    ],
  };
}

/* ---------- geometria ---------- */
function nodeDims(no) {
  const n = noCompleto(no);
  const f = FONTES[n.font] || FONTES.sistema;
  const fs = n.fontSize || 14;
  const lh = fs * 1.32;
  const lines = wrapText(n.text || " ", WRAP);
  const maxLen = Math.max(1, ...lines.map((l) => l.length));
  let w = Math.max(74, Math.round(maxLen * fs * f.larg * (n.bold ? 1.06 : 1)) + PADX * 2);
  let h = lines.length * lh + PADY * 2;
  // formas sem cantos precisam de folga para o texto não vazar
  if (n.shape === "elipse") { w = Math.round(w * 1.18); h = Math.round(h * 1.3); }
  else if (n.shape === "losango") { w = Math.round(w * 1.42); h = Math.round(h * 1.5); }
  else if (n.shape === "hex") { w = Math.round(w * 1.16); }
  if (n.w > 0) w = n.w;
  if (n.h > 0) h = n.h;
  return { w, h, lines, lh, fs, fonte: f.css, n };
}
// geometria da forma: os mesmos números vão para a tela e para a exportação
function formaDoNo(no, d) {
  const n = noCompleto(no);
  const x = n.x - d.w / 2, y = n.y - d.h / 2, w = d.w, h = d.h;
  if (n.shape === "elipse") return { tag: "ellipse", attrs: { cx: n.x, cy: n.y, rx: w / 2, ry: h / 2 } };
  if (n.shape === "losango") return { tag: "polygon", attrs: { points: `${n.x},${y} ${x + w},${n.y} ${n.x},${y + h} ${x},${n.y}` } };
  if (n.shape === "hex") {
    const c = Math.min(20, w * 0.2);
    return { tag: "polygon", attrs: { points: `${x + c},${y} ${x + w - c},${y} ${x + w},${n.y} ${x + w - c},${y + h} ${x + c},${y + h} ${x},${n.y}` } };
  }
  return { tag: "rect", attrs: { x, y, width: w, height: h, rx: n.shape === "ret" ? 0 : 9 } };
}
// ponto onde a reta até (tx,ty) cruza a borda da caixa centrada em (cx,cy)
function edgePoint(cx, cy, hw, hh, tx, ty) {
  const dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}
/* Traçado da ligação: reta, curva ou cotovelo. Devolve o caminho (d), o ponto
   do rótulo e as direções das pontas — a seta precisa apontar na direção do
   ÚLTIMO trecho, não da reta entre os centros, senão fica torta na curva. */
function caminhoLigacao(e, a, b) {
  const sinal = (v) => (v < 0 ? -1 : 1);
  if (e.curva === "cotovelo") {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      const p1 = { x: a.x + sinal(dx) * (a.w / 2), y: a.y };
      const p2 = { x: b.x - sinal(dx) * (b.w / 2), y: b.y };
      const mx = (p1.x + p2.x) / 2;
      return { d: `M ${p1.x} ${p1.y} L ${mx} ${p1.y} L ${mx} ${p2.y} L ${p2.x} ${p2.y}`, p1, p2,
        mid: { x: mx, y: (p1.y + p2.y) / 2 }, antesFim: { x: mx, y: p2.y }, antesIni: { x: mx, y: p1.y } };
    }
    const p1 = { x: a.x, y: a.y + sinal(dy) * (a.h / 2) };
    const p2 = { x: b.x, y: b.y - sinal(dy) * (b.h / 2) };
    const my = (p1.y + p2.y) / 2;
    return { d: `M ${p1.x} ${p1.y} L ${p1.x} ${my} L ${p2.x} ${my} L ${p2.x} ${p2.y}`, p1, p2,
      mid: { x: (p1.x + p2.x) / 2, y: my }, antesFim: { x: p2.x, y: my }, antesIni: { x: p1.x, y: my } };
  }
  const p1 = edgePoint(a.x, a.y, a.w / 2, a.h / 2, b.x, b.y);
  const p2 = edgePoint(b.x, b.y, b.w / 2, b.h / 2, a.x, a.y);
  if (e.curva === "curva") {
    const dx = p2.x - p1.x, dy = p2.y - p1.y, L = Math.hypot(dx, dy) || 1;
    const k = Math.min(90, L * 0.22);
    const c = { x: (p1.x + p2.x) / 2 - (dy / L) * k, y: (p1.y + p2.y) / 2 + (dx / L) * k };
    return { d: `M ${p1.x} ${p1.y} Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${p2.x} ${p2.y}`, p1, p2,
      mid: { x: (p1.x + 2 * c.x + p2.x) / 4, y: (p1.y + 2 * c.y + p2.y) / 4 }, antesFim: c, antesIni: c };
  }
  return { d: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`, p1, p2,
    mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, antesFim: p1, antesIni: p2 };
}
function geometry(state) {
  const byId = {}; state.nodes.forEach((n) => (byId[n.id] = { ...noCompleto(n), ...nodeDims(n) }));
  const edges = state.edges.map((raw) => {
    const e = ligCompleta(raw);
    const a = byId[e.from], b = byId[e.to];
    if (!a || !b) return null;
    return { ...e, ...caminhoLigacao(e, a, b) };
  }).filter(Boolean);
  return { byId, edges };
}
function ponta(p1, p2, tam = 9) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;
  const bx = p2.x - ux * tam, by = p2.y - uy * tam, px = -uy, py = ux;
  return `${p2.x},${p2.y} ${bx + px * tam * 0.5},${by + py * tam * 0.5} ${bx - px * tam * 0.5},${by - py * tam * 0.5}`;
}

/* ---------- alinhar e distribuir (usa o tamanho real de cada forma) ---------- */
function alinhar(nodes, ids, como) {
  const alvo = nodes.filter((n) => ids.includes(n.id));
  if (alvo.length < 2) return nodes;
  const dim = alvo.map((n) => ({ n, d: nodeDims(n) }));
  const e = Math.min(...dim.map((x) => x.n.x - x.d.w / 2)), dir = Math.max(...dim.map((x) => x.n.x + x.d.w / 2));
  const topo = Math.min(...dim.map((x) => x.n.y - x.d.h / 2)), base = Math.max(...dim.map((x) => x.n.y + x.d.h / 2));
  const mx = Math.round(alvo.reduce((a, n) => a + n.x, 0) / alvo.length);
  const my = Math.round(alvo.reduce((a, n) => a + n.y, 0) / alvo.length);
  const set = {};
  for (const { n, d } of dim) {
    if (como === "esq") set[n.id] = { x: Math.round(e + d.w / 2) };
    else if (como === "dir") set[n.id] = { x: Math.round(dir - d.w / 2) };
    else if (como === "centroX") set[n.id] = { x: mx };
    else if (como === "topo") set[n.id] = { y: Math.round(topo + d.h / 2) };
    else if (como === "base") set[n.id] = { y: Math.round(base - d.h / 2) };
    else if (como === "centroY") set[n.id] = { y: my };
  }
  return nodes.map((n) => (set[n.id] ? { ...n, ...set[n.id] } : n));
}
// a ordem em nodes[] é a ordem de pintura: o último é o que fica por cima
function paraFrente(nodes, ids) {
  const fica = nodes.filter((n) => !ids.includes(n.id));
  return [...fica, ...nodes.filter((n) => ids.includes(n.id))];
}
function paraTras(nodes, ids) {
  const fica = nodes.filter((n) => !ids.includes(n.id));
  return [...nodes.filter((n) => ids.includes(n.id)), ...fica];
}
function distribuir(nodes, ids, eixo) {
  const alvo = nodes.filter((n) => ids.includes(n.id));
  if (alvo.length < 3) return nodes;
  const k = eixo === "h" ? "x" : "y";
  const ord = [...alvo].sort((a, b) => a[k] - b[k]);
  const ini = ord[0][k], fim = ord[ord.length - 1][k], passo = (fim - ini) / (ord.length - 1);
  const set = {};
  ord.forEach((n, i) => (set[n.id] = Math.round(ini + i * passo)));
  return nodes.map((n) => (set[n.id] != null ? { ...n, [k]: set[n.id] } : n));
}

/* ---------- SVG para exportação (mesma geometria da tela) ---------- */
function buildGeralSVG(state, { withBg = true, grade = 0 } = {}) {
  const { byId, edges } = geometry(state);
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VBW} ${VBH}" width="${VBW}" height="${VBH}">`];
  if (withBg) out.push(`<rect x="0" y="0" width="${VBW}" height="${VBH}" fill="#ffffff"/>`);
  if (grade > 0) {
    out.push(`<defs><pattern id="gr" width="${grade}" height="${grade}" patternUnits="userSpaceOnUse"><path d="M ${grade} 0 L 0 0 0 ${grade}" fill="none" stroke="#eef1f4" stroke-width="1"/></pattern></defs>`);
    out.push(`<rect x="0" y="0" width="${VBW}" height="${VBH}" fill="url(#gr)"/>`);
  }
  edges.forEach((e) => {
    const tr = e.dash ? ` stroke-dasharray="${Math.max(4, e.width * 3)} ${Math.max(3, e.width * 2)}"` : "";
    out.push(`<path d="${e.d}" fill="none" stroke="${e.color}" stroke-width="${e.width}"${tr}/>`);
    if (e.arrow === "fim" || e.arrow === "ambas") out.push(`<polygon points="${ponta(e.antesFim, e.p2)}" fill="${e.color}"/>`);
    if (e.arrow === "ambas") out.push(`<polygon points="${ponta(e.antesIni, e.p1)}" fill="${e.color}"/>`);
    if (e.text) {
      const tw = e.text.length * 6.4 + 8;
      out.push(`<rect x="${e.mid.x - tw / 2}" y="${e.mid.y - 9}" width="${tw}" height="16" rx="3" fill="#ffffff" opacity="0.9"/>`);
      out.push(`<text x="${e.mid.x}" y="${e.mid.y + 3}" font-size="11" fill="#5a6b7a" text-anchor="middle" font-family="${FONTES.sistema.css}">${esc(e.text)}</text>`);
    }
  });
  state.nodes.forEach((raw) => {
    const d = byId[raw.id], n = d.n;
    const f = formaDoNo(raw, d);
    const at = Object.entries(f.attrs).map(([k, v]) => `${k}="${typeof v === "number" ? Math.round(v * 10) / 10 : v}"`).join(" ");
    out.push(`<${f.tag} ${at} fill="${n.color}" stroke="${n.stroke}" stroke-width="1.4"/>`);
    const y0 = n.y - (d.lines.length * d.lh) / 2;
    d.lines.forEach((ln, i) => out.push(
      `<text x="${n.x}" y="${(y0 + d.lh * (i + 0.78)).toFixed(1)}" font-size="${d.fs}" fill="${n.textColor}" text-anchor="middle" font-family="${d.fonte}"${n.bold ? ' font-weight="700"' : ""}${n.italic ? ' font-style="italic"' : ""}>${esc(ln)}</text>`));
  });
  out.push("</svg>");
  return out.join("");
}

function dl(blob, name) { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500); }

function DiagramaGeral({ active = true }) {
  const [state, setStateRaw] = useState(() => ({ nodes: [], edges: [] }));
  const [past, setPast] = useState([]); const [future, setFuture] = useState([]);
  const [sels, setSels] = useState([]);        // ids dos nós selecionados
  const [selEdge, setSelEdge] = useState(null);
  const [erroLocal, setErroLocal] = useState(null);
  const [mode, setMode] = useState("select");  // "select" | "connect"
  const [connectFrom, setConnectFrom] = useState(null);
  const [grade, setGrade] = useState(0);       // 0 = sem grade; senão o passo
  const [laco, setLaco] = useState(null);      // retângulo de seleção sendo arrastado
  const lacoRef = useRef(null);
  const stateRef = useRef(state); useEffect(() => { stateRef.current = state; });
  const svgRef = useRef(null); const dragRef = useRef(null); const fileRef = useRef(null);

  const pushHist = useCallback(() => { setPast((p) => [...p.slice(-60), JSON.stringify(stateRef.current)]); setFuture([]); }, []);
  const mut = useCallback((u) => { pushHist(); setStateRaw(u); }, [pushHist]);
  const undo = useCallback(() => setPast((p) => { if (!p.length) return p; setFuture((f) => [JSON.stringify(stateRef.current), ...f].slice(0, 60)); setStateRaw(JSON.parse(p[p.length - 1])); return p.slice(0, -1); }), []);
  const redo = useCallback(() => setFuture((f) => { if (!f.length) return f; setPast((p) => [...p, JSON.stringify(stateRef.current)].slice(-60)); setStateRaw(JSON.parse(f[0])); return f.slice(1); }), []);

  useEffect(() => {
    SUITE.getGeral = () => stateRef.current;
    SUITE.setGeral = (data) => { if (data && Array.isArray(data.nodes)) { setStateRaw({ nodes: data.nodes, edges: data.edges || [] }); setSels([]); setSelEdge(null); } };
    return () => { SUITE.getGeral = null; SUITE.setGeral = null; };
  }, []);
  useEffect(() => {
    const t = setTimeout(() => { const r = salvarLocal("enlace_geral_v2", JSON.stringify(state)); setErroLocal(r.ok ? null : r); }, 600);
    return () => clearTimeout(t);
  }, [state]);
  useEffect(() => {
    migrarChaveAntiga("qualmap_geral_v2", "enlace_geral_v2");
    try { const s = window.localStorage.getItem("enlace_geral_v2"); if (s) { const o = JSON.parse(s); if (o && Array.isArray(o.nodes)) setStateRaw({ nodes: o.nodes, edges: o.edges || [] }); } } catch {}
  }, []);

  const geo = useMemo(() => geometry(state), [state]);

  const removeSel = useCallback(() => {
    if (sels.length) mut((s) => ({ nodes: s.nodes.filter((n) => !sels.includes(n.id)), edges: s.edges.filter((e) => !sels.includes(e.from) && !sels.includes(e.to)) }));
    else if (selEdge) mut((s) => ({ ...s, edges: s.edges.filter((e) => e.id !== selEdge) }));
    setSels([]); setSelEdge(null);
  }, [sels, selEdge, mut]);

  useEffect(() => {
    if (!active) return;
    const h = (e) => {
      const emCampo = e.target && /input|textarea|select/i.test(e.target.tagName || "");
      if (e.key === "Escape") { setMode("select"); setConnectFrom(null); }
      else if ((e.key === "Delete" || e.key === "Backspace") && (sels.length || selEdge)) { if (emCampo) return; e.preventDefault(); removeSel(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") { if (emCampo) return; e.preventDefault(); setSels(stateRef.current.nodes.map((n) => n.id)); setSelEdge(null); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [active, sels, selEdge, undo, redo, removeSel]);

  const toSvg = (clientX, clientY) => {
    const svg = svgRef.current; if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    if (!r.width) return { x: 0, y: 0 };
    return { x: ((clientX - r.left) / r.width) * VBW, y: ((clientY - r.top) / r.height) * VBH };
  };
  const encaixar = (v) => (grade > 0 ? Math.round(v / grade) * grade : Math.round(v));

  const addNode = (x = VBW / 2, y = VBH / 2) => {
    const id = uid();
    mut((s) => ({ ...s, nodes: [...s.nodes, { ...NO_PADRAO, id, text: "Novo conceito", x: encaixar(x), y: encaixar(y) }] }));
    setSels([id]); setSelEdge(null);
  };

  const onNodePointerDown = (e, id) => {
    e.stopPropagation();
    if (mode === "connect") {
      if (!connectFrom) setConnectFrom(id);
      else { if (connectFrom !== id) mut((s) => ({ ...s, edges: [...s.edges, { ...LIG_PADRAO, id: uid(), from: connectFrom, to: id, text: "" }] })); setConnectFrom(null); setMode("select"); }
      return;
    }
    const multi = e.shiftKey || e.ctrlKey || e.metaKey;
    setSels((atual) => (multi ? (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]) : atual.includes(id) ? atual : [id]));
    setSelEdge(null);
    const start = toSvg(e.clientX, e.clientY);
    const alvo = sels.includes(id) ? sels : [id];
    const base = {};
    stateRef.current.nodes.forEach((n) => { if (alvo.includes(n.id)) base[n.id] = { x: n.x, y: n.y }; });
    dragRef.current = { ids: alvo, base, ox: start.x, oy: start.y, moved: false };
    try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch {}
  };
  const onPointerMove = (e) => {
    const l = lacoRef.current;
    if (l) {
      const p = toSvg(e.clientX, e.clientY);
      l.x1 = p.x; l.y1 = p.y;
      setLaco({ ...l });
      // seleciona ao vivo tudo o que o retângulo toca
      const cx0 = Math.min(l.x0, l.x1), cx1 = Math.max(l.x0, l.x1);
      const cy0 = Math.min(l.y0, l.y1), cy1 = Math.max(l.y0, l.y1);
      const dentro = stateRef.current.nodes.filter((n) => {
        const d = nodeDims(n);
        return n.x + d.w / 2 >= cx0 && n.x - d.w / 2 <= cx1 && n.y + d.h / 2 >= cy0 && n.y - d.h / 2 <= cy1;
      }).map((n) => n.id);
      setSels(l.somar ? [...new Set([...l.antes, ...dentro])] : dentro);
      return;
    }
    const d = dragRef.current; if (!d) return;
    const p = toSvg(e.clientX, e.clientY);
    if (!d.moved) { pushHist(); d.moved = true; }
    const dx = p.x - d.ox, dy = p.y - d.oy;
    setStateRaw((s) => ({ ...s, nodes: s.nodes.map((n) => (d.base[n.id] ? { ...n, x: encaixar(d.base[n.id].x + dx), y: encaixar(d.base[n.id].y + dy) } : n)) }));
  };
  const onPointerUp = () => { dragRef.current = null; lacoRef.current = null; setLaco(null); };
  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove); window.addEventListener("pointerup", onPointerUp);
    return () => { window.removeEventListener("pointermove", onPointerMove); window.removeEventListener("pointerup", onPointerUp); };
  });

  const onBgPointerDown = (e) => {
    setSelEdge(null);
    if (mode === "connect") { setConnectFrom(null); setSels([]); return; }
    const p = toSvg(e.clientX, e.clientY);
    const somar = e.shiftKey || e.ctrlKey || e.metaKey;
    lacoRef.current = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, somar, antes: somar ? sels : [] };
    setLaco({ ...lacoRef.current });
    if (!somar) setSels([]);
  };
  const onBgDoubleClick = (e) => { if (mode === "connect") return; const p = toSvg(e.clientX, e.clientY); addNode(p.x, p.y); };

  // aplica um patch a TODOS os nós selecionados
  const setNos = (patch) => mut((s) => ({ ...s, nodes: s.nodes.map((n) => (sels.includes(n.id) ? { ...noCompleto(n), ...patch } : n)) }));
  const setLig = (patch) => mut((s) => ({ ...s, edges: s.edges.map((e) => (e.id === selEdge ? { ...ligCompleta(e), ...patch } : e)) }));
  const aplicarAlinhar = (como) => mut((s) => ({ ...s, nodes: alinhar(s.nodes, sels, como) }));
  const aplicarDistribuir = (eixo) => mut((s) => ({ ...s, nodes: distribuir(s.nodes, sels, eixo) }));
  const aplicarCamada = (onde) => mut((s) => ({ ...s, nodes: onde === "frente" ? paraFrente(s.nodes, sels) : paraTras(s.nodes, sels) }));

  const exportSVG = () => dl(new Blob([buildGeralSVG(state)], { type: "image/svg+xml" }), "mapa-conceitual.svg");
  const exportPNG = () => {
    const svg = buildGeralSVG(state); const img = new Image();
    img.onload = () => { const c = document.createElement("canvas"); c.width = VBW * 2; c.height = VBH * 2; const ctx = c.getContext("2d"); ctx.scale(2, 2); ctx.drawImage(img, 0, 0); c.toBlob((b) => b && dl(b, "mapa-conceitual.png")); };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  };
  const exportJSON = () => dl(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }), "mapa-conceitual.json");
  const importJSON = (ev) => { const f = ev.target.files && ev.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const o = JSON.parse(String(r.result)); if (o && Array.isArray(o.nodes)) mut(() => ({ nodes: o.nodes, edges: o.edges || [] })); } catch {} }; r.readAsText(f); ev.target.value = ""; };
  const exportPDF = () => {
    const w = window.open("", "_blank"); if (!w) { try { window.alert("Permita pop-ups para gerar o relatório em PDF."); } catch {} return; }
    const svg = buildGeralSVG(state).replace("<svg ", '<svg style="max-width:100%;height:auto" ');
    const byId = {}; state.nodes.forEach((n) => (byId[n.id] = n));
    const nodeList = state.nodes.length ? state.nodes.map((n) => `<li>${esc(n.text)}</li>`).join("") : "<li>—</li>";
    const edgeList = state.edges.length ? state.edges.map((e) => { const a = byId[e.from], b = byId[e.to]; if (!a || !b) return ""; return `<li>${esc(a.text)} ${e.text ? "— <i>" + esc(e.text) + "</i> →" : "→"} ${esc(b.text)}</li>`; }).join("") : "<li>—</li>";
    const doc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Mapa conceitual</title><style>@media print{.noprint{display:none!important}}@page{margin:14mm}body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#2b3a48;margin:0}</style></head><body onload="setTimeout(function(){window.print()},300)"><div class="noprint" style="position:sticky;top:0;display:flex;gap:10px;align-items:center;background:#1f7a8c;color:#fff;padding:10px 16px">Relatório pronto. <button onclick="window.print()" style="border:none;background:#fff;color:#1f7a8c;font-weight:700;border-radius:6px;padding:6px 14px;cursor:pointer">Imprimir / Salvar como PDF</button></div><div style="max-width:1000px;margin:0 auto;padding:24px"><h1 style="font-size:20px">Mapa conceitual</h1><p style="color:#888;font-size:13px">${state.nodes.length} nós · ${state.edges.length} ligações</p><div style="border:1px solid #e3e9ee;border-radius:8px;padding:8px">${svg}</div><h2 style="font-size:15px;border-bottom:1px solid #e3e9ee;padding-bottom:4px;margin-top:24px">Conceitos</h2><ul style="font-size:13px;line-height:1.6">${nodeList}</ul><h2 style="font-size:15px;border-bottom:1px solid #e3e9ee;padding-bottom:4px;margin-top:20px">Ligações</h2><ul style="font-size:13px;line-height:1.6">${edgeList}</ul></div></body></html>`;
    w.document.open(); w.document.write(doc); w.document.close();
  };

  const mini = { padding: "6px 10px", fontSize: 12.5, border: "1px solid #cfd6dd", borderRadius: 6, cursor: "pointer", background: "#fff", color: "#34495e", fontWeight: 600 };
  const prim = { ...mini, background: "#1f7a8c", color: "#fff", border: "none" };
  const icone = { ...mini, padding: "4px 8px", fontSize: 13, lineHeight: 1 };
  const divisor = { width: 1, height: 22, background: "#dde3e9" };
  const lbl = { fontSize: 12, color: "#5a6b7a", display: "block", margin: "10px 0 3px" };
  const inp = { width: "100%", boxSizing: "border-box", padding: "6px 8px", border: "1px solid #cfd6dd", borderRadius: 5, fontSize: 13, fontFamily: "inherit" };

  const selNodes = state.nodes.filter((n) => sels.includes(n.id));
  const ref = selNodes.length ? noCompleto(selNodes[0]) : null;   // o primeiro manda nos controles
  const selEdgeObj = selEdge ? ligCompleta(state.edges.find((e) => e.id === selEdge) || {}) : null;
  const Paleta = ({ valor, aoEscolher }) => (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      {CORES.map((c) => (
        <button key={c} onClick={() => aoEscolher(c)} title={c}
          style={{ width: 24, height: 20, borderRadius: 4, border: valor === c ? "2px solid #1f7a8c" : "1px solid #cfd6dd", background: c, cursor: "pointer" }} />
      ))}
      <input type="color" value={valor || "#ffffff"} onChange={(e) => aoEscolher(e.target.value)} title="cor personalizada"
        style={{ width: 26, height: 20, padding: 0, border: "1px solid #cfd6dd", borderRadius: 4, background: "none", cursor: "pointer" }} />
    </div>
  );

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#eef1f4", minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <AvisoArmazenamento erro={erroLocal} onSalvar={exportJSON} />
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", padding: "9px 12px", background: "#fff", borderBottom: "1px solid #dde3e9" }}>
        <strong style={{ fontSize: 15, marginRight: 4 }}>Mapa conceitual</strong>
        <span style={divisor} />
        <button style={mini} onClick={() => addNode()}>+ Nó</button>
        <button style={mode === "connect" ? prim : mini} onClick={() => { setMode(mode === "connect" ? "select" : "connect"); setConnectFrom(null); }} title="ligar dois nós: clique na origem e no destino">Ligar nós</button>
        <button style={mini} onClick={removeSel} disabled={!sels.length && !selEdge}>Excluir</button>
        <span style={divisor} />
        <button style={mini} onClick={undo} disabled={!past.length} title="desfazer (Ctrl+Z)">↶</button>
        <button style={mini} onClick={redo} disabled={!future.length} title="refazer (Ctrl+Shift+Z)">↷</button>
        <span style={divisor} />
        <span style={{ fontSize: 11.5, color: sels.length >= 2 ? "#46555f" : "#c3ccd4" }}>alinhar</span>
        {[["esq", "⇤", "à esquerda"], ["centroX", "↔", "centro na vertical"], ["dir", "⇥", "à direita"],
          ["topo", "⇧", "ao topo"], ["centroY", "↕", "centro na horizontal"], ["base", "⇩", "à base"]].map(([k, ic, t]) => (
          <button key={k} style={{ ...icone, color: sels.length >= 2 ? "#34495e" : "#c3ccd4" }} disabled={sels.length < 2}
            title={`alinhar ${t} (${sels.length} selecionado(s))`} onClick={() => aplicarAlinhar(k)}>{ic}</button>
        ))}
        <button style={{ ...icone, color: sels.length >= 3 ? "#34495e" : "#c3ccd4" }} disabled={sels.length < 3} title="distribuir na horizontal" onClick={() => aplicarDistribuir("h")}>⋯</button>
        <button style={{ ...icone, color: sels.length >= 3 ? "#34495e" : "#c3ccd4" }} disabled={sels.length < 3} title="distribuir na vertical" onClick={() => aplicarDistribuir("v")}>⋮</button>
        <span style={divisor} />
        <span style={{ fontSize: 11.5, color: sels.length ? "#46555f" : "#c3ccd4" }}>camada</span>
        <button style={{ ...icone, color: sels.length ? "#34495e" : "#c3ccd4" }} disabled={!sels.length} title="trazer para a frente" onClick={() => aplicarCamada("frente")}>⬆</button>
        <button style={{ ...icone, color: sels.length ? "#34495e" : "#c3ccd4" }} disabled={!sels.length} title="enviar para trás" onClick={() => aplicarCamada("tras")}>⬇</button>
        <span style={divisor} />
        <label style={{ fontSize: 12, color: "#5a6b7a", display: "flex", alignItems: "center", gap: 4 }} title="prende as posições a uma grade">
          grade
          <select style={{ ...inp, width: 72, padding: "3px 6px", fontSize: 12 }} value={grade} onChange={(e) => setGrade(+e.target.value)}>
            <option value={0}>livre</option><option value={10}>10 px</option><option value={20}>20 px</option><option value={40}>40 px</option>
          </select>
        </label>
        <span style={divisor} />
        <Menu label="Exportar" btnStyle={mini} title="exportar a figura">
          {(close) => (<>
            <MenuItem onClick={() => { exportPDF(); close(); }}>Relatório (PDF)</MenuItem>
            <MenuItem onClick={() => { exportSVG(); close(); }}>Figura SVG</MenuItem>
            <MenuItem onClick={() => { exportPNG(); close(); }}>Figura PNG</MenuItem>
          </>)}
        </Menu>
        <Menu label="Projeto" btnStyle={mini} title="salvar, abrir, exemplo e limpar">
          {(close) => (<>
            <MenuItem onClick={() => { exportJSON(); close(); }}>Salvar (.json)</MenuItem>
            <MenuItem onClick={() => { fileRef.current?.click(); close(); }}>Abrir (.json)</MenuItem>
            <MenuItem onClick={() => { mut(() => seedGeral()); setSels([]); close(); }}>Carregar exemplo</MenuItem>
            <MenuItem danger onClick={() => { mut(() => ({ nodes: [], edges: [] })); setSels([]); close(); }}>Limpar tudo</MenuItem>
          </>)}
        </Menu>
        <input ref={fileRef} type="file" accept="application/json" onChange={importJSON} style={{ display: "none" }} />
        {mode === "connect" && <span style={{ fontSize: 12, color: "#1f7a8c", fontWeight: 600 }}>{connectFrom ? "clique no nó de destino (Esc cancela)" : "clique no nó de origem (Esc cancela)"}</span>}
      </div>

      <div style={{ display: "flex", gap: 12, padding: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 560px", minWidth: 320, background: "#fff", border: "1px solid #dde3e9", borderRadius: 8, padding: 8 }}>
          <svg ref={svgRef} viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", height: "auto", display: "block", background: "#fbfcfd", borderRadius: 4, touchAction: "none", cursor: mode === "connect" ? "crosshair" : "default" }}
            onPointerDown={onBgPointerDown} onDoubleClick={onBgDoubleClick}>
            {grade > 0 && (<>
              <defs><pattern id="gradeMapa" width={grade} height={grade} patternUnits="userSpaceOnUse">
                <path d={`M ${grade} 0 L 0 0 0 ${grade}`} fill="none" stroke="#e6ebf0" strokeWidth="1" />
              </pattern></defs>
              <rect x="0" y="0" width={VBW} height={VBH} fill="url(#gradeMapa)" />
            </>)}
            {geo.edges.map((e) => {
              const on = selEdge === e.id;
              const cor = on ? "#1f7a8c" : e.color;
              return (
                <g key={e.id} onPointerDown={(ev) => { ev.stopPropagation(); setSelEdge(e.id); setSels([]); }} style={{ cursor: "pointer" }}>
                  <path d={e.d} fill="none" stroke={cor} strokeWidth={on ? e.width + 1 : e.width}
                    strokeDasharray={e.dash ? `${Math.max(4, e.width * 3)} ${Math.max(3, e.width * 2)}` : undefined} />
                  {(e.arrow === "fim" || e.arrow === "ambas") && <polygon points={ponta(e.antesFim, e.p2)} fill={cor} />}
                  {e.arrow === "ambas" && <polygon points={ponta(e.antesIni, e.p1)} fill={cor} />}
                  <path d={e.d} fill="none" stroke="transparent" strokeWidth={14} />
                  {e.text && (<>
                    <rect x={e.mid.x - (e.text.length * 6.4 + 8) / 2} y={e.mid.y - 9} width={e.text.length * 6.4 + 8} height={16} rx={3} fill="#ffffff" opacity={0.9} />
                    <text x={e.mid.x} y={e.mid.y + 3} fontSize={11} fill="#5a6b7a" textAnchor="middle" style={{ pointerEvents: "none" }}>{e.text}</text>
                  </>)}
                </g>
              );
            })}
            {state.nodes.map((raw) => {
              const d = geo.byId[raw.id], n = d.n;
              const on = sels.includes(raw.id), src = connectFrom === raw.id;
              const f = formaDoNo(raw, d);
              const Tag = f.tag;
              const y0 = n.y - (d.lines.length * d.lh) / 2;
              return (
                <g key={raw.id} onPointerDown={(ev) => onNodePointerDown(ev, raw.id)} style={{ cursor: mode === "connect" ? "crosshair" : "move" }}>
                  <Tag {...f.attrs} fill={n.color} stroke={on || src ? "#1f7a8c" : n.stroke} strokeWidth={on || src ? 2.6 : 1.4} />
                  {d.lines.map((ln, i) => (
                    <text key={i} x={n.x} y={y0 + d.lh * (i + 0.78)} fontSize={d.fs} fill={n.textColor} textAnchor="middle"
                      fontFamily={d.fonte} fontWeight={n.bold ? 700 : 400} fontStyle={n.italic ? "italic" : "normal"}
                      style={{ pointerEvents: "none", userSelect: "none" }}>{ln}</text>
                  ))}
                </g>
              );
            })}
            {laco && (
              <rect x={Math.min(laco.x0, laco.x1)} y={Math.min(laco.y0, laco.y1)}
                width={Math.abs(laco.x1 - laco.x0)} height={Math.abs(laco.y1 - laco.y0)}
                fill="#1f7a8c" fillOpacity={0.08} stroke="#1f7a8c" strokeWidth={1} strokeDasharray="4 3" style={{ pointerEvents: "none" }} />
            )}
          </svg>
          <div style={{ fontSize: 11, color: "#9aa7b2", marginTop: 6 }}>
            Duplo-clique no fundo cria um nó · arraste para mover · <b>Shift+clique</b> seleciona vários (e arrasta juntos) · <b>arraste no fundo</b> para laçar · Ctrl+A seleciona tudo · Delete remove
          </div>
        </div>

        <div style={{ flex: "0 1 300px", minWidth: 260, background: "#fff", border: "1px solid #dde3e9", borderRadius: 8, padding: 14 }}>
          {ref ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#5a6b7a" }}>
                {sels.length > 1 ? `${sels.length} nós selecionados` : "Nó selecionado"}
              </div>
              {sels.length > 1 && <div style={{ fontSize: 11.5, color: "#9aa7b2", marginTop: 2 }}>o que você mudar aqui vale para todos</div>}

              {sels.length === 1 && (<>
                <label style={lbl}>Texto</label>
                <textarea style={{ ...inp, minHeight: 56, resize: "vertical" }} value={selNodes[0].text || ""}
                  onChange={(e) => setNos({ text: e.target.value })} />
              </>)}

              <label style={lbl}>Forma</label>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {FORMAS.map(([k, ic, t]) => (
                  <button key={k} title={t} onClick={() => setNos({ shape: k })}
                    style={{ ...icone, fontSize: 15, padding: "3px 9px", background: ref.shape === k ? "#e8f2f4" : "#fff", borderColor: ref.shape === k ? "#1f7a8c" : "#cfd6dd" }}>{ic}</button>
                ))}
              </div>

              <label style={lbl}>Preenchimento</label>
              <Paleta valor={ref.color} aoEscolher={(c) => setNos({ color: c })} />
              <label style={lbl}>Borda</label>
              <Paleta valor={ref.stroke} aoEscolher={(c) => setNos({ stroke: c })} />
              <label style={lbl}>Cor do texto</label>
              <Paleta valor={ref.textColor} aoEscolher={(c) => setNos({ textColor: c })} />

              <label style={lbl}>Fonte</label>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <select style={{ ...inp, width: "auto", flex: 1 }} value={ref.font} onChange={(e) => setNos({ font: e.target.value })}>
                  {Object.entries(FONTES).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
                </select>
                <input type="number" min="9" max="40" step="1" value={ref.fontSize} title="corpo da fonte"
                  onChange={(e) => setNos({ fontSize: Math.max(9, Math.min(40, +e.target.value || 14)) })}
                  style={{ ...inp, width: 60 }} />
                <button onClick={() => setNos({ bold: !ref.bold })} title="negrito"
                  style={{ ...icone, fontWeight: 800, background: ref.bold ? "#e8f2f4" : "#fff", borderColor: ref.bold ? "#1f7a8c" : "#cfd6dd" }}>N</button>
                <button onClick={() => setNos({ italic: !ref.italic })} title="itálico"
                  style={{ ...icone, fontStyle: "italic", background: ref.italic ? "#e8f2f4" : "#fff", borderColor: ref.italic ? "#1f7a8c" : "#cfd6dd" }}>I</button>
              </div>

              <label style={lbl}>Tamanho <span style={{ color: "#9aa7b2" }}>(0 = automático pelo texto)</span></label>
              <div style={{ display: "flex", gap: 6 }}>
                <input type="number" min="0" max="400" value={ref.w} title="largura" onChange={(e) => setNos({ w: Math.max(0, +e.target.value || 0) })} style={{ ...inp, width: "50%" }} />
                <input type="number" min="0" max="300" value={ref.h} title="altura" onChange={(e) => setNos({ h: Math.max(0, +e.target.value || 0) })} style={{ ...inp, width: "50%" }} />
              </div>

              <button style={{ ...mini, marginTop: 12 }} onClick={removeSel}>Excluir {sels.length > 1 ? `os ${sels.length} nós` : "o nó"}</button>
            </div>
          ) : selEdgeObj ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#5a6b7a" }}>Ligação selecionada</div>
              <label style={lbl}>Rótulo</label>
              <input style={inp} value={selEdgeObj.text || ""} onChange={(e) => setLig({ text: e.target.value })} placeholder="ex.: leva a, causa, inclui…" />
              <label style={lbl}>Cor</label>
              <Paleta valor={selEdgeObj.color} aoEscolher={(c) => setLig({ color: c })} />
              <label style={lbl}>Traçado</label>
              <div style={{ display: "flex", gap: 5 }}>
                {[["reta", "╱", "reta"], ["curva", "⌒", "curva"], ["cotovelo", "⌐", "em cotovelo (ângulos retos)"]].map(([k, ic, t2]) => (
                  <button key={k} onClick={() => setLig({ curva: k })} title={t2}
                    style={{ ...icone, fontSize: 14, background: selEdgeObj.curva === k ? "#e8f2f4" : "#fff", borderColor: selEdgeObj.curva === k ? "#1f7a8c" : "#cfd6dd" }}>{ic}</button>
                ))}
              </div>
              <label style={lbl}>Pontas</label>
              <div style={{ display: "flex", gap: 5 }}>
                {PONTAS.map(([k, ic]) => (
                  <button key={k} onClick={() => setLig({ arrow: k })}
                    style={{ ...icone, fontSize: 14, background: selEdgeObj.arrow === k ? "#e8f2f4" : "#fff", borderColor: selEdgeObj.arrow === k ? "#1f7a8c" : "#cfd6dd" }}>{ic}</button>
                ))}
              </div>
              <label style={lbl}>Espessura</label>
              <input type="range" min="1" max="6" step="0.5" value={selEdgeObj.width} onChange={(e) => setLig({ width: +e.target.value })} style={{ width: "100%" }} />
              <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={!!selEdgeObj.dash} onChange={(e) => setLig({ dash: e.target.checked })} /> tracejada
              </label>
              <button style={{ ...mini, marginTop: 12 }} onClick={removeSel}>Excluir ligação</button>
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: "#7a8b99", lineHeight: 1.5 }}>
              Selecione um nó ou uma ligação para editar.<br /><br />
              <strong>Dica:</strong> segure <b>Shift</b> e clique para selecionar vários nós — aí os botões de alinhar e distribuir ficam ativos, e forma, cores e fonte passam a valer para todos de uma vez.
            </div>
          )}
          <div style={{ fontSize: 11, color: "#9aa7b2", marginTop: 16, borderTop: "1px solid #eef1f4", paddingTop: 8 }}>
            {state.nodes.length} nós · {state.edges.length} ligações{sels.length ? ` · ${sels.length} selecionado(s)` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

export { DiagramaGeral, buildGeralSVG, seedGeral, alinhar, distribuir };
