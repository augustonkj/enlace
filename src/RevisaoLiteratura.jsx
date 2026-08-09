import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { esc, SUITE, Menu, MenuItem, Hint, parseCSVfull, csvNorm, wrapText, salvarLocal, AvisoArmazenamento } from "./lib.js";

/*
  Revisão de literatura — tabela de referências + diagrama de fluxo da seleção.

  Dois modos:
   · Narrativa   — tabela e um fluxo enxuto (identificados → triados → incluídos).
   · Sistemática — acrescenta o protocolo (pergunta, bases, strings, critérios) e
                   o fluxo completo no formato PRISMA 2020, com os textos buscados,
                   os não recuperados e os excluídos na leitura com motivos.

  O diagrama é SEMPRE calculado a partir da etapa de cada referência na tabela;
  cada caixa pode ser sobrescrita à mão (rótulo e número) e devolvida ao valor
  calculado pelo botão "recalcular".

  Estado próprio; entra no "Salvar Enlace" pela ponte SUITE (getRevisao/setRevisao).
*/

const ETAPAS = [
  ["identificado", "Identificado", "#7a8b99", "veio da busca e ainda não foi triado"],
  ["duplicado", "Duplicado", "#b06a1f", "mesmo registro já presente — removido antes da triagem"],
  ["excluido_triagem", "Excluído na triagem", "#b3402f", "título/resumo fora dos critérios"],
  ["nao_recuperado", "Não recuperado", "#8a6d3b", "texto completo não obtido"],
  ["excluido_leitura", "Excluído na leitura", "#a3402f", "texto completo lido e descartado — exige motivo"],
  ["incluido", "Incluído", "#2e7d4f", "compõe a revisão"],
];
const ETAPA_LBL = {}, ETAPA_COR = {};
ETAPAS.forEach(([k, l, c]) => { ETAPA_LBL[k] = l; ETAPA_COR[k] = c; });

const uid = () => "r" + Math.random().toString(36).slice(2, 9);
const nrm = (s) => csvNorm(s).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function emptyRevisao() {
  return {
    modo: "narrativa",
    protocolo: { pergunta: "", bases: "", strings: "", periodo: "", idiomas: "", inclusao: "", exclusao: "", registro: "", notas: "" },
    refs: [],
    over: {},   // sobrescritas do diagrama: { chave: { rotulo, n } }
  };
}

function seedRevisao() {
  const r = (autores, ano, titulo, veiculo, base, etapa, motivo, tags) =>
    ({ id: uid(), autores, ano: String(ano), titulo, veiculo, base, tipo: "artigo", doi: "", link: "", resumo: "", notas: "", tags: tags || "", etapa, motivo: motivo || "" });
  return {
    modo: "sistematica",
    protocolo: {
      pergunta: "Como a modelagem matemática tem sido usada no ensino de ciências na educação básica (2015–2025)?",
      bases: "Scopus, Web of Science, SciELO",
      strings: '("modelagem matemática" OR "mathematical modelling") AND ("ensino de ciências" OR "science education") AND ("educação básica" OR "K-12")',
      periodo: "2015–2025",
      idiomas: "português, inglês e espanhol",
      inclusao: "pesquisa empírica; educação básica; modelagem matemática como objeto ou estratégia; texto completo disponível",
      exclusao: "ensaios teóricos sem dados; ensino superior; resumos de evento; duplicatas",
      registro: "protocolo registrado no OSF (exemplo)",
      notas: "Exemplo — substitua pelo seu protocolo, suas bases e suas referências.",
    },
    refs: [
      r("Almeida, L. M. W.; Silva, K. P.", 2016, "Modelagem matemática e o ensino de ciências: um estudo em turmas de 9º ano", "Bolema", "Scopus", "incluido", "", "modelagem; anos finais"),
      r("Barbosa, J. C.", 2015, "Modelagem matemática e os professores: a questão da formação", "Bolema", "Web of Science", "incluido", "", "formação docente"),
      r("Ferreira, D. H. L.; Jacobini, O. R.", 2018, "Modelagem matemática e educação ambiental no ensino médio", "Ciência & Educação", "SciELO", "incluido", "", "ensino médio"),
      r("Kaiser, G.; Sriraman, B.", 2019, "A global survey of international perspectives on modelling", "ZDM", "Scopus", "incluido", "", "revisão internacional"),
      r("Almeida, L. M. W.; Silva, K. P.", 2016, "Modelagem matemática e o ensino de ciências: um estudo em turmas de 9º ano", "Bolema", "Web of Science", "duplicado", "", ""),
      r("Barbosa, J. C.", 2015, "Modelagem matemática e os professores: a questão da formação", "Bolema", "SciELO", "duplicado", "", ""),
      r("Blum, W.", 2020, "Quality teaching of mathematical modelling: what do we know?", "Journal of Mathematical Behavior", "Scopus", "excluido_leitura", "não é pesquisa empírica", ""),
      r("Souza, E. G.; Luna, A. V. A.", 2021, "Modelagem na licenciatura em matemática", "Educação Matemática Pesquisa", "Web of Science", "excluido_leitura", "fora da educação básica", ""),
      r("Oliveira, A. M.; Campos, C. R.", 2017, "Modelagem e estatística na formação de professores", "Revista de Ensino de Ciências", "SciELO", "excluido_leitura", "fora da educação básica", ""),
      r("Lima, R. S.", 2019, "Uma proposta de sequência didática com modelagem", "Anais de evento", "Scopus", "excluido_triagem", "resumo de evento", ""),
      r("Costa, P. F.", 2022, "Machine learning models for student dropout", "Computers & Education", "Scopus", "excluido_triagem", "sentido de 'modelagem' fora do escopo", ""),
      r("Nunes, T. M.", 2018, "Modelagem no ensino superior de engenharia", "IJEE", "Web of Science", "excluido_triagem", "ensino superior", ""),
      r("Silva, C. A.", 2020, "Reflexões sobre modelagem e currículo", "Revista Brasileira de Educação", "SciELO", "excluido_triagem", "ensaio teórico", ""),
      r("Martins, H. P.", 2017, "Modelagem matemática em escolas rurais", "Periódico regional", "SciELO", "nao_recuperado", "texto completo indisponível", ""),
    ],
    over: {},
  };
}

