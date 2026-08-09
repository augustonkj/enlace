import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { esc, SUITE, Menu, MenuItem, Hint } from "./lib.js";

/*
  Campo (Bourdieu) — objetivação de um campo e do espaço social dos agentes.

  Cada agente recebe os quatro capitais (econômico, cultural, social, simbólico)
  numa escala 0–10. Disso saem as duas coordenadas de "A Distinção":
    · VOLUME global de capital  = soma dos quatro capitais (eixo vertical)
    · ESTRUTURA (composição)    = capital econômico − capital cultural (eixo horizontal)
  Opcionalmente registra-se a posição anterior (econômico/cultural), que desenha a
  TRAJETÓRIA do agente no espaço social.

  Estado próprio; entra no "Salvar Enlace" pela ponte SUITE (getCampo/setCampo).
  Referências: Bourdieu, A distinção; O poder simbólico; Razões práticas.
*/

const VBW = 900, VBH = 640;
const M = { l: 78, r: 44, t: 52, b: 74 };
const PW = VBW - M.l - M.r, PH = VBH - M.t - M.b;
const VOL_MAX = 40;   // 4 capitais × 10
const COMP_MAX = 10;  // |econômico − cultural|

const PALETTE = ["#1f7a8c", "#7a5ea8", "#2e7d4f", "#b06a1f", "#b3402f", "#3a6ea5", "#1abc9c", "#8a6d3b"];
const TIPOS_SUGERIDOS = ["docente", "gestão", "estudante", "família", "instituição", "agente externo"];

const uid = () => "b" + Math.random().toString(36).slice(2, 8);
const fmt = (v, d = 1) => v.toFixed(d).replace(".", ",");
const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? Math.max(0, Math.min(10, n)) : 0; };

function emptyCampo() {
  return {
    campo: { nome: "", especifico: "", illusio: "", doxa: "", autonomo: "", heteronomo: "", notas: "" },
    agentes: [],
  };
}

function seedCampo() {
  const a = (nome, tipo, econ, cult, soc, simb, ant, notas) =>
    ({ id: uid(), nome, tipo, econ, cult, soc, simb, econAnt: ant ? ant[0] : "", cultAnt: ant ? ant[1] : "", notas: notas || "" });
  return {
    campo: {
      nome: "Campo escolar — escola pública de ensino médio",
      especifico: "autoridade pedagógica: o poder de definir o que conta como bom ensino e bom aluno",
      illusio: "acreditar que o desempenho escolar mede o mérito e decide o futuro — e por isso vale a pena disputar",
      doxa: "a escola é neutra e recompensa o esforço individual; o que se herda de casa não estaria em jogo",
      autonomo: "professores com forte formação disciplinar, cuja legitimidade vem do campo acadêmico",
      heteronomo: "avaliações em larga escala, ranking, mídia e demandas do mercado de trabalho",
      notas: "Exemplo — substitua pelos agentes e pelas propriedades do seu campo.",
    },
    agentes: [
      a("Direção", "gestão", 5, 6, 9, 8, null, "concentra capital social e simbólico: representa a escola diante da rede."),
      a("Professora doutora", "docente", 4, 9, 6, 7, null, "polo autônomo: legitimidade vinda do capital cultural certificado."),
      a("Professor temporário", "docente", 3, 6, 3, 3, [2, 5], "trajetória ascendente, mas posição instável no campo."),
      a("Coordenação pedagógica", "gestão", 4, 7, 7, 6, null, ""),
      a("Estudante de família diplomada", "estudante", 6, 7, 5, 4, null, "herda capital cultural: a exigência da escola coincide com a de casa."),
      a("Estudante trabalhador", "estudante", 2, 4, 3, 2, [1, 2], "ascensão pela escolarização; a distância entre habitus e escola aparece como 'dificuldade'."),
      a("Família comerciante", "família", 8, 3, 5, 4, null, "muito capital econômico e pouco cultural: converte um no outro pela escola."),
      a("Secretaria de Educação", "instituição", 7, 6, 8, 7, null, "polo heterônomo: impõe metas e avaliações externas."),
    ],
  };
}

// ---- cálculos do espaço social ----
function metricas(ag) {
  const econ = num(ag.econ), cult = num(ag.cult), soc = num(ag.soc), simb = num(ag.simb);
  const volume = econ + cult + soc + simb;
  const comp = econ - cult;
  const temAnt = String(ag.econAnt).trim() !== "" || String(ag.cultAnt).trim() !== "";
  let ant = null;
  if (temAnt) {
    const ea = num(ag.econAnt), ca = num(ag.cultAnt);
    ant = { volume: ea + ca + soc + simb, comp: ea - ca };
  }
  return { econ, cult, soc, simb, volume, comp, ant };
}
const px = (comp) => M.l + PW / 2 + (comp / COMP_MAX) * (PW / 2);
const py = (vol) => M.t + PH - (vol / VOL_MAX) * PH;
// distância no espaço social, com os dois eixos normalizados em 0–1
function distancia(a, b) {
  const dx = (a.comp - b.comp) / (2 * COMP_MAX), dy = (a.volume - b.volume) / VOL_MAX;
  return Math.hypot(dx, dy);
}

function coresPorTipo(agentes) {
  const tipos = [];
  agentes.forEach((a) => { const t = (a.tipo || "").trim() || "—"; if (!tipos.includes(t)) tipos.push(t); });
  const map = {};
  tipos.forEach((t, i) => (map[t] = PALETTE[i % PALETTE.length]));
  return map;
}

function raio(simb) { return 5 + (simb / 10) * 7; }