// ---------- contagens ----------
function contagens(state) {
  const refs = state.refs;
  const c = (e) => refs.filter((r) => r.etapa === e).length;
  const identificados = refs.length;
  const duplicados = c("duplicado");
  const triados = identificados - duplicados;
  const exTriagem = c("excluido_triagem");
  const buscados = triados - exTriagem;
  const naoRec = c("nao_recuperado");
  const avaliados = buscados - naoRec;
  const exLeitura = c("excluido_leitura");
  const incluidos = c("incluido");
  const pendentes = avaliados - exLeitura - incluidos;
  const porBase = {};
  refs.forEach((r) => { const b = (r.base || "").trim() || "sem base"; porBase[b] = (porBase[b] || 0) + 1; });
  const motivos = (etapa) => {
    const m = {};
    refs.filter((r) => r.etapa === etapa).forEach((r) => { const k = (r.motivo || "").trim() || "sem motivo registrado"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  return {
    identificados, duplicados, triados, exTriagem, buscados, naoRec, avaliados, exLeitura, incluidos, pendentes,
    porBase: Object.entries(porBase).sort((a, b) => b[1] - a[1]),
    motivosLeitura: motivos("excluido_leitura"), motivosTriagem: motivos("excluido_triagem"),
    // no modo narrativa tudo o que saiu depois da triagem vira "excluídos"
    exNarrativa: exTriagem + naoRec + exLeitura,
  };
}

// ---------- duplicatas ----------
function acharDuplicados(refs) {
  const vistos = new Map(); const dupes = [];
  refs.forEach((r) => {
    const doi = (r.doi || "").trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
    const chave = doi ? "doi:" + doi : "t:" + nrm(r.titulo) + "|" + String(r.ano || "").trim();
    if (!nrm(r.titulo) && !doi) return;
    if (vistos.has(chave)) dupes.push(r.id); else vistos.set(chave, r.id);
  });
  return dupes;
}

// ---------- importadores ----------
const CAMPOS_CSV = {
  autores: ["autores", "autor", "authors", "author", "author full names"],
  ano: ["ano", "year", "publication year", "data"],
  titulo: ["titulo", "title", "article title", "document title"],
  veiculo: ["veiculo", "periodico", "revista", "source title", "journal", "publication title", "fonte"],
  doi: ["doi"],
  tipo: ["tipo", "document type", "type", "publication type"],
  resumo: ["resumo", "abstract"],
  link: ["link", "url", "doi link"],
};
function deCSV(text, base) {
  const rows = parseCSVfull(text); if (rows.length < 2) return [];
  const head = rows[0].map((h) => csvNorm(h));
  const idx = {};
  Object.entries(CAMPOS_CSV).forEach(([k, alts]) => { idx[k] = head.findIndex((h) => alts.includes(h)); });
  return rows.slice(1).map((row) => {
    const g = (k) => (idx[k] >= 0 ? String(row[idx[k]] || "").trim() : "");
    return novaRef({ autores: g("autores"), ano: g("ano").replace(/\D/g, "").slice(0, 4), titulo: g("titulo"), veiculo: g("veiculo"), doi: g("doi"), tipo: g("tipo") || "artigo", resumo: g("resumo"), link: g("link"), base });
  }).filter((r) => r.titulo || r.autores);
}
// .bib de base brasileira vem cheio de acento em LaTeX: {\~a}o, Jo\'{a}o, Concei\c{c}\~ao
const ACENTOS = {
  "'": { a: "á", e: "é", i: "í", o: "ó", u: "ú", y: "ý", n: "ń", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú" },
  "`": { a: "à", e: "è", i: "ì", o: "ò", u: "ù", A: "À", E: "È", I: "Ì", O: "Ò", U: "Ù" },
  "^": { a: "â", e: "ê", i: "î", o: "ô", u: "û", A: "Â", E: "Ê", I: "Î", O: "Ô", U: "Û" },
  "~": { a: "ã", o: "õ", n: "ñ", A: "Ã", O: "Õ", N: "Ñ" },
  '"': { a: "ä", e: "ë", i: "ï", o: "ö", u: "ü", A: "Ä", E: "Ë", I: "Ï", O: "Ö", U: "Ü" },
};
function deLatex(s) {
  return String(s)
    .replace(/\{?\\(['`^~"])\{?([A-Za-z])\}?\}?/g, (m, ac, l) => (ACENTOS[ac] && ACENTOS[ac][l]) || l)
    .replace(/\{?\\c\s*\{?([cC])\}?\}?/g, (m, l) => (l === "c" ? "ç" : "Ç"))
    .replace(/\\(&|%|_|\$|#)/g, "$1");
}
function camposBib(corpo) {
  const campos = {}; let i = corpo.indexOf(","); if (i < 0) return campos; i++;
  while (i < corpo.length) {
    const eq = corpo.indexOf("=", i); if (eq < 0) break;
    const nome = corpo.slice(i, eq).replace(/^[,\s]+/, "").trim().toLowerCase();
    let j = eq + 1; while (j < corpo.length && /\s/.test(corpo[j])) j++;
    let val = "";
    if (corpo[j] === "{") { let d = 1; j++; const s = j; while (j < corpo.length && d > 0) { if (corpo[j] === "{") d++; else if (corpo[j] === "}") d--; j++; } val = corpo.slice(s, j - 1); }
    else if (corpo[j] === '"') { j++; const s = j; while (j < corpo.length && corpo[j] !== '"') j++; val = corpo.slice(s, j); j++; }
    else { const s = j; while (j < corpo.length && corpo[j] !== ",") j++; val = corpo.slice(s, j); }
    if (nome) campos[nome] = deLatex(val).replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
    const c = corpo.indexOf(",", j); if (c < 0) break; i = c + 1;
  }
  return campos;
}
function deBibTeX(txt, base) {
  const out = []; let i = 0;
  while ((i = txt.indexOf("@", i)) >= 0) {
    const abre = txt.indexOf("{", i); if (abre < 0) break;
    const tipo = txt.slice(i + 1, abre).trim().toLowerCase();
    let d = 1, j = abre + 1;
    while (j < txt.length && d > 0) { if (txt[j] === "{") d++; else if (txt[j] === "}") d--; j++; }
    const corpo = txt.slice(abre + 1, j - 1); i = j;
    if (["comment", "preamble", "string"].includes(tipo)) continue;
    const f = camposBib(corpo);
    if (!f.title && !f.author) continue;
    out.push(novaRef({
      autores: (f.author || "").replace(/\s+and\s+/gi, "; "), ano: (f.year || "").replace(/\D/g, "").slice(0, 4),
      titulo: f.title || "", veiculo: f.journal || f.booktitle || f.publisher || "", doi: f.doi || "",
      tipo: tipo === "article" ? "artigo" : tipo === "phdthesis" ? "tese" : tipo === "mastersthesis" ? "dissertação" : tipo === "inproceedings" ? "trabalho em evento" : tipo === "book" ? "livro" : tipo,
      resumo: f.abstract || "", link: f.url || "", base,
    }));
  }
  return out;
}
function deRIS(txt, base) {
  const out = []; let cur = null; const aut = [];
  const fechar = () => { if (cur) { cur.autores = aut.join("; ") || cur.autores; out.push(cur); } cur = null; aut.length = 0; };
  txt.split(/\r?\n/).forEach((ln) => {
    const m = ln.match(/^([A-Z][A-Z0-9])\s{1,2}-\s?(.*)$/); if (!m) return;
    const [, tag, val] = m;
    if (tag === "TY") { fechar(); cur = novaRef({ base, tipo: /JOUR/.test(val) ? "artigo" : /THES/.test(val) ? "tese" : /CONF/.test(val) ? "trabalho em evento" : /BOOK/.test(val) ? "livro" : "artigo" }); return; }
    if (!cur) return;
    if (tag === "AU" || tag === "A1") aut.push(val.trim());
    else if (tag === "TI" || tag === "T1") cur.titulo = val.trim();
    else if (tag === "PY" || tag === "Y1") cur.ano = val.replace(/\D/g, "").slice(0, 4);
    else if (tag === "JO" || tag === "JF" || tag === "T2") cur.veiculo = cur.veiculo || val.trim();
    else if (tag === "DO") cur.doi = val.trim();
    else if (tag === "AB") cur.resumo = val.trim();
    else if (tag === "UR") cur.link = val.trim();
    else if (tag === "ER") fechar();
  });
  fechar();
  return out.filter((r) => r.titulo || r.autores);
}
function novaRef(o = {}) {
  return { id: uid(), autores: "", ano: "", titulo: "", veiculo: "", base: "", tipo: "artigo", doi: "", link: "", resumo: "", notas: "", tags: "", etapa: "identificado", motivo: "", ...o };
}

// ---------- diagrama: layout e desenho ----------
const NB = String.fromCharCode(1); // sentinela: mantém o "(n = X)" inteiro na quebra de linha e vira espaço depois
const DW = 1000, BOXW = 380, BOXX = 180, EXX = 600, FS = 13, LH = 17, PADY = 11, WRAP = 52;

function layoutDiagrama(state, ct) {
  const sist = state.modo === "sistematica";
  const over = state.over || {};
  const caixa = (chave, rotuloPadrao, nPadrao, extras, lado, etapa) => {
    const o = over[chave] || {};
    const rotulo = o.rotulo != null ? o.rotulo : rotuloPadrao;
    const n = o.n != null && String(o.n).trim() !== "" ? o.n : nPadrao;
    // o "(n = X)" leva espaços rígidos para nunca quebrar longe do rótulo
    const linhas = [...wrapText(`${rotulo} (n${NB}=${NB}${n})`, WRAP), ...(extras || []).flatMap((e) => wrapText("· " + e, WRAP - 2))]
      .map((l) => l.split(NB).join(" "));
    return { chave, rotulo, n, linhas, lado, etapa, editado: o.rotulo != null || (o.n != null && String(o.n).trim() !== "") };
  };
  const passos = [];
  const basesTxt = ct.porBase.map(([b, n]) => `${b}: ${n}`);
  passos.push({
    esq: caixa("identificados", "Registros identificados nas bases", ct.identificados, sist ? basesTxt : [], "esq", "Identificação"),
    dir: ct.duplicados || sist ? caixa("duplicados", "Registros removidos antes da triagem — duplicados", ct.duplicados, [], "dir") : null,
  });
  if (sist) {
    passos.push({ esq: caixa("triados", "Registros triados (título e resumo)", ct.triados, [], "esq", "Triagem"), dir: caixa("ex_triagem", "Registros excluídos na triagem", ct.exTriagem, ct.motivosTriagem.map(([m, n]) => `${m}: ${n}`), "dir") });
    passos.push({ esq: caixa("buscados", "Textos completos buscados", ct.buscados, [], "esq"), dir: caixa("nao_rec", "Textos completos não recuperados", ct.naoRec, [], "dir") });
    passos.push({ esq: caixa("avaliados", "Textos completos avaliados para elegibilidade", ct.avaliados, [], "esq"), dir: caixa("ex_leitura", "Textos completos excluídos, com motivos", ct.exLeitura, ct.motivosLeitura.map(([m, n]) => `${m}: ${n}`), "dir") });
  } else {
    passos.push({ esq: caixa("triados", "Registros triados", ct.triados, [], "esq", "Triagem"), dir: caixa("ex_narrativa", "Registros excluídos", ct.exNarrativa, [], "dir") });
  }
  passos.push({ esq: caixa("incluidos", "Estudos incluídos na revisão", ct.incluidos, [], "esq", "Inclusão"), dir: null });

  let y = 54; const boxes = [];
  passos.forEach((p) => {
    const hE = p.esq.linhas.length * LH + PADY * 2;
    const hD = p.dir ? p.dir.linhas.length * LH + PADY * 2 : 0;
    const h = Math.max(hE, hD);
    boxes.push({ ...p.esq, x: BOXX, y, w: BOXW, h: hE });
    if (p.dir) boxes.push({ ...p.dir, x: EXX, y, w: BOXW, h: hD });
    y += h + 42;
  });
  return { boxes, altura: y - 42 + 30, sist };
}

function buildRevisaoInner(state, ct, { sel = null, withBg = true } = {}) {
  const { boxes, altura } = layoutDiagrama(state, ct);
  const o = [];
  if (withBg) o.push(`<rect x="0" y="0" width="${DW}" height="${altura}" fill="#ffffff"/>`);
  o.push(`<text x="${DW / 2}" y="26" font-size="14" font-weight="700" fill="#2b3a48" text-anchor="middle">${esc(state.modo === "sistematica" ? "Fluxo da seleção dos estudos (PRISMA)" : "Fluxo da seleção dos estudos")}</text>`);
  const esq = boxes.filter((b) => b.lado === "esq");
  // faixas de etapa à esquerda
  esq.forEach((b) => { if (b.etapa) o.push(`<text x="30" y="${b.y + b.h / 2}" font-size="12" font-weight="700" fill="#1f7a8c" text-anchor="middle" transform="rotate(-90 30 ${b.y + b.h / 2})">${esc(b.etapa)}</text>`); });
  // setas verticais e laterais
  esq.forEach((b, i) => {
    if (i < esq.length - 1) {
      const prox = esq[i + 1], x = b.x + b.w / 2, y1 = b.y + b.h, y2 = prox.y;
      o.push(`<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2 - 8}" stroke="#7a8b99" stroke-width="1.6"/>`);
      o.push(`<polygon points="${x},${y2} ${x - 5},${y2 - 9} ${x + 5},${y2 - 9}" fill="#7a8b99"/>`);
    }
    const par = boxes.find((z) => z.lado === "dir" && z.y === b.y);
    if (par) {
      const y = b.y + Math.min(b.h, par.h) / 2, x1 = b.x + b.w, x2 = par.x;
      o.push(`<line x1="${x1}" y1="${y}" x2="${x2 - 8}" y2="${y}" stroke="#7a8b99" stroke-width="1.6"/>`);
      o.push(`<polygon points="${x2},${y} ${x2 - 9},${y - 5} ${x2 - 9},${y + 5}" fill="#7a8b99"/>`);
    }
  });
  boxes.forEach((b) => {
    const dir = b.lado === "dir";
    const fill = dir ? "#fdf6f4" : "#f2f8f9";
    const stroke = b.chave === sel ? "#1f7a8c" : dir ? "#e0c4bd" : "#bcd5da";
    o.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="${b.chave === sel ? 2.6 : 1.4}"/>`);
    b.linhas.forEach((ln, i) => {
      const sub = ln.startsWith("· ");
      o.push(`<text x="${b.x + 14}" y="${b.y + PADY + LH * (i + 0.85)}" font-size="${sub ? FS - 1.5 : FS}" fill="${sub ? "#6b7c8a" : "#2b3a48"}">${esc(ln)}</text>`);
    });
    if (b.editado) o.push(`<circle cx="${b.x + b.w - 10}" cy="${b.y + 10}" r="3.5" fill="#b06a1f"><title>número ou rótulo editado à mão</title></circle>`);
  });
  return o.join("");
}
function buildRevisaoSVG(state, ct, opts = {}) {
  const { altura } = layoutDiagrama(state, ct);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DW} ${altura}" width="${DW}" height="${altura}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">${buildRevisaoInner(state, ct, opts)}</svg>`;
}

function dl(blob, name) { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500); }

const PROTOCOLO_CAMPOS = [
  ["pergunta", "Pergunta da revisão", "o que a revisão pretende responder", true],
  ["bases", "Bases consultadas", "ex.: Scopus, Web of Science, SciELO, BDTD", false],
  ["strings", "Estratégia de busca (strings)", "os termos e operadores usados em cada base", true],
  ["periodo", "Recorte temporal", "ex.: 2015–2025", false],
  ["idiomas", "Idiomas", "ex.: português, inglês e espanhol", false],
  ["inclusao", "Critérios de inclusão", "o que um estudo precisa ter para entrar", true],
  ["exclusao", "Critérios de exclusão", "o que faz um estudo sair", true],
  ["registro", "Registro do protocolo", "ex.: PROSPERO, OSF — se houver", false],
];

function RevisaoLiteratura({ active = true }) {
  const [state, setStateRaw] = useState(() => emptyRevisao());
  const [aba, setAba] = useState("refs"); // "refs" | "protocolo" | "diagrama"
  const [sel, setSel] = useState(null);       // referência selecionada
  const [selCaixa, setSelCaixa] = useState(null); // caixa do diagrama
  const [erroLocal, setErroLocal] = useState(null);
  const [filtro, setFiltro] = useState("");
  const [fEtapa, setFEtapa] = useState("");
  const [msg, setMsg] = useState("");
  const [past, setPast] = useState([]);
  const stateRef = useRef(state); useEffect(() => { stateRef.current = state; });
  const fileRef = useRef(null); const jsonRef = useRef(null); const svgRef = useRef(null);

  const aviso = (t) => { setMsg(t); setTimeout(() => setMsg(""), 4000); };
  const mut = useCallback((u) => { setPast((p) => [...p.slice(-40), JSON.stringify(stateRef.current)]); setStateRaw(u); }, []);
  const undo = useCallback(() => setPast((p) => { if (!p.length) return p; setStateRaw(JSON.parse(p[p.length - 1])); return p.slice(0, -1); }), []);

  useEffect(() => {
    SUITE.getRevisao = () => stateRef.current;
    SUITE.setRevisao = (d) => { if (d && Array.isArray(d.refs)) setStateRaw({ ...emptyRevisao(), ...d, protocolo: { ...emptyRevisao().protocolo, ...(d.protocolo || {}) } }); };
    return () => { SUITE.getRevisao = null; SUITE.setRevisao = null; };
  }, []);
  useEffect(() => { const t = setTimeout(() => { const r = salvarLocal("enlace_revisao_v1", JSON.stringify(state)); setErroLocal(r.ok ? null : r); }, 600); return () => clearTimeout(t); }, [state]);
  useEffect(() => { try { const s = window.localStorage.getItem("enlace_revisao_v1"); if (s) { const o = JSON.parse(s); if (o && Array.isArray(o.refs)) setStateRaw({ ...emptyRevisao(), ...o, protocolo: { ...emptyRevisao().protocolo, ...(o.protocolo || {}) } }); } } catch {} }, []);

  const ct = useMemo(() => contagens(state), [state]);
  const sist = state.modo === "sistematica";

  const setRef = (id, k, v) => setStateRaw((s) => ({ ...s, refs: s.refs.map((r) => (r.id === id ? { ...r, [k]: v } : r)) }));
  const addRef = () => { const r = novaRef(); mut((s) => ({ ...s, refs: [...s.refs, r] })); setSel(r.id); setAba("refs"); };
  const delRef = (id) => { mut((s) => ({ ...s, refs: s.refs.filter((r) => r.id !== id) })); if (sel === id) setSel(null); };
  const setProt = (k, v) => setStateRaw((s) => ({ ...s, protocolo: { ...s.protocolo, [k]: v } }));
  const setModo = (m) => mut((s) => ({ ...s, modo: m }));

  const marcarDuplicados = () => {
    const dupes = acharDuplicados(state.refs);
    if (!dupes.length) { aviso("nenhuma duplicata encontrada (comparei DOI e, na falta dele, título + ano)"); return; }
    mut((s) => ({ ...s, refs: s.refs.map((r) => (dupes.includes(r.id) ? { ...r, etapa: "duplicado" } : r)) }));
    aviso(`${dupes.length} duplicata(s) marcada(s)`);
  };

  const importar = (ev) => {
    const f = ev.target.files && ev.target.files[0]; if (!f) return;
    const base = f.name.replace(/\.[^.]+$/, "").slice(0, 40);
    const r = new FileReader();
    r.onload = () => {
      const txt = String(r.result);
      let novas = [];
      if (/\.bib$/i.test(f.name)) novas = deBibTeX(txt, base);
      else if (/\.ris$/i.test(f.name) || /^\s*TY\s{1,2}-/m.test(txt)) novas = deRIS(txt, base);
      else novas = deCSV(txt, base);
      if (!novas.length) { aviso("não consegui ler referências desse arquivo — confira se é CSV com cabeçalho, .bib ou .ris"); return; }
      const juntas = [...state.refs, ...novas];
      const dupes = acharDuplicados(juntas);
      mut(() => ({ ...state, refs: juntas.map((x) => (dupes.includes(x.id) ? { ...x, etapa: "duplicado" } : x)) }));
      aviso(`${novas.length} referência(s) importada(s) de "${base}"${dupes.length ? ` · ${dupes.length} duplicata(s) marcada(s)` : ""}`);
    };
    r.readAsText(f); ev.target.value = "";
  };

  const exportCSV = () => {
    const cab = ["autores", "ano", "titulo", "veiculo", "base", "tipo", "doi", "etapa", "motivo", "tags", "notas"];
    const linhas = [cab.join(";")];
    state.refs.forEach((r) => linhas.push(cab.map((k) => `"${String(r[k] == null ? "" : r[k]).replace(/"/g, '""')}"`).join(";")));
    dl(new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8" }), "revisao-referencias.csv");
  };
  const exportSVG = () => dl(new Blob([buildRevisaoSVG(state, ct)], { type: "image/svg+xml" }), "fluxo-revisao.svg");
  const exportPNG = () => {
    const svg = buildRevisaoSVG(state, ct); const { altura } = layoutDiagrama(state, ct); const img = new Image();
    img.onload = () => { const c = document.createElement("canvas"); c.width = DW * 2; c.height = altura * 2; const x = c.getContext("2d"); x.scale(2, 2); x.drawImage(img, 0, 0); c.toBlob((b) => b && dl(b, "fluxo-revisao.png")); };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  };
  const exportJSON = () => dl(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }), "revisao.json");
  const abrirJSON = (ev) => { const f = ev.target.files && ev.target.files[0]; if (!f) return; const rr = new FileReader(); rr.onload = () => { try { const o = JSON.parse(String(rr.result)); if (o && Array.isArray(o.refs)) mut(() => ({ ...emptyRevisao(), ...o })); } catch {} }; rr.readAsText(f); ev.target.value = ""; };

  const exportPDF = () => {
    const w = window.open("", "_blank"); if (!w) { try { window.alert("Permita pop-ups para gerar o relatório em PDF."); } catch {} return; }
    const svg = buildRevisaoSVG(state, ct).replace("<svg ", '<svg style="max-width:100%;height:auto" ');
    const prot = sist ? PROTOCOLO_CAMPOS.filter(([k]) => (state.protocolo[k] || "").trim()).map(([k, rot]) => `<p style="margin:6px 0"><b>${esc(rot)}:</b> ${esc(state.protocolo[k])}</p>`).join("") || "<p style='color:#888'>—</p>" : "";
    const lista = (etapa) => state.refs.filter((r) => r.etapa === etapa)
      .map((r) => `<li>${esc(r.autores || "—")} (${esc(r.ano || "s.d.")}). <b>${esc(r.titulo || "—")}</b>. ${esc(r.veiculo || "")}${r.doi ? ` DOI: ${esc(r.doi)}` : ""}${r.motivo ? ` <i>— ${esc(r.motivo)}</i>` : ""}</li>`).join("");
    const inc = lista("incluido") || "<li>—</li>";
    const exc = lista("excluido_leitura");
    const doc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Revisão de literatura</title><style>@media print{.noprint{display:none!important}}@page{margin:14mm}body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#2b3a48;margin:0}h2{font-size:15px;border-bottom:1px solid #e3e9ee;padding-bottom:4px;margin-top:22px}ul{font-size:13px;line-height:1.6}table{border-collapse:collapse;font-size:12.5px;margin-top:6px}th,td{border:1px solid #e3e9ee;padding:4px 8px}th{background:#f4f7f9;text-align:left}</style></head><body onload="setTimeout(function(){window.print()},300)"><div class="noprint" style="position:sticky;top:0;display:flex;gap:10px;align-items:center;background:#1f7a8c;color:#fff;padding:10px 16px">Relatório pronto. <button onclick="window.print()" style="border:none;background:#fff;color:#1f7a8c;font-weight:700;border-radius:6px;padding:6px 14px;cursor:pointer">Imprimir / Salvar como PDF</button><span style="font-size:12px;opacity:.85">escolha "Salvar como PDF" no destino</span></div><div style="max-width:1000px;margin:0 auto;padding:24px"><h1 style="font-size:20px">Revisão ${sist ? "sistemática" : "de literatura"}</h1><p style="color:#888;font-size:13px">${ct.identificados} registros identificados · ${ct.incluidos} estudos incluídos</p>${sist ? `<h2>Protocolo</h2>${prot}` : ""}<h2>Fluxo da seleção</h2><div style="border:1px solid #e3e9ee;border-radius:8px;padding:8px">${svg}</div><table><tbody><tr><th>Identificados</th><td>${ct.identificados}</td></tr><tr><th>Duplicados removidos</th><td>${ct.duplicados}</td></tr><tr><th>Triados</th><td>${ct.triados}</td></tr><tr><th>Excluídos na triagem</th><td>${ct.exTriagem}</td></tr>${sist ? `<tr><th>Textos buscados</th><td>${ct.buscados}</td></tr><tr><th>Não recuperados</th><td>${ct.naoRec}</td></tr><tr><th>Avaliados na íntegra</th><td>${ct.avaliados}</td></tr><tr><th>Excluídos na leitura</th><td>${ct.exLeitura}</td></tr>` : ""}<tr><th>Incluídos</th><td><b>${ct.incluidos}</b></td></tr></tbody></table><h2>Estudos incluídos (${ct.incluidos})</h2><ul>${inc}</ul>${exc ? `<h2>Excluídos na leitura, com motivo (${ct.exLeitura})</h2><ul>${exc}</ul>` : ""}${(state.protocolo.notas || "").trim() ? `<h2>Notas</h2><p style="font-size:13px">${esc(state.protocolo.notas)}</p>` : ""}</div></body></html>`;
    w.document.open(); w.document.write(doc); w.document.close();
  };

  // diagrama na tela
  const inner = useMemo(() => buildRevisaoInner(state, ct, { sel: selCaixa, withBg: false }), [state, ct, selCaixa]);
  const lay = useMemo(() => layoutDiagrama(state, ct), [state, ct]);
  useEffect(() => { if (aba === "diagrama" && svgRef.current) svgRef.current.innerHTML = inner; }, [inner, aba]);
  const onSvgClick = (e) => {
    const svg = svgRef.current; if (!svg) return;
    const r = svg.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * DW, y = (e.clientY - r.top) / r.height * lay.altura;
    const hit = lay.boxes.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    setSelCaixa(hit ? (selCaixa === hit.chave ? null : hit.chave) : null);
  };
  const setOver = (chave, k, v) => setStateRaw((s) => ({ ...s, over: { ...s.over, [chave]: { ...(s.over || {})[chave], [k]: v } } }));
  const limparOver = (chave) => setStateRaw((s) => { const o = { ...(s.over || {}) }; if (chave) delete o[chave]; return { ...s, over: chave ? o : {} }; });

  const refsFiltradas = useMemo(() => {
    const q = nrm(filtro);
    return state.refs.filter((r) => (!fEtapa || r.etapa === fEtapa) && (!q || nrm(`${r.autores} ${r.titulo} ${r.veiculo} ${r.tags} ${r.ano}`).includes(q)));
  }, [state.refs, filtro, fEtapa]);

  const mini = { padding: "6px 10px", fontSize: 12.5, border: "1px solid #cfd6dd", borderRadius: 6, cursor: "pointer", background: "#fff", color: "#34495e", fontWeight: 600 };
  const divi = { width: 1, height: 22, background: "#dde3e9" };
  const inp = { width: "100%", boxSizing: "border-box", padding: "6px 8px", border: "1px solid #cfd6dd", borderRadius: 5, fontSize: 13, fontFamily: "inherit" };
  const cell = { ...inp, padding: "4px 6px", fontSize: 12.5 };
  const th = { fontSize: 11, fontWeight: 700, color: "#5a6b7a", textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #dde3e9", whiteSpace: "nowrap" };
  const card = { background: "#fff", border: "1px solid #dde3e9", borderRadius: 8, padding: 14 };
  const lbl = { fontSize: 12, color: "#5a6b7a", display: "flex", alignItems: "center", gap: 4, margin: "10px 0 3px" };
  const abaBtn = (v) => ({ border: "none", padding: "5px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, background: aba === v ? "#1f7a8c" : "#fff", color: aba === v ? "#fff" : "#5a6b7a" });

  const selRef = sel ? state.refs.find((r) => r.id === sel) : null;
  const selBox = selCaixa ? lay.boxes.find((b) => b.chave === selCaixa) : null;

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#eef1f4", minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <AvisoArmazenamento erro={erroLocal} onSalvar={exportJSON} />
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", padding: "9px 12px", background: "#fff", borderBottom: "1px solid #dde3e9" }}>
        <strong style={{ fontSize: 15, marginRight: 4 }}>Revisão de literatura</strong>
        <div style={{ display: "flex", border: "1px solid #cfd6dd", borderRadius: 6, overflow: "hidden" }}>
          {[["narrativa", "Narrativa"], ["sistematica", "Sistemática"]].map(([v, l]) => (
            <button key={v} onClick={() => setModo(v)} style={{ border: "none", padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, background: state.modo === v ? "#2e7d4f" : "#fff", color: state.modo === v ? "#fff" : "#5a6b7a" }}>{l}</button>
          ))}
        </div>
        <Hint text="Narrativa: tabela e um fluxo enxuto. Sistemática: acrescenta o protocolo (pergunta, bases, strings, critérios) e o fluxo completo no formato PRISMA, com textos buscados, não recuperados e excluídos na leitura com motivos. As referências são as mesmas nos dois modos." />
        <span style={divi} />
        <div style={{ display: "flex", border: "1px solid #cfd6dd", borderRadius: 6, overflow: "hidden" }}>
          <button onClick={() => setAba("refs")} style={abaBtn("refs")}>Referências</button>
          {sist && <button onClick={() => setAba("protocolo")} style={abaBtn("protocolo")}>Protocolo</button>}
          <button onClick={() => setAba("diagrama")} style={abaBtn("diagrama")}>Diagrama</button>
        </div>
        <span style={divi} />
        <button style={mini} onClick={addRef}>+ Referência</button>
        <button style={mini} onClick={marcarDuplicados} title="compara DOI e, na falta dele, título + ano">Marcar duplicatas</button>
        <button style={mini} onClick={undo} disabled={!past.length} title="desfazer">↶</button>
        <Menu label="Importar" btnStyle={mini} title="importar referências das bases">
          {(close) => (<>
            <MenuItem onClick={() => { fileRef.current?.click(); close(); }}>Arquivo (.csv, .bib, .ris)…</MenuItem>
          </>)}
        </Menu>
        <Menu label="Exportar" btnStyle={mini} title="exportar tabela, figura e relatório">
          {(close) => (<>
            <MenuItem onClick={() => { exportPDF(); close(); }}>Relatório (PDF)</MenuItem>
            <MenuItem onClick={() => { exportCSV(); close(); }}>Referências (CSV)</MenuItem>
            <MenuItem onClick={() => { exportPNG(); close(); }}>Diagrama PNG</MenuItem>
            <MenuItem onClick={() => { exportSVG(); close(); }}>Diagrama SVG</MenuItem>
          </>)}
        </Menu>
        <Menu label="Projeto" btnStyle={mini} title="salvar, abrir, exemplo e limpar">
          {(close) => (<>
            <MenuItem onClick={() => { exportJSON(); close(); }}>Salvar (.json)</MenuItem>
            <MenuItem onClick={() => { jsonRef.current?.click(); close(); }}>Abrir (.json)</MenuItem>
            <MenuItem onClick={() => { mut(() => seedRevisao()); setSel(null); close(); }}>Carregar exemplo</MenuItem>
            <MenuItem danger onClick={() => { mut(() => emptyRevisao()); setSel(null); close(); }}>Limpar tudo</MenuItem>
          </>)}
        </Menu>
        <input ref={fileRef} type="file" accept=".csv,.bib,.ris,text/plain" onChange={importar} style={{ display: "none" }} />
        <input ref={jsonRef} type="file" accept="application/json,.json" onChange={abrirJSON} style={{ display: "none" }} />
        {msg && <span style={{ fontSize: 11.5, color: "#1f7a8c", fontWeight: 600 }}>{msg}</span>}
      </div>

      {/* faixa de contagens, sempre visível */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: "7px 14px", background: "#fafbfc", borderBottom: "1px solid #eef1f4", fontSize: 12, color: "#46555f" }}>
        {[["identificados", ct.identificados], ["duplicados", ct.duplicados], ["triados", ct.triados], ["excluídos na triagem", ct.exTriagem],
          ...(sist ? [["não recuperados", ct.naoRec], ["avaliados", ct.avaliados], ["excluídos na leitura", ct.exLeitura]] : []),
          ["incluídos", ct.incluidos]].map(([l, n]) => (
          <span key={l}>{l}: <b style={{ color: l === "incluídos" ? "#2e7d4f" : "#2b3a48" }}>{n}</b></span>
        ))}
        {ct.pendentes > 0 && <span style={{ color: "#b06a1f" }}>· {ct.pendentes} ainda em "Identificado" — defina a etapa para fechar o fluxo</span>}
      </div>

      {aba === "refs" && (
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ ...card, padding: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <input style={{ ...inp, maxWidth: 260 }} placeholder="buscar por autor, título, ano, tag…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
              <select style={{ ...inp, maxWidth: 210 }} value={fEtapa} onChange={(e) => setFEtapa(e.target.value)}>
                <option value="">todas as etapas</option>
                {ETAPAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <span style={{ fontSize: 11.5, color: "#9aa7b2" }}>{refsFiltradas.length} de {state.refs.length}</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={th}>Autores</th><th style={th}>Ano</th><th style={{ ...th, minWidth: 220 }}>Título</th>
                    <th style={th}>Veículo</th><th style={th}>Base</th><th style={th}>Etapa</th><th style={th}>Motivo</th><th style={th} />
                  </tr>
                </thead>
                <tbody>
                  {refsFiltradas.map((r) => {
                    const excl = /^excluido|nao_recuperado|duplicado/.test(r.etapa);
                    return (
                      <tr key={r.id} style={{ background: sel === r.id ? "#f2f8f9" : "transparent" }} onClick={() => setSel(r.id)}>
                        <td style={{ padding: "3px 6px" }}><input style={{ ...cell, minWidth: 130 }} value={r.autores} placeholder="Sobrenome, N." onChange={(e) => setRef(r.id, "autores", e.target.value)} /></td>
                        <td style={{ padding: "3px 6px" }}><input style={{ ...cell, width: 58 }} value={r.ano} onChange={(e) => setRef(r.id, "ano", e.target.value)} /></td>
                        <td style={{ padding: "3px 6px" }}><input style={cell} value={r.titulo} onChange={(e) => setRef(r.id, "titulo", e.target.value)} /></td>
                        <td style={{ padding: "3px 6px" }}><input style={{ ...cell, minWidth: 110 }} value={r.veiculo} onChange={(e) => setRef(r.id, "veiculo", e.target.value)} /></td>
                        <td style={{ padding: "3px 6px" }}><input style={{ ...cell, width: 100 }} value={r.base} onChange={(e) => setRef(r.id, "base", e.target.value)} /></td>
                        <td style={{ padding: "3px 6px" }}>
                          <select style={{ ...cell, width: 150, color: ETAPA_COR[r.etapa], fontWeight: 600 }} value={r.etapa} onChange={(e) => setRef(r.id, "etapa", e.target.value)}>
                            {ETAPAS.filter(([k]) => sist || (k !== "nao_recuperado" && k !== "excluido_leitura") || r.etapa === k).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: "3px 6px" }}>
                          {excl && r.etapa !== "duplicado"
                            ? <input style={{ ...cell, minWidth: 130 }} value={r.motivo} placeholder="motivo da exclusão" onChange={(e) => setRef(r.id, "motivo", e.target.value)} />
                            : <span style={{ fontSize: 11.5, color: "#c3ccd4" }}>—</span>}
                        </td>
                        <td style={{ padding: "3px 6px" }}><button style={{ ...mini, padding: "2px 7px", color: "#b3402f" }} onClick={(e) => { e.stopPropagation(); delRef(r.id); }} title="remover">✕</button></td>
                      </tr>
                    );
                  })}
                  {!refsFiltradas.length && <tr><td colSpan={8} style={{ padding: 14, fontSize: 12.5, color: "#9aa7b2" }}>Nenhuma referência {state.refs.length ? "com esse filtro" : "ainda — use + Referência, Importar ou Projeto ▾ · Carregar exemplo"}.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11, color: "#9aa7b2", marginTop: 8 }}>
              A etapa de cada referência é o que alimenta o diagrama. Importação: CSV com cabeçalho (Scopus, Web of Science, SciELO), <b>.bib</b> (BibTeX) ou <b>.ris</b> — a base recebe o nome do arquivo.
            </div>
          </div>

          {selRef && (
            <div style={{ ...card }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#5a6b7a" }}>Referência selecionada</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 220px" }}><label style={lbl}>DOI</label><input style={inp} value={selRef.doi} placeholder="10.xxxx/xxxxx" onChange={(e) => setRef(selRef.id, "doi", e.target.value)} /></div>
                <div style={{ flex: "1 1 220px" }}><label style={lbl}>Link</label><input style={inp} value={selRef.link} onChange={(e) => setRef(selRef.id, "link", e.target.value)} /></div>
                <div style={{ flex: "1 1 160px" }}><label style={lbl}>Tipo</label><input style={inp} value={selRef.tipo} placeholder="artigo, tese, capítulo…" onChange={(e) => setRef(selRef.id, "tipo", e.target.value)} /></div>
                <div style={{ flex: "1 1 160px" }}><label style={lbl}>Tags</label><input style={inp} value={selRef.tags} placeholder="separadas por ;" onChange={(e) => setRef(selRef.id, "tags", e.target.value)} /></div>
              </div>
              <label style={lbl}>Resumo</label>
              <textarea style={{ ...inp, minHeight: 60, resize: "vertical" }} value={selRef.resumo} onChange={(e) => setRef(selRef.id, "resumo", e.target.value)} />
              <label style={lbl}>Notas / extração de dados <Hint text="O que este estudo traz para a sua pergunta: método, contexto, resultados, limites." /></label>
              <textarea style={{ ...inp, minHeight: 70, resize: "vertical" }} value={selRef.notas} onChange={(e) => setRef(selRef.id, "notas", e.target.value)} />
            </div>
          )}
        </div>
      )}

      {aba === "protocolo" && sist && (
        <div style={{ padding: 12 }}>
          <div style={{ ...card, maxWidth: 820 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#5a6b7a" }}>Protocolo da revisão</div>
            <div style={{ fontSize: 12, color: "#7a8b99", marginTop: 4 }}>Escrito antes da busca, é o que torna a revisão reproduzível — e entra no relatório em PDF.</div>
            {PROTOCOLO_CAMPOS.map(([k, rot, ph, grande]) => (
              <div key={k}>
                <label style={lbl}>{rot}</label>
                {grande ? <textarea style={{ ...inp, minHeight: 54, resize: "vertical" }} value={state.protocolo[k] || ""} placeholder={ph} onChange={(e) => setProt(k, e.target.value)} />
                  : <input style={inp} value={state.protocolo[k] || ""} placeholder={ph} onChange={(e) => setProt(k, e.target.value)} />}
              </div>
            ))}
            <label style={lbl}>Notas</label>
            <textarea style={{ ...inp, minHeight: 50, resize: "vertical" }} value={state.protocolo.notas || ""} onChange={(e) => setProt("notas", e.target.value)} />
          </div>
        </div>
      )}

      {aba === "diagrama" && (
        <div style={{ display: "flex", gap: 12, padding: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 560px", minWidth: 320, ...card, padding: 8 }}>
            <svg ref={svgRef} viewBox={`0 0 ${DW} ${lay.altura}`} onClick={onSvgClick} style={{ width: "100%", height: "auto", display: "block", cursor: "pointer" }} />
            <div style={{ fontSize: 11, color: "#9aa7b2", marginTop: 6 }}>Os números vêm da etapa de cada referência na tabela. Clique numa caixa para trocar o rótulo ou fixar um número à mão — o ponto laranja marca as caixas editadas.</div>
          </div>
          <div style={{ flex: "0 1 300px", minWidth: 250, ...card }}>
            <label style={lbl}>Caixa a editar</label>
            <select style={inp} value={selCaixa || ""} onChange={(e) => setSelCaixa(e.target.value || null)}>
              <option value="">— escolha (ou clique no diagrama) —</option>
              {lay.boxes.map((b) => <option key={b.chave} value={b.chave}>{b.rotulo}</option>)}
            </select>
            {selBox ? (
              <div>
                <label style={lbl}>Rótulo</label>
                <textarea style={{ ...inp, minHeight: 50, resize: "vertical" }} value={selBox.rotulo} onChange={(e) => setOver(selBox.chave, "rotulo", e.target.value)} />
                <label style={lbl}>Número <Hint text="Deixe em branco para usar o valor calculado a partir da tabela de referências." /></label>
                <input style={inp} value={(state.over[selBox.chave] || {}).n != null ? state.over[selBox.chave].n : ""} placeholder={`calculado: ${selBox.n}`} onChange={(e) => setOver(selBox.chave, "n", e.target.value)} />
                <button style={{ ...mini, marginTop: 12 }} onClick={() => limparOver(selBox.chave)}>Recalcular esta caixa</button>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: "#7a8b99", lineHeight: 1.5, marginTop: 10 }}>Escolha uma caixa acima — ou clique nela no diagrama — para trocar o rótulo ou fixar o número à mão.</div>
            )}
            <div style={{ borderTop: "1px solid #eef1f4", marginTop: 14, paddingTop: 10 }}>
              <button style={mini} onClick={() => limparOver(null)} disabled={!Object.keys(state.over || {}).length}>Recalcular tudo a partir da tabela</button>
              {ct.pendentes > 0 && <div style={{ fontSize: 11.5, color: "#b06a1f", marginTop: 8 }}>{ct.pendentes} referência(s) ainda em "Identificado": o número de avaliados não fecha com incluídos + excluídos até você definir a etapa delas.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { RevisaoLiteratura, buildRevisaoSVG, seedRevisao, contagens, acharDuplicados, deBibTeX, deRIS, deCSV };