// ---- SVG (mesma figura na tela, na exportação e no PDF) ----
function buildCampoInner(state, { withBg = true, sel = null } = {}) {
  const cores = coresPorTipo(state.agentes);
  const o = [];
  if (withBg) o.push(`<rect x="0" y="0" width="${VBW}" height="${VBH}" fill="#ffffff"/>`);
  o.push(...quadrantes());
  o.push(...eixos());
  state.agentes.forEach((ag) => {
    const m = metricas(ag);
    const cor = cores[(ag.tipo || "").trim() || "—"];
    const x = px(m.comp), y = py(m.volume);
    if (m.ant) {
      const xa = px(m.ant.comp), ya = py(m.ant.volume);
      o.push(`<line x1="${xa.toFixed(1)}" y1="${ya.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${cor}" stroke-width="1.4" stroke-dasharray="5 3" opacity="0.75"/>`);
      o.push(`<circle cx="${xa.toFixed(1)}" cy="${ya.toFixed(1)}" r="3" fill="#ffffff" stroke="${cor}" stroke-width="1.4"/>`);
    }
    const r = raio(m.simb);
    o.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${cor}" fill-opacity="0.82" stroke="${sel === ag.id ? "#13313a" : "#ffffff"}" stroke-width="${sel === ag.id ? 2.6 : 1.6}"/>`);
    const nome = ag.nome || "(sem nome)";
    const anchor = x > M.l + PW * 0.72 ? "end" : "start";
    const tx = anchor === "end" ? x - r - 5 : x + r + 5;
    o.push(`<text x="${tx.toFixed(1)}" y="${(y + 4).toFixed(1)}" font-size="12" fill="#2b3a48" text-anchor="${anchor}" stroke="#ffffff" stroke-width="3" paint-order="stroke">${esc(nome)}</text>`);
  });
  o.push(...legenda(cores));
  return o.join("");
}
function buildCampoSVG(state, opts = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VBW} ${VBH}" width="${VBW}" height="${VBH}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">${buildCampoInner(state, opts)}</svg>`;
}
function quadrantes() {
  const cx = M.l + PW / 2, cy = M.t + PH / 2;
  return [
    `<rect x="${M.l}" y="${M.t}" width="${PW}" height="${PH}" fill="#fbfcfd" stroke="#dde3e9"/>`,
    `<rect x="${M.l}" y="${M.t}" width="${PW / 2}" height="${PH / 2}" fill="#7a5ea8" fill-opacity="0.045"/>`,
    `<rect x="${cx}" y="${M.t}" width="${PW / 2}" height="${PH / 2}" fill="#b06a1f" fill-opacity="0.05"/>`,
    `<text x="${M.l + 10}" y="${M.t + 20}" font-size="11" fill="#8a99a6">+ volume · polo cultural</text>`,
    `<text x="${M.l + PW - 10}" y="${M.t + 20}" font-size="11" fill="#8a99a6" text-anchor="end">+ volume · polo econômico</text>`,
    `<text x="${M.l + 10}" y="${M.t + PH - 10}" font-size="11" fill="#8a99a6">− volume · polo cultural</text>`,
    `<text x="${M.l + PW - 10}" y="${M.t + PH - 10}" font-size="11" fill="#8a99a6" text-anchor="end">− volume · polo econômico</text>`,
    `<line x1="${cx}" y1="${M.t}" x2="${cx}" y2="${M.t + PH}" stroke="#c3ccd4" stroke-width="1.2"/>`,
    `<line x1="${M.l}" y1="${cy}" x2="${M.l + PW}" y2="${cy}" stroke="#c3ccd4" stroke-width="1.2" stroke-dasharray="4 4"/>`,
  ];
}
function eixos() {
  const cx = M.l + PW / 2, out = [];
  out.push(`<text x="${VBW / 2}" y="26" font-size="13" font-weight="700" fill="#2b3a48" text-anchor="middle">Espaço social do campo</text>`);
  out.push(`<text x="${cx}" y="${M.t - 12}" font-size="11.5" fill="#5a6b7a" text-anchor="middle">volume global de capital (+)</text>`);
  out.push(`<text x="${cx}" y="${M.t + PH + 30}" font-size="11.5" fill="#5a6b7a" text-anchor="middle">volume global de capital (−)</text>`);
  out.push(`<text x="${M.l - 12}" y="${M.t + PH / 2}" font-size="11.5" fill="#5a6b7a" text-anchor="middle" transform="rotate(-90 ${M.l - 12} ${M.t + PH / 2})">capital cultural dominante</text>`);
  out.push(`<text x="${M.l + PW + 14}" y="${M.t + PH / 2}" font-size="11.5" fill="#5a6b7a" text-anchor="middle" transform="rotate(90 ${M.l + PW + 14} ${M.t + PH / 2})">capital econômico dominante</text>`);
  for (let v = 0; v <= VOL_MAX; v += 10) {
    const y = py(v);
    out.push(`<line x1="${M.l - 5}" y1="${y}" x2="${M.l}" y2="${y}" stroke="#c3ccd4"/>`);
    out.push(`<text x="${M.l - 9}" y="${y + 4}" font-size="10.5" fill="#9aa7b2" text-anchor="end">${v}</text>`);
  }
  for (let c = -COMP_MAX; c <= COMP_MAX; c += 5) {
    const x = px(c);
    out.push(`<line x1="${x}" y1="${M.t + PH}" x2="${x}" y2="${M.t + PH + 5}" stroke="#c3ccd4"/>`);
    out.push(`<text x="${x}" y="${M.t + PH + 18}" font-size="10.5" fill="#9aa7b2" text-anchor="middle">${c > 0 ? "+" + c : c}</text>`);
  }
  return out;
}
function legenda(cores) {
  const tipos = Object.keys(cores);
  if (!tipos.length) return [];
  const out = [], y = VBH - 16;
  let x = M.l;
  tipos.forEach((t) => {
    out.push(`<circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${cores[t]}" fill-opacity="0.82"/>`);
    out.push(`<text x="${x + 15}" y="${y}" font-size="11" fill="#5a6b7a">${esc(t)}</text>`);
    x += 22 + t.length * 6.2;
  });
  out.push(`<text x="${VBW - M.r}" y="${y}" font-size="10.5" fill="#9aa7b2" text-anchor="end">tamanho do ponto = capital simbólico · linha tracejada = trajetória</text>`);
  return out;
}

function dl(blob, name) { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500); }

const CAMPO_CAMPOS = [
  ["nome", "Campo analisado", "ex.: campo escolar, campo jurídico, campo da formação de professores", "Um campo é um espaço social relativamente autônomo, com regras e um capital específico em disputa."],
  ["especifico", "Capital específico em disputa", "o que dá poder e reconhecimento neste campo", "Cada campo tem sua moeda: autoridade pedagógica, prestígio científico, competência jurídica…"],
  ["illusio", "Illusio", "por que vale a pena entrar no jogo", "A crença compartilhada de que o jogo do campo merece ser jogado — o investimento que faz o campo funcionar."],
  ["doxa", "Doxa", "o que é aceito sem discussão", "O conjunto de pressupostos que não são postos em questão: parecem naturais, não históricos."],
  ["autonomo", "Polo autônomo", "quem se legitima pelas regras internas do campo", "Polo em que o reconhecimento vem dos pares, segundo os critérios próprios do campo."],
  ["heteronomo", "Polo heterônomo", "quem depende de forças externas (mercado, Estado, mídia)", "Polo em que a legitimidade vem de fora do campo: demanda externa, poder econômico ou político."],
];

function CampoBourdieu({ active = true }) {
  const [state, setStateRaw] = useState(() => emptyCampo());
  const [sel, setSel] = useState(null);
  const [verTraj, setVerTraj] = useState(false);
  const [past, setPast] = useState([]);
  const stateRef = useRef(state); useEffect(() => { stateRef.current = state; });
  const fileRef = useRef(null);

  const mut = useCallback((u) => { setPast((p) => [...p.slice(-40), JSON.stringify(stateRef.current)]); setStateRaw(u); }, []);
  const undo = useCallback(() => setPast((p) => { if (!p.length) return p; setStateRaw(JSON.parse(p[p.length - 1])); return p.slice(0, -1); }), []);

  // ponte com o "Salvar Enlace"
  useEffect(() => {
    SUITE.getCampo = () => stateRef.current;
    SUITE.setCampo = (d) => { if (d && Array.isArray(d.agentes)) { setStateRaw({ campo: { ...emptyCampo().campo, ...(d.campo || {}) }, agentes: d.agentes }); setSel(null); } };
    return () => { SUITE.getCampo = null; SUITE.setCampo = null; };
  }, []);

  // autosave local
  useEffect(() => { const t = setTimeout(() => { try { window.localStorage.setItem("enlace_campo_v1", JSON.stringify(state)); } catch {} }, 600); return () => clearTimeout(t); }, [state]);
  useEffect(() => { try { const s = window.localStorage.getItem("enlace_campo_v1"); if (s) { const o = JSON.parse(s); if (o && Array.isArray(o.agentes)) setStateRaw({ campo: { ...emptyCampo().campo, ...(o.campo || {}) }, agentes: o.agentes }); } } catch {} }, []);

  const setCampoField = (k, v) => setStateRaw((s) => ({ ...s, campo: { ...s.campo, [k]: v } }));
  const setAg = (id, k, v) => setStateRaw((s) => ({ ...s, agentes: s.agentes.map((a) => (a.id === id ? { ...a, [k]: v } : a)) }));
  const addAg = () => { const id = uid(); mut((s) => ({ ...s, agentes: [...s.agentes, { id, nome: "", tipo: "", econ: 5, cult: 5, soc: 5, simb: 5, econAnt: "", cultAnt: "", notas: "" }] })); setSel(id); };
  const delAg = (id) => { mut((s) => ({ ...s, agentes: s.agentes.filter((a) => a.id !== id) })); if (sel === id) setSel(null); };
  const exemplo = () => { mut(() => seedCampo()); setVerTraj(true); setSel(null); };
  const limpar = () => { mut(() => emptyCampo()); setSel(null); };

  const dados = useMemo(() => state.agentes.map((a) => ({ ag: a, m: metricas(a) })), [state.agentes]);
  const cores = useMemo(() => coresPorTipo(state.agentes), [state.agentes]);

  // a figura é montada como string (a mesma que sai no PNG/SVG/PDF) e injetada no <svg>
  const svgRef = useRef(null);
  const inner = useMemo(() => buildCampoInner(state, { withBg: false, sel }), [state, sel]);
  useEffect(() => { if (svgRef.current) svgRef.current.innerHTML = inner; }, [inner]);

  // clique no gráfico seleciona o agente mais próximo
  const onSvgClick = (e) => {
    const svg = svgRef.current; if (!svg || !dados.length) return;
    const r = svg.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * VBW, y = (e.clientY - r.top) / r.height * VBH;
    let melhor = null, dmin = Infinity;
    dados.forEach(({ ag, m }) => { const d = Math.hypot(px(m.comp) - x, py(m.volume) - y); if (d < dmin) { dmin = d; melhor = ag.id; } });
    if (melhor && dmin <= 26) setSel(sel === melhor ? null : melhor);
  };

  const resumo = useMemo(() => {
    if (!dados.length) return null;
    const vols = dados.map((d) => d.m.volume);
    const media = vols.reduce((s, v) => s + v, 0) / vols.length;
    const cult = dados.filter((d) => d.m.comp < 0).length;
    const econ = dados.filter((d) => d.m.comp > 0).length;
    return { n: dados.length, media, min: Math.min(...vols), max: Math.max(...vols), cult, econ, eq: dados.length - cult - econ };
  }, [dados]);

  // proximidades do agente selecionado: quem ocupa posições vizinhas no espaço social
  const vizinhos = useMemo(() => {
    if (!sel) return [];
    const eu = dados.find((d) => d.ag.id === sel); if (!eu) return [];
    return dados.filter((d) => d.ag.id !== sel)
      .map((d) => ({ nome: d.ag.nome || "(sem nome)", dist: distancia(eu.m, d.m) }))
      .sort((a, b) => a.dist - b.dist).slice(0, 3);
  }, [sel, dados]);

  const exportCSV = () => {
    const linhas = [["agente", "tipo", "economico", "cultural", "social", "simbolico", "volume", "composicao"].join(";")];
    dados.forEach(({ ag, m }) => linhas.push([ag.nome, ag.tipo, m.econ, m.cult, m.soc, m.simb, m.volume, m.comp].join(";")));
    dl(new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8" }), "campo-agentes.csv");
  };
  const exportSVG = () => dl(new Blob([buildCampoSVG(state)], { type: "image/svg+xml" }), "espaco-social.svg");
  const exportPNG = () => {
    const svg = buildCampoSVG(state); const img = new Image();
    img.onload = () => { const c = document.createElement("canvas"); c.width = VBW * 2; c.height = VBH * 2; const ctx = c.getContext("2d"); ctx.scale(2, 2); ctx.drawImage(img, 0, 0); c.toBlob((b) => b && dl(b, "espaco-social.png")); };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  };
  const exportJSON = () => dl(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }), "campo-bourdieu.json");
  const importJSON = (ev) => { const f = ev.target.files && ev.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const o = JSON.parse(String(r.result)); if (o && Array.isArray(o.agentes)) mut(() => ({ campo: { ...emptyCampo().campo, ...(o.campo || {}) }, agentes: o.agentes })); } catch {} }; r.readAsText(f); ev.target.value = ""; };

  const exportPDF = () => {
    const w = window.open("", "_blank"); if (!w) { try { window.alert("Permita pop-ups para gerar o relatório em PDF."); } catch {} return; }
    const svg = buildCampoSVG(state).replace("<svg ", '<svg style="max-width:100%;height:auto" ');
    const props = CAMPO_CAMPOS.filter(([k]) => (state.campo[k] || "").trim())
      .map(([k, rot]) => `<p style="margin:6px 0"><b>${esc(rot)}:</b> ${esc(state.campo[k])}</p>`).join("") || "<p style='color:#888'>—</p>";
    const linhas = dados.map(({ ag, m }) => `<tr><td>${esc(ag.nome || "—")}</td><td>${esc(ag.tipo || "—")}</td><td style="text-align:right">${m.econ}</td><td style="text-align:right">${m.cult}</td><td style="text-align:right">${m.soc}</td><td style="text-align:right">${m.simb}</td><td style="text-align:right"><b>${m.volume}</b></td><td style="text-align:right">${m.comp > 0 ? "+" + m.comp : m.comp}</td></tr>`).join("");
    const notas = dados.filter(({ ag }) => (ag.notas || "").trim()).map(({ ag }) => `<li><b>${esc(ag.nome || "—")}:</b> ${esc(ag.notas)}</li>`).join("");
    const doc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Campo (Bourdieu)</title><style>@media print{.noprint{display:none!important}}@page{margin:14mm}body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#2b3a48;margin:0}h2{font-size:15px;border-bottom:1px solid #e3e9ee;padding-bottom:4px;margin-top:22px}table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{border:1px solid #e3e9ee;padding:5px 7px}th{background:#f4f7f9;text-align:left}</style></head><body onload="setTimeout(function(){window.print()},300)"><div class="noprint" style="position:sticky;top:0;display:flex;gap:10px;align-items:center;background:#1f7a8c;color:#fff;padding:10px 16px">Relatório pronto. <button onclick="window.print()" style="border:none;background:#fff;color:#1f7a8c;font-weight:700;border-radius:6px;padding:6px 14px;cursor:pointer">Imprimir / Salvar como PDF</button><span style="font-size:12px;opacity:.85">escolha "Salvar como PDF" no destino</span></div><div style="max-width:1000px;margin:0 auto;padding:24px"><h1 style="font-size:20px">${esc(state.campo.nome || "Campo (Bourdieu)")}</h1><p style="color:#888;font-size:13px">${dados.length} agentes · espaço social por volume e estrutura do capital</p><h2>Propriedades do campo</h2>${props}<h2>Espaço social</h2><div style="border:1px solid #e3e9ee;border-radius:8px;padding:8px">${svg}</div><h2>Agentes e capitais</h2><table><thead><tr><th>Agente</th><th>Tipo</th><th>Econ.</th><th>Cult.</th><th>Soc.</th><th>Simb.</th><th>Volume</th><th>Composição</th></tr></thead><tbody>${linhas || "<tr><td colspan='8'>—</td></tr>"}</tbody></table><p style="font-size:11.5px;color:#888;margin-top:6px">Volume = soma dos quatro capitais (0–40). Composição = capital econômico − capital cultural (−10 a +10): negativo indica predomínio cultural; positivo, econômico.</p>${notas ? `<h2>Notas sobre os agentes</h2><ul style="font-size:13px;line-height:1.6">${notas}</ul>` : ""}${(state.campo.notas || "").trim() ? `<h2>Notas do campo</h2><p style="font-size:13px">${esc(state.campo.notas)}</p>` : ""}</div></body></html>`;
    w.document.open(); w.document.write(doc); w.document.close();
  };

  const mini = { padding: "6px 10px", fontSize: 12.5, border: "1px solid #cfd6dd", borderRadius: 6, cursor: "pointer", background: "#fff", color: "#34495e", fontWeight: 600 };
  const div = { width: 1, height: 22, background: "#dde3e9" };
  const inp = { width: "100%", boxSizing: "border-box", padding: "6px 8px", border: "1px solid #cfd6dd", borderRadius: 5, fontSize: 13, fontFamily: "inherit" };
  const cell = { ...inp, padding: "4px 6px", fontSize: 12.5 };
  const numCell = { ...cell, width: 54, textAlign: "center" };
  const th = { fontSize: 11, fontWeight: 700, color: "#5a6b7a", textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #dde3e9", whiteSpace: "nowrap" };
  const lbl = { fontSize: 12, color: "#5a6b7a", display: "flex", alignItems: "center", gap: 4, margin: "10px 0 3px" };
  const card = { background: "#fff", border: "1px solid #dde3e9", borderRadius: 8, padding: 14 };

  const selAg = sel ? state.agentes.find((a) => a.id === sel) : null;

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#eef1f4", minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", padding: "9px 12px", background: "#fff", borderBottom: "1px solid #dde3e9" }}>
        <strong style={{ fontSize: 15, marginRight: 4 }}>Campo (Bourdieu)</strong>
        <span style={{ fontSize: 11.5, color: "#9aa7b2" }}>espaço social: volume e estrutura do capital</span>
        <Hint text="Cada agente recebe os quatro capitais de 0 a 10. O gráfico posiciona os agentes pelo volume total (vertical) e pela composição — econômico menos cultural (horizontal), como no espaço social de A Distinção." />
        <span style={div} />
        <button style={mini} onClick={addAg}>+ Agente</button>
        <button style={mini} onClick={undo} disabled={!past.length} title="desfazer">↶</button>
        <span style={div} />
        <Menu label="Exportar" btnStyle={mini} title="exportar figura, tabela e relatório">
          {(close) => (<>
            <MenuItem onClick={() => { exportPDF(); close(); }}>Relatório (PDF)</MenuItem>
            <MenuItem onClick={() => { exportPNG(); close(); }}>Figura PNG</MenuItem>
            <MenuItem onClick={() => { exportSVG(); close(); }}>Figura SVG</MenuItem>
            <MenuItem onClick={() => { exportCSV(); close(); }}>Agentes (CSV)</MenuItem>
          </>)}
        </Menu>
        <Menu label="Projeto" btnStyle={mini} title="salvar, abrir, exemplo e limpar">
          {(close) => (<>
            <MenuItem onClick={() => { exportJSON(); close(); }}>Salvar (.json)</MenuItem>
            <MenuItem onClick={() => { fileRef.current?.click(); close(); }}>Abrir (.json)</MenuItem>
            <MenuItem onClick={() => { exemplo(); close(); }}>Carregar exemplo</MenuItem>
            <MenuItem danger onClick={() => { limpar(); close(); }}>Limpar tudo</MenuItem>
          </>)}
        </Menu>
        <input ref={fileRef} type="file" accept="application/json" onChange={importJSON} style={{ display: "none" }} />
      </div>

      <div style={{ display: "flex", gap: 12, padding: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 560px", minWidth: 320, ...card, padding: 8 }}>
          {dados.length ? (
            <svg ref={svgRef} viewBox={`0 0 ${VBW} ${VBH}`} onClick={onSvgClick}
              style={{ width: "100%", height: "auto", display: "block", cursor: "pointer" }} />
          ) : (
            <div style={{ padding: "60px 20px", textAlign: "center", color: "#9aa7b2", fontSize: 13 }}>
              Cadastre agentes na tabela abaixo (ou use <b>Projeto ▾ · Carregar exemplo</b>) para ver o espaço social.
            </div>
          )}
          {dados.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 4px 2px" }}>
              {dados.map(({ ag, m }) => (
                <button key={ag.id} onClick={() => setSel(sel === ag.id ? null : ag.id)}
                  style={{ ...mini, padding: "3px 8px", fontSize: 11.5, borderColor: sel === ag.id ? "#1f7a8c" : "#cfd6dd", background: sel === ag.id ? "#e8f2f4" : "#fff" }}
                  title={`volume ${m.volume} · composição ${m.comp > 0 ? "+" + m.comp : m.comp}`}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: cores[(ag.tipo || "").trim() || "—"], marginRight: 5 }} />
                  {ag.nome || "(sem nome)"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: "0 1 320px", minWidth: 270, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#5a6b7a" }}>Propriedades do campo</div>
            {CAMPO_CAMPOS.map(([k, rot, ph, hint]) => (
              <div key={k}>
                <label style={lbl}>{rot} <Hint text={hint} /></label>
                {k === "nome" ? <input style={inp} value={state.campo[k] || ""} placeholder={ph} onChange={(e) => setCampoField(k, e.target.value)} />
                  : <textarea style={{ ...inp, minHeight: 44, resize: "vertical" }} value={state.campo[k] || ""} placeholder={ph} onChange={(e) => setCampoField(k, e.target.value)} />}
              </div>
            ))}
            <label style={lbl}>Notas</label>
            <textarea style={{ ...inp, minHeight: 50, resize: "vertical" }} value={state.campo.notas || ""} placeholder="observações sobre as lutas, as regras e a história do campo" onChange={(e) => setCampoField("notas", e.target.value)} />
          </div>

          {resumo && (
            <div style={card}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#5a6b7a", marginBottom: 8 }}>Resumo do espaço</div>
              <div style={{ fontSize: 12.5, color: "#46555f", lineHeight: 1.7 }}>
                <div>{resumo.n} agentes · volume médio <b>{fmt(resumo.media)}</b> (de {resumo.min} a {resumo.max})</div>
                <div>Polo cultural: <b>{resumo.cult}</b> · polo econômico: <b>{resumo.econ}</b>{resumo.eq ? <> · equilibrados: <b>{resumo.eq}</b></> : null}</div>
              </div>
              {selAg && (
                <div style={{ marginTop: 10, borderTop: "1px solid #eef1f4", paddingTop: 8 }}>
                  <div style={{ fontSize: 12, color: "#5a6b7a", marginBottom: 4 }}>Posições próximas de <b>{selAg.nome || "(sem nome)"}</b> <Hint text="Proximidade no espaço social: agentes vizinhos tendem a partilhar condições de existência e, por isso, disposições (habitus) semelhantes." /></div>
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "#46555f", lineHeight: 1.6 }}>
                    {vizinhos.map((v, i) => <li key={i}>{v.nome} <span style={{ color: "#9aa7b2" }}>(d = {fmt(v.dist, 2)})</span></li>)}
                  </ol>
                </div>
              )}
            </div>
          )}

          {selAg && (
            <div style={card}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#5a6b7a" }}>Agente selecionado</div>
              <label style={lbl}>Notas (habitus, trajetória, estratégias)</label>
              <textarea style={{ ...inp, minHeight: 80, resize: "vertical" }} value={selAg.notas || ""} placeholder="disposições incorporadas, origem social, estratégias de reprodução ou de subversão…" onChange={(e) => setAg(selAg.id, "notas", e.target.value)} />
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "0 12px 16px" }}>
        <div style={{ ...card, padding: 10, overflowX: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#5a6b7a" }}>Agentes e capitais</div>
            <span style={{ fontSize: 11.5, color: "#9aa7b2" }}>escala 0–10 em cada capital</span>
            <label style={{ fontSize: 12, color: "#5a6b7a", display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
              <input type="checkbox" checked={verTraj} onChange={(e) => setVerTraj(e.target.checked)} />
              trajetória (posição anterior)
              <Hint text="Preencha o capital econômico e cultural de um momento anterior para desenhar a trajetória do agente no espaço social. O capital social e o simbólico são tomados como os atuais." />
            </label>
          </div>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: verTraj ? 860 : 700 }}>
            <thead>
              <tr>
                <th style={th}>Agente</th><th style={th}>Tipo</th>
                <th style={th} title="capital econômico">Econ.</th><th style={th} title="capital cultural">Cult.</th>
                <th style={th} title="capital social">Soc.</th><th style={th} title="capital simbólico">Simb.</th>
                {verTraj && <><th style={{ ...th, color: "#9aa7b2" }}>Econ. ant.</th><th style={{ ...th, color: "#9aa7b2" }}>Cult. ant.</th></>}
                <th style={{ ...th, textAlign: "right" }}>Volume</th><th style={{ ...th, textAlign: "right" }}>Composição</th><th style={th} />
              </tr>
            </thead>
            <tbody>
              {dados.map(({ ag, m }) => (
                <tr key={ag.id} style={{ background: sel === ag.id ? "#f2f8f9" : "transparent" }} onClick={() => setSel(ag.id)}>
                  <td style={{ padding: "3px 6px" }}><input style={cell} value={ag.nome} placeholder="nome ou posição" onChange={(e) => setAg(ag.id, "nome", e.target.value)} /></td>
                  <td style={{ padding: "3px 6px" }}><input style={{ ...cell, width: 120 }} list="tipos-campo" value={ag.tipo} placeholder="tipo" onChange={(e) => setAg(ag.id, "tipo", e.target.value)} /></td>
                  {["econ", "cult", "soc", "simb"].map((k) => (
                    <td key={k} style={{ padding: "3px 6px" }}><input style={numCell} type="number" min="0" max="10" step="1" value={ag[k]} onChange={(e) => setAg(ag.id, k, e.target.value)} /></td>
                  ))}
                  {verTraj && ["econAnt", "cultAnt"].map((k) => (
                    <td key={k} style={{ padding: "3px 6px" }}><input style={{ ...numCell, background: "#fafbfc" }} type="number" min="0" max="10" step="1" value={ag[k]} placeholder="—" onChange={(e) => setAg(ag.id, k, e.target.value)} /></td>
                  ))}
                  <td style={{ padding: "3px 8px", textAlign: "right", fontSize: 12.5, fontWeight: 700, color: "#2b3a48" }}>{m.volume}</td>
                  <td style={{ padding: "3px 8px", textAlign: "right", fontSize: 12.5, color: m.comp < 0 ? "#7a5ea8" : m.comp > 0 ? "#b06a1f" : "#7a8b99" }}>{m.comp > 0 ? "+" + m.comp : m.comp}</td>
                  <td style={{ padding: "3px 6px" }}><button style={{ ...mini, padding: "2px 7px", color: "#b3402f" }} onClick={(e) => { e.stopPropagation(); delAg(ag.id); }} title="remover agente">✕</button></td>
                </tr>
              ))}
              {!dados.length && <tr><td colSpan={verTraj ? 11 : 9} style={{ padding: 14, fontSize: 12.5, color: "#9aa7b2" }}>Nenhum agente ainda — clique em <b>+ Agente</b> ou carregue o exemplo.</td></tr>}
            </tbody>
          </table>
          <datalist id="tipos-campo">{TIPOS_SUGERIDOS.map((t) => <option key={t} value={t} />)}</datalist>
          <div style={{ fontSize: 11, color: "#9aa7b2", marginTop: 8, lineHeight: 1.6 }}>
            <b>Volume</b> = soma dos quatro capitais (0–40): a altura no espaço social. <b>Composição</b> = econômico − cultural (−10 a +10): negativo puxa para o polo cultural (esquerda), positivo para o econômico (direita).
            Os capitais são estimativas do pesquisador, construídas a partir dos indicadores do seu material — não medidas prontas.
          </div>
        </div>
      </div>
    </div>
  );
}

export { CampoBourdieu, buildCampoSVG, seedCampo };
