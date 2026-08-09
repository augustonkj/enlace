import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { SUITE, useModalTrap } from "./lib.js";

/* ===== Módulo: Análise textual qualitativa (Codifica - Bardin / ATD) ===== */
const AnaliseQualitativa = (() => {

/*
  Codifica - análise qualitativa simples (tipo ATLAS, enxuto)
  Suporta o ciclo comum a Bardin (codificação > categorização > inferência)
  e à Análise Textual Discursiva de Moraes & Galiazzi (unitarização > categorização > metatexto).

  Fluxo: abrir/colar texto -> selecionar trecho -> aplicar código(s) ->
         agrupar códigos em categorias -> ver quantitativo -> escrever metatexto/inferência.
  Tudo é salvo automaticamente (persistência do artefato) e pode ser exportado em JSON.
*/

const PALETTE = [
  "#c0392b", "#e74c3c", "#d35400", "#e67e22", "#f39c12", "#b7950b",
  "#27ae60", "#2ecc71", "#16a085", "#1abc9c", "#2980b9", "#3498db",
  "#8e44ad", "#9b59b6", "#c2185b", "#e91e63", "#34495e", "#5d6d7e",
  "#7f8c8d", "#a04000", "#1e8449", "#6c3483",
];

const uid = () => Math.random().toString(36).slice(2, 9);
const STORE = {
  index: "qb:index",
  active: "qb:active",
  proj: (id) => "qb:p:" + id,
};

const STOPWORDS_PT = new Set(("a à às ao aos as o os e é são foi era ser estar este esta isso isto esse essa aquele aquela " +
  "de do da dos das em no na nos nas um uma uns umas com como por para per pelo pela pelos pelas que se sua seu suas seus " +
  "mais menos muito muita muitos muitas pouco pouca tem têm ter tinha havia há sobre entre até depois antes ainda também " +
  "já não sim ou nem mas porém contudo quando onde porque pois então assim cada todo toda todos todas outro outra outros outras " +
  "qual quais quem cujo cujas seja sejam fica ficar foram somos sou está estão estava estavam vai vão ia iam pode podem podia " +
  "deve devem lhe lhes me te nos vos eu tu ele ela nós vós eles elas meu minha minhas meus teu tua dele dela deles delas " +
  "isso aqui ali lá aí num numa dum duma desse dessa neste nesta nisso daquele daquela este aquilo coisa ter").split(/\s+/));

function dlBlob(blob, name) {
  const u = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500);
}
function exportSvgElement(svgEl, baseName, kind) {
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
  const wpx = (vb && vb.width) || svgEl.clientWidth || parseFloat(svgEl.getAttribute("width")) || 800;
  const hpx = (vb && vb.height) || svgEl.clientHeight || parseFloat(svgEl.getAttribute("height")) || 400;
  if (!clone.getAttribute("width")) clone.setAttribute("width", wpx);
  if (!clone.getAttribute("height")) clone.setAttribute("height", hpx);
  const xml = new XMLSerializer().serializeToString(clone);
  if (kind === "svg") {
    dlBlob(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }), baseName + ".svg");
    return;
  }
  const data = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
  const img = new Image();
  img.onload = () => {
    const scale = 2, canvas = document.createElement("canvas");
    canvas.width = wpx * scale; canvas.height = hpx * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, wpx, hpx);
    canvas.toBlob((b) => { if (b) dlBlob(b, baseName + ".png"); }, "image/png");
  };
  img.onerror = () => { try { window.alert("Não foi possível gerar o PNG."); } catch {} };
  img.src = data;
}
function rectsOverlap(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}
function buildWordCloud(words, W, H) {
  if (!words.length) return [];
  const max = words[0][1], min = words[words.length - 1][1];
  const cx = W / 2, cy = H / 2, placed = [];
  const sizeFor = (n) => { const t = max === min ? 1 : (n - min) / (max - min); return Math.round(13 + t * 40); };
  for (let wi = 0; wi < words.length; wi++) {
    const [word, n] = words[wi];
    const fs = sizeFor(n);
    const wpx = word.length * fs * 0.62 + 6, hpx = fs * 1.15;
    let ok = false;
    for (let t = 0; t < 1400 && !ok; t++) {
      const r = 2.2 * t * 0.45, ang = t * 0.4;
      const x = cx + r * Math.cos(ang) - wpx / 2;
      const y = cy + r * Math.sin(ang) - hpx / 2;
      if (x < 2 || y < 2 || x + wpx > W - 2 || y + hpx > H - 2) continue;
      const rect = { x, y, w: wpx, h: hpx };
      if (!placed.some((p) => rectsOverlap(p, rect))) { placed.push({ ...rect, word, fs, n, ci: wi }); ok = true; }
    }
  }
  return placed;
}

async function loadKey(key) {
  try {
    const r = await window.storage.get(key);
    return r ? JSON.parse(r.value) : null;
  } catch (e) {
    return null;
  }
}
async function saveKey(key, val) {
  try {
    await window.storage.set(key, JSON.stringify(val));
  } catch (e) {
    console.error("storage", e);
  }
}

function emptyProject(name = "Novo projeto") {
  return {
    id: uid(),
    name,
    docs: [{ id: "d1", name: "Documento 1", text: "", attrs: {} }], // corpus do projeto
    docAtual: "d1",
    atributos: [],    // nomes dos atributos declarados para os documentos
    codes: [],        // {id, name, color, desc}
    excerpts: [],     // {id, docId, start, end, text, codeIds:[], memo}
    categories: [],   // {id, name, tipo:'emergente'|'apriori', desc, codeIds:[]}
    metatexts: [],    // {id, title, categoryId|null, body}
    memos: [],        // {id, title, body, updated, alvo:{tipo,id}|null}
    wordExclude: [],  // palavras removidas da nuvem/frequentes
    updated: Date.now(),
  };
}

/* ---- corpus: helpers e migração do formato antigo (um texto por projeto) ----
   Projetos salvos antes desta versão têm project.text; viram um documento único,
   e os recortes sem docId passam a pertencer a ele. */
function migrarProjeto(p) {
  if (!p || typeof p !== "object") return p;
  const base = { atributos: [], memos: [], wordExclude: [] };
  if (Array.isArray(p.docs) && p.docs.length) {
    const docAtual = p.docs.some((d) => d.id === p.docAtual) ? p.docAtual : p.docs[0].id;
    const d0 = p.docs[0].id;
    return { ...base, ...p, docAtual, excerpts: (p.excerpts || []).map((e) => (e.docId ? e : { ...e, docId: d0 })) };
  }
  const doc = { id: "d1", name: p.name || "Documento 1", text: typeof p.text === "string" ? p.text : "", attrs: {} };
  const { text, ...resto } = p;
  return { ...base, ...resto, docs: [doc], docAtual: "d1", excerpts: (p.excerpts || []).map((e) => ({ ...e, docId: "d1" })) };
}
/* ---- PDF ----
   O pdf.js foi retirado de propósito: sozinho ele dobrava o tamanho do arquivo
   (de ~1,6 MB para ~3,3 MB), e este app existe para ser um arquivo único leve.
   O mapa de páginas (doc.paginas) continua no modelo: se um leitor de PDF leve
   entrar depois, a página de cada recorte volta a funcionar sem outra mudança. */
async function textoDePDF(buffer, nome) {
  try {
    window.alert("Este app não lê PDF (\"" + nome + "\") para se manter leve e abrir por duplo clique. Converta para .docx ou .txt e importe de novo.");
  } catch {}
  return { text: "", paginas: null };
}
// em que página do documento cai um deslocamento do texto
function paginaDoOffset(doc, off) {
  const ps = doc && doc.paginas;
  if (!ps || !ps.length) return null;
  const p = ps.find((x) => off >= x.inicio && off < x.fim);
  return p ? p.n : ps[ps.length - 1].n;
}
const docsDe = (p) => (p && Array.isArray(p.docs) ? p.docs : []);
const DOC_VAZIO = { id: "", name: "", text: "", attrs: {} };
const docAtualDe = (p) => docsDe(p).find((d) => d.id === (p && p.docAtual)) || docsDe(p)[0] || DOC_VAZIO;
const textoDe = (p) => docAtualDe(p).text || "";
const exDoDoc = (p, docId) => (p.excerpts || []).filter((e) => e.docId === docId);
const exDoAtual = (p) => exDoDoc(p, docAtualDe(p).id);
const textoTodo = (p) => docsDe(p).map((d) => d.text || "").join("\n\n");
const nomeDoc = (p, docId) => (docsDe(p).find((d) => d.id === docId) || {}).name || "—";

/* ---- REFI-QDA (.qdc / .qde) — intercâmbio com NVivo, MAXQDA e ATLAS.ti ----
   Exporta o projeto no formato do REFI-QDA Project 1.0: <Project> com
   <Users>, <CodeBook><Codes>, <Sources><TextSource> e, em cada fonte, os
   <PlainTextSelection> com startPosition/endPosition e <Coding>.
   Importa de volta o mesmo formato (e o .qdc, que traz só o livro de códigos).
   Referência: refi-qda.org — QDA-XML 1.0. */
const UUID_SEMENTE = "0123456789abcdef";
function guidDe(txt) {
  // GUID estável derivado do id interno: o mesmo projeto exportado duas vezes
  // mantém os mesmos identificadores, o que evita duplicar na reimportação.
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const s = String(txt || "");
  for (let i = 0; i < s.length; i++) { h1 = (h1 ^ s.charCodeAt(i)) * 16777619 >>> 0; h2 = (h2 + s.charCodeAt(i) * (i + 7)) >>> 0; }
  const hex = (n, len) => { let o = ""; for (let i = 0; i < len; i++) { o = UUID_SEMENTE[n & 15] + o; n = Math.floor(n / 16) + 7; } return o; };
  return `${hex(h1, 8)}-${hex(h2, 4)}-4${hex(h1 + 3, 3)}-a${hex(h2 + 5, 3)}-${hex(h1 * 3 + h2, 12)}`;
}
const xmlEsc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function corHex(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || "").trim());
  return m ? "#" + m[1].toUpperCase() : "#7A8B99";
}
function exportarREFI(project) {
  const p = migrarProjeto(project);
  const agora = new Date().toISOString();
  const codigos = (p.codes || []).map((c) => {
    const cats = (p.categories || []).filter((k) => (k.codeIds || []).includes(c.id)).map((k) => k.name);
    const desc = [c.desc, cats.length ? "Categorias: " + cats.join("; ") : ""].filter(Boolean).join(" — ");
    return `      <Code guid="${guidDe("code:" + c.id)}" name="${xmlEsc(c.name)}" isCodable="true" color="${corHex(c.color)}">${desc ? `\n        <Description>${xmlEsc(desc)}</Description>` : ""}\n      </Code>`;
  }).join("\n");
  const fontes = docsDe(p).map((d) => {
    const sel = exDoDoc(p, d.id).map((e) => {
      const cods = (e.codeIds || []).map((id) => `          <Coding guid="${guidDe("coding:" + e.id + ":" + id)}" creatingUser="${guidDe("user")}" creationDateTime="${agora}">\n            <CodeRef targetGUID="${guidDe("code:" + id)}"/>\n          </Coding>`).join("\n");
      const memo = (e.memo || "").trim() ? `\n          <Description>${xmlEsc(e.memo)}</Description>` : "";
      return `        <PlainTextSelection guid="${guidDe("sel:" + e.id)}" name="${xmlEsc((e.text || "").slice(0, 60))}" startPosition="${e.start | 0}" endPosition="${e.end | 0}" creatingUser="${guidDe("user")}" creationDateTime="${agora}">${memo}\n${cods}\n        </PlainTextSelection>`;
    }).join("\n");
    const attrs = Object.entries(d.attrs || {}).filter(([, v]) => String(v).trim())
      .map(([k, v]) => `${k}: ${v}`).join(" · ");
    const desc = attrs ? `\n        <Description>${xmlEsc(attrs)}</Description>` : "";
    return `      <TextSource guid="${guidDe("src:" + d.id)}" name="${xmlEsc(d.name)}" richTextPath="" plainTextPath="internal://${guidDe("src:" + d.id)}.txt" creatingUser="${guidDe("user")}" creationDateTime="${agora}">${desc}\n        <PlainTextContent>${xmlEsc(d.text || "")}</PlainTextContent>\n${sel}\n      </TextSource>`;
  }).join("\n");
  const paraNota = (m, rot) => `      <Note guid="${guidDe("note:" + m.id)}" name="${xmlEsc(m.title || rot)}" creatingUser="${guidDe("user")}" creationDateTime="${agora}">\n        <PlainTextContent>${xmlEsc(m.body || "")}</PlainTextContent>\n      </Note>`;
  const notas = [...(p.metatexts || []).map((m) => paraNota(m, "Metatexto")), ...(p.memos || []).map((m) => paraNota(m, "Memo"))].join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<Project xmlns="urn:QDA-XML:project:1.0" name="${xmlEsc(p.name || "Projeto")}" origin="Enlace" creatingUserGUID="${guidDe("user")}" creationDateTime="${agora}">
  <Users>
    <User guid="${guidDe("user")}" name="Pesquisador"/>
  </Users>
  <CodeBook>
    <Codes>
${codigos}
    </Codes>
  </CodeBook>
  <Sources>
${fontes}
  </Sources>${notas ? `\n  <Notes>\n${notas}\n  </Notes>` : ""}
</Project>`;
}
function importarREFI(xml, nomeArquivo) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) return null;
  const raiz = doc.documentElement;
  if (!raiz || !/^(Project|CodeBook)$/.test(raiz.localName)) return null;
  const pega = (el, nome) => [...el.getElementsByTagName("*")].filter((n) => n.localName === nome);
  const p = emptyProject((raiz.getAttribute("name") || nomeArquivo || "Projeto importado").slice(0, 60));
  // códigos (o .qdc traz só isto)
  const porGuid = {};
  pega(raiz, "Code").forEach((c, i) => {
    const id = uid();
    porGuid[c.getAttribute("guid")] = id;
    const d = pega(c, "Description")[0];
    p.codes.push({ id, name: c.getAttribute("name") || "código " + (i + 1), color: corHex(c.getAttribute("color")) || PALETTE[i % PALETTE.length], desc: d ? d.textContent.trim() : "" });
  });
  // fontes de texto e seus recortes
  const docs = [];
  pega(raiz, "TextSource").forEach((s, i) => {
    const conteudo = pega(s, "PlainTextContent")[0];
    const docId = uid();
    docs.push({ id: docId, name: s.getAttribute("name") || "Documento " + (i + 1), text: conteudo ? conteudo.textContent : "", attrs: {}, paginas: null });
    pega(s, "PlainTextSelection").forEach((sel) => {
      const ini = parseInt(sel.getAttribute("startPosition") || "0", 10);
      const fim = parseInt(sel.getAttribute("endPosition") || "0", 10);
      const codeIds = pega(sel, "CodeRef").map((r) => porGuid[r.getAttribute("targetGUID")]).filter(Boolean);
      if (!codeIds.length || !(fim > ini)) return;
      const texto = (conteudo ? conteudo.textContent : "").slice(ini, fim);
      const memo = pega(sel, "Description")[0];
      p.excerpts.push({ id: uid(), docId, start: ini, end: fim, text: texto, codeIds, memo: memo ? memo.textContent.trim() : "" });
    });
  });
  if (docs.length) { p.docs = docs; p.docAtual = docs[0].id; }
  pega(raiz, "Note").forEach((n) => {
    const c = pega(n, "PlainTextContent")[0];
    p.metatexts.push({ id: uid(), title: n.getAttribute("name") || "Nota", categoryId: null, body: c ? c.textContent : "" });
  });
  return p;
}

function exampleProject() {
  const text = `ENTREVISTA — Experiência de trabalho remoto
(participante: profissional, 34 anos; entrevista semiestruturada)

Entrevistador: Como foi para você começar a trabalhar de casa?
Participante: No começo foi confuso. Eu não tinha um espaço só para o trabalho, então usava a mesa da cozinha. A internet caía toda hora e eu perdia parte das reuniões, o que me deixava ansioso. Levei umas três semanas para criar uma rotina que funcionasse.

Entrevistador: E o contato com os colegas, como ficou?
Participante: Senti muita falta da convivência. Antes a gente resolvia as coisas no corredor, rápido. De casa, tudo virava mensagem ou reunião marcada, e eu me senti bastante isolado, principalmente nas primeiras semanas.

Entrevistador: Teve algum ponto positivo?
Participante: Sim, vários. Economizei o tempo do deslocamento, que antes eram duas horas por dia, e consegui organizar meu trabalho no meu próprio ritmo. Passei a almoçar com a minha família, coisa que não acontecia havia anos. Essa flexibilidade foi o que mais valorizei.

Entrevistador: E as dificuldades continuaram?
Participante: Algumas sim. Como o computador estava sempre ali, eu acabava trabalhando além da hora, respondendo mensagem à noite. Eram tarefas demais e eu passava o dia inteiro na tela. No fim de alguns meses eu estava exausto, mesmo gostando da liberdade que o modelo trouxe.

Entrevistador: Olhando para trás, o que você mudaria?
Participante: Eu definiria horários mais claros desde o início e combinaria com a equipe momentos fixos para conversar. O problema não foi o trabalho remoto em si, mas a falta de combinados.`;
  const codes = [
    { id: "c1", name: "Dificuldade técnica", color: PALETTE[0], desc: "internet, equipamento, espaço de trabalho" },
    { id: "c2", name: "Adaptação", color: PALETTE[2], desc: "criar rotina, ajustar-se ao novo modelo" },
    { id: "c3", name: "Isolamento", color: PALETTE[1], desc: "falta de convívio e troca informal" },
    { id: "c4", name: "Flexibilidade", color: PALETTE[3], desc: "tempo, deslocamento, família" },
    { id: "c5", name: "Autonomia", color: PALETTE[5], desc: "organizar o próprio trabalho" },
    { id: "c6", name: "Sobrecarga", color: PALETTE[6], desc: "excesso de jornada e de tela" },
  ];
  const mk = (id, sub, codeIds, memo = "") => { const start = text.indexOf(sub); return { id, start, end: start + sub.length, text: sub, codeIds, memo }; };
  const excerpts = [
    mk("e1", "A internet caía toda hora e eu perdia parte das reuniões", ["c1"], "problema de acesso"),
    mk("e2", "Levei umas três semanas para criar uma rotina", ["c2"]),
    mk("e3", "me senti bastante isolado, principalmente nas primeiras semanas", ["c3"]),
    mk("e4", "Economizei o tempo do deslocamento, que antes eram duas horas por dia", ["c4"]),
    mk("e5", "consegui organizar meu trabalho no meu próprio ritmo", ["c5"]),
    mk("e6", "Essa flexibilidade foi o que mais valorizei", ["c4"], "valor central para o participante"),
    mk("e7", "eu acabava trabalhando além da hora, respondendo mensagem à noite", ["c6"]),
    mk("e8", "Eram tarefas demais e eu passava o dia inteiro na tela", ["c6", "c1"], "sobrecarga ligada à tela"),
  ];
  const categories = [
    { id: "k1", name: "Desafios da transição", tipo: "emergente", desc: "o que dificultou a mudança para o remoto", codeIds: ["c1", "c2", "c3", "c6"] },
    { id: "k2", name: "Ganhos percebidos", tipo: "emergente", desc: "o que o participante passou a valorizar", codeIds: ["c4", "c5"] },
  ];
  const metatexts = [
    { id: "m1", title: "Desafios da transição", categoryId: "k1", body: "Os relatos descrevem uma transição inicialmente custosa para o trabalho remoto: problemas técnicos de acesso, a necessidade de construir uma rotina nova, a perda do convívio informal e, mais adiante, a sobrecarga ligada ao tempo de tela. Este é um rascunho de exemplo: substitua por sua própria interpretação, apoiada nos recortes." },
  ];
  return { id: uid(), name: "Exemplo: entrevista (trabalho remoto)", method: "conteudo", isExample: true, text, codes, excerpts, categories, metatexts, updated: Date.now() };
}
function exampleCodingB() {
  const base = exampleProject();
  const text = base.text;
  const codes = base.codes.map((c) => ({ ...c }));
  const mk = (id, sub, codeIds) => { const start = text.indexOf(sub); return { id, start: start < 0 ? 0 : start, end: start < 0 ? 0 : start + sub.length, text: sub, codeIds, memo: "" }; };
  // Codificador B: concorda na maior parte, com algumas diferenças realistas
  // (limites distintos, um recorte a menos, um código trocado e um recorte a mais).
  const excerpts = [
    mk("b1", "A internet caía toda hora e eu perdia parte das reuniões", ["c1"]),
    mk("b2", "Levei umas três semanas para criar uma rotina que funcionasse", ["c2"]), // limite maior que A
    mk("b3", "me senti bastante isolado", ["c3"]),                                       // limite menor que A
    mk("b4", "Economizei o tempo do deslocamento, que antes eram duas horas por dia", ["c4"]),
    mk("b5", "consegui organizar meu trabalho no meu próprio ritmo", ["c5"]),
    // (B não marcou "Essa flexibilidade foi o que mais valorizei")
    mk("b7", "eu acabava trabalhando além da hora, respondendo mensagem à noite", ["c6"]),
    mk("b8", "Eram tarefas demais e eu passava o dia inteiro na tela", ["c6"]),          // A usou c6+c1; B só c6
    mk("b9", "Senti muita falta da convivência", ["c3"]),                                 // recorte extra de B
  ];
  return { id: uid(), name: "Exemplo: codificador B (mesma entrevista)", method: "conteudo", text, codes, excerpts, categories: [], metatexts: [], updated: Date.now() };
}
// monta um projeto-exemplo a partir de definições compactas (trechos achados por indexOf)
function mkExample(method, name, text, codeDefs, exDefs, catDefs, metaDefs) {
  const codes = codeDefs.map((d, i) => ({ id: d[0], name: d[1], color: PALETTE[i % PALETTE.length], desc: d[2] || "" }));
  const mk = (id, sub, codeIds, memo = "") => { const start = text.indexOf(sub); return { id, start: start < 0 ? 0 : start, end: start < 0 ? 0 : start + sub.length, text: sub, codeIds, memo }; };
  const excerpts = exDefs.map((d) => mk(d[0], d[1], d[2], d[3] || ""));
  const categories = catDefs.map((d) => ({ id: d[0], name: d[1], tipo: d[2] || "emergente", desc: d[3] || "", codeIds: d[4] }));
  const metatexts = metaDefs.map((d) => ({ id: d[0], title: d[1], categoryId: d[2], body: d[3] }));
  return { id: uid(), name, method, isExample: true, text, codes, excerpts, categories, metatexts, updated: Date.now() };
}
// devolve um exemplo adequado ao método selecionado
function exampleFor(method) {
  if (method === "atd") return mkExample("atd", "Exemplo (ATD): aprender ciências",
    "RELATO — Aprender ciências por investigação\n\nAluno A: No começo eu achava que ciência era decorar fórmulas. Quando começamos a investigar problemas reais, percebi que precisava levantar hipóteses e testá-las. Errar passou a fazer parte do processo, e isso tirou o meu medo de participar.\n\nAluno B: O trabalho em grupo mudou tudo para mim. Discutir com os colegas me fez entender melhor do que ler sozinho. Às vezes a gente discordava, e era justamente aí que eu aprendia.",
    [["a1", "Ciência como memorização", "visão inicial"], ["a2", "Investigação", "hipóteses e testes"], ["a3", "Erro como aprendizagem"], ["a4", "Interação entre pares"]],
    [["x1", "ciência era decorar fórmulas", ["a1"]], ["x2", "precisava levantar hipóteses e testá-las", ["a2"]], ["x3", "Errar passou a fazer parte do processo", ["a3"]], ["x4", "Discutir com os colegas me fez entender melhor", ["a4"]], ["x5", "era justamente aí que eu aprendia", ["a3", "a4"]]],
    [["g1", "Mudança na visão de ciência", "emergente", "de memorizar para investigar", ["a1", "a2"]], ["g2", "Aprender com o outro e com o erro", "emergente", "", ["a3", "a4"]]],
    [["m1", "Metatexto", "g1", "As unidades reunidas mostram um deslocamento: da ciência como memorização para a ciência como investigação, em que o erro e a interação entre pares passam a ser constitutivos do aprender. (Exemplo — substitua pela sua interpretação.)"]]);
  if (method === "fenomenologia") return mkExample("fenomenologia", "Exemplo (Fenomenologia): ansiedade na prova",
    "RELATOS — A vivência da ansiedade antes da prova\n\nSujeito 1: Quando a prova se aproxima, sinto o corpo travar. O coração acelera e parece que o tempo encurta. Mesmo tendo estudado, bate a sensação de que vou esquecer tudo.\n\nSujeito 2: Para mim a ansiedade vem na véspera, à noite. Fico revendo a matéria sem conseguir parar, e o sono não vem. Depois que a prova começa, a tensão diminui.",
    [["u1", "Reação corporal"], ["u2", "Percepção do tempo"], ["u3", "Medo de esquecer"], ["u4", "Antecipação noturna"], ["u5", "Alívio ao iniciar"]],
    [["x1", "sinto o corpo travar", ["u1"]], ["x2", "parece que o tempo encurta", ["u2"]], ["x3", "vou esquecer tudo", ["u3"]], ["x4", "a ansiedade vem na véspera, à noite", ["u4"]], ["x5", "Depois que a prova começa, a tensão diminui", ["u5"]]],
    [["g1", "Corpo e tempo na ansiedade", "emergente", "", ["u1", "u2"]], ["g2", "Antes e durante a prova", "emergente", "", ["u3", "u4", "u5"]]],
    [["m1", "Síntese", "g1", "A ansiedade antes da prova mostra-se como uma experiência do corpo e do tempo: o corpo se tensiona e o tempo parece encurtar, antecipando um fracasso temido. A vivência concentra-se no 'antes' e se dissolve quando a prova começa. (Exemplo — substitua pela sua síntese.)"]]);
  if (method === "discurso") return mkExample("discurso", "Exemplo (Discurso): campanha ambiental",
    "TEXTO — Campanha sobre meio ambiente\n\n\"Cada um de nós é responsável pelo planeta. Pequenas atitudes do dia a dia fazem a diferença: feche a torneira, recicle o lixo, economize energia. O futuro está em suas mãos.\"",
    [["d1", "Responsabilização individual"], ["d2", "Solução no cotidiano"], ["d3", "Apelo imperativo"]],
    [["x1", "Cada um de nós é responsável pelo planeta", ["d1"]], ["x2", "Pequenas atitudes do dia a dia fazem a diferença", ["d2"]], ["x3", "O futuro está em suas mãos", ["d3", "d1"]]],
    [["g1", "Deslocamento da responsabilidade para o indivíduo", "emergente", "a solução é posta no sujeito, não nas estruturas", ["d1", "d2", "d3"]]],
    [["m1", "Interpretação", "g1", "O texto mobiliza uma formação discursiva que desloca a responsabilidade ambiental para o indivíduo ('cada um', 'suas mãos'), silenciando agentes estruturais (Estado, indústria). As condições de produção — campanhas de consumo consciente — naturalizam a solução individual. (Exemplo — substitua pela sua leitura.)"]]);
  if (method === "grounded") return mkExample("grounded", "Exemplo (Grounded): adoção de tecnologia",
    "NOTAS — Adoção de tecnologia por professores\n\nP1: No início eu resistia, achava que ia dar mais trabalho. Comecei a usar quando vi um colega economizando tempo na correção.\n\nP2: O que me convenceu foi o apoio da coordenação e um tempo para testar sem cobrança. Quando senti que dava conta, passei a propor coisas novas.",
    [["o1", "Resistência inicial"], ["o2", "Influência de pares"], ["o3", "Apoio institucional"], ["o4", "Tempo para experimentar"], ["o5", "Apropriação ativa"]],
    [["x1", "eu resistia, achava que ia dar mais trabalho", ["o1"]], ["x2", "Comecei a usar quando vi um colega economizando tempo", ["o2"]], ["x3", "o apoio da coordenação", ["o3"]], ["x4", "um tempo para testar sem cobrança", ["o4"]], ["x5", "passei a propor coisas novas", ["o5"]]],
    [["g1", "Condições que favorecem a adoção", "emergente", "", ["o2", "o3", "o4"]], ["g2", "Da resistência à apropriação", "emergente", "trajetória do professor", ["o1", "o5"]]],
    [["m1", "Teoria (cod. seletiva)", "g1", "Categoria central: a adoção de tecnologia emerge como um processo gradual e apoiado. A resistência inicial é vencida quando se combinam influência de pares, apoio institucional e tempo para experimentar, levando o professor da resistência à apropriação ativa. (Exemplo — substitua pela sua teorização.)"]]);
  if (method === "narrativas") return mkExample("narrativas", "Exemplo (Narrativas): como me tornei professora",
    "NARRATIVA — Como me tornei professora\n\nSempre brinquei de dar aula quando criança, enfileirando bonecas. Na adolescência, uma professora de português me marcou pelo jeito de explicar. Prestei vestibular para Letras meio sem certeza. No estágio, ao ver um aluno entender uma poesia pela primeira vez, soube que era aquilo. Hoje, depois de dez anos, ainda me emociono no primeiro dia de aula.",
    [["n1", "Origem na infância"], ["n2", "Modelo inspirador"], ["n3", "Escolha incerta"], ["n4", "Momento de virada"], ["n5", "Identidade consolidada"]],
    [["x1", "brinquei de dar aula quando criança", ["n1"]], ["x2", "uma professora de português me marcou", ["n2"]], ["x3", "Prestei vestibular para Letras meio sem certeza", ["n3"]], ["x4", "ao ver um aluno entender uma poesia pela primeira vez, soube que era aquilo", ["n4"]], ["x5", "ainda me emociono no primeiro dia de aula", ["n5"]]],
    [["g1", "Enredo de vocação", "emergente", "", ["n1", "n2", "n4"]], ["g2", "Dúvida e confirmação", "emergente", "", ["n3", "n5"]]],
    [["m1", "Interpretação", "g1", "A narrativa organiza-se como um enredo de vocação: sinais na infância, um modelo inspirador e uma escolha incerta que se confirma num momento de virada (o aluno que compreende a poesia), consolidando a identidade docente. (Exemplo — substitua pela sua interpretação.)"]]);
  if (method === "bourdieu") return mkExample("bourdieu", "Exemplo (Bourdieu): escolha do curso superior",
    "ENTREVISTA — A escolha do curso superior\n\nEstudante 1: Na minha casa todo mundo é formado, meu pai é engenheiro e minha mãe professora. Desde criança tinha livro em casa e a gente ia ao teatro, então quando cheguei no ensino médio já era natural que eu fosse fazer faculdade — a dúvida era qual, não se eu iria. Meu pai conhecia um professor da universidade que me explicou como era o curso.\n\nEstudante 2: Eu sou o primeiro da família a chegar na universidade. Meus pais trabalharam a vida toda e sempre disseram que estudo é o que ninguém tira da gente, mas ninguém sabia me explicar como funcionava. Escolhi o curso que dava para pagar e que tinha aula à noite, porque eu trabalho durante o dia. No começo eu me sentia deslocado, achava que falava errado perto dos outros e ficava calado nos seminários. Depois entendi que o que faltava não era capacidade, era saber as regras que os outros já traziam de casa.",
    [["p1", "Capital cultural herdado", "livros, teatro, diploma dos pais"], ["p2", "Capital social", "rede de contatos que informa e abre portas"], ["p3", "Capital econômico", "restrição material na escolha"], ["p4", "Habitus familiar", "o que é 'natural' esperar"], ["p5", "Violência simbólica", "sentir-se em falta diante da norma legítima"], ["p6", "Estratégia de reprodução"], ["p7", "Trajetória ascendente"]],
    [["x1", "Na minha casa todo mundo é formado", ["p1", "p4"]],
     ["x2", "tinha livro em casa e a gente ia ao teatro", ["p1"]],
     ["x3", "já era natural que eu fosse fazer faculdade — a dúvida era qual, não se eu iria", ["p4", "p6"]],
     ["x4", "Meu pai conhecia um professor da universidade que me explicou como era o curso", ["p2"]],
     ["x5", "Eu sou o primeiro da família a chegar na universidade", ["p7"]],
     ["x6", "Escolhi o curso que dava para pagar e que tinha aula à noite", ["p3"]],
     ["x7", "achava que falava errado perto dos outros e ficava calado nos seminários", ["p5"]],
     ["x8", "o que faltava não era capacidade, era saber as regras que os outros já traziam de casa", ["p5", "p1"]]],
    [["g1", "Capital herdado e naturalização do destino escolar", "apriori", "o diploma como continuidade, não como conquista", ["p1", "p2", "p4", "p6"]],
     ["g2", "Restrição material e trajetória improvável", "apriori", "a escolha possível dentro do que a condição permite", ["p3", "p7"]],
     ["g3", "Violência simbólica", "apriori", "a cultura dominante vivida como incompetência pessoal", ["p5"]]],
    [["m1", "Interpretação", "g1", "As duas falas não descrevem duas escolhas, mas duas posições. Para o Estudante 1, a universidade aparece como prolongamento do habitus familiar: o capital cultural herdado (livros, teatro, diploma dos pais) e o capital social (o professor conhecido) tornam o destino escolar tão evidente que a única dúvida é qual curso — a estratégia de reprodução opera sem precisar ser enunciada. Para o Estudante 2, a mesma instituição exige um capital que ele não herdou; a restrição econômica define o curso possível (noturno, pagável) e a distância entre o habitus de origem e a norma escolar é vivida como falta pessoal ('falava errado'), forma exemplar de violência simbólica — até que ele a reconhece como regra do jogo, e não como incapacidade. (Exemplo — substitua pela sua interpretação.)"]]);
  const p = exampleProject(); // conteudo / livre usam a entrevista de trabalho remoto
  if (method === "livre") { p.method = "livre"; p.name = "Exemplo: entrevista (trabalho remoto)"; }
  return p;
}
const QHELP = [
  { h: "O que é", items: ["Módulo de análise qualitativa de texto. Apoia o ciclo da Análise de Conteúdo (Bardin: codificação > categorização > inferência) e da Análise Textual Discursiva (Moraes e Galiazzi: unitarização > categorização > metatexto)."] },
  { h: "Fluxo geral", items: ["1) Na aba Documentos, importe os textos do corpus (.txt, .docx) — vários de uma vez, se quiser. 2) Selecione um trecho e aplique um ou mais códigos; o livro de códigos vale para todos os documentos. 3) Agrupe os códigos em categorias. 4) Na aba Consultas, recupere os recortes de todo o corpus e compare grupos de documentos. 5) Veja o quantitativo (frequências, nuvem de palavras). 6) Escreva o metatexto/inferência. 7) Se houver dois codificadores, confira a concordância na aba Confiabilidade."] },
  { h: "As abas", items: [
    ["Codificação", "o texto fica à esquerda; selecione um trecho e marque com códigos (cores). Cada trecho marcado é um recorte (unidade de análise). Aqui também se renomeia e se mescla códigos."],
    ["Categorias", "crie categorias e associe códigos a elas. Categoria emergente nasce dos dados; a priori vem da teoria."],
    ["Quantitativo", "frequência de cada código e categoria, co-ocorrências, palavras frequentes e nuvem de palavras (com exportação em PNG/SVG)."],
    ["Rede", "os códigos como grafo: o tamanho do círculo é o número de recortes e a espessura da ligação é quantas vezes dois códigos foram aplicados ao mesmo recorte. Clicar num código ou numa ligação mostra as citações por trás — não é um desenho à parte, é a sua codificação vista de outro ângulo."],
    ["Memos", "o diário da análise: por que um código nasceu, mudou de nome ou foi dividido. Cada memo pode se vincular a um código ou documento, e todos entram no relatório em PDF e no .qde."],
    ["Confiabilidade", "compara duas codificações do mesmo texto e calcula a concordância entre codificadores (kappa de Cohen)."],
    ["Metatexto", "onde se escreve a interpretação: inferência (Bardin) ou metatexto descritivo-interpretativo (Moraes e Galiazzi). Pode vincular a uma categoria."],
  ] },
  { h: "Importar texto e buscar", items: [
    ["Importar documentos", "pela aba Documentos ou pelo botão no cabeçalho do texto: .txt e .docx (Word). Cada arquivo vira um documento do corpus e o nome do arquivo vira o nome dele — importar NÃO substitui nem apaga o que já foi codificado."],
    ["Buscar", "o campo de busca destaca as ocorrências no texto; use ‹ › (ou Enter / Shift+Enter) para navegar e ✕ para limpar."],
  ] },
  { h: "Códigos e recortes", items: [
    "Um código é um rótulo com cor e descrição. Um recorte pode receber vários códigos. Use o memo para anotar por que aquele trecho foi marcado.",
    ["Renomear", "clique no nome do código na lista (aba Codificação) e edite."],
    ["Mesclar", "em MESCLAR CÓDIGOS, escolha 'de' um código 'em' outro: os recortes do primeiro passam a usar o segundo e o primeiro é removido."],
  ] },
  { h: "Quantitativo, nuvem e exportação", items: [
    ["Palavras frequentes", "as 30 palavras mais frequentes do texto, ignorando palavras vazias (artigos, preposições etc.) e com menos de 3 letras."],
    ["Excluir palavras", "use o × na palavra (ou o campo 'excluir palavra') para tirar termos que não interessam à nuvem, como 'entrevistador' ou 'participante'. O ↺ restaura. As exclusões ficam salvas no projeto."],
    ["Nuvem de palavras", "gerada a partir das palavras frequentes; exporte em PNG ou SVG."],
    ["Exportar gráficos", "o gráfico de frequência por código e a nuvem têm botões PNG/SVG (SVG é vetorial, ideal para artigo)."],
  ] },
  { h: "Confiabilidade entre codificadores", items: [
    ["Como usar", "as duas codificações precisam ser dos mesmos documentos (pareados pelo nome, com texto idêntico). A é o projeto atual; escolha B em outro projeto ou abrindo um .json. O botão 'carregar exemplo (A e B)' mostra uma demonstração pronta."],
    ["O que calcula", "kappa de Cohen, concordância observada (Po), esperada por acaso (Pe) e a concordância por código. Os códigos dos dois são pareados pelo nome."],
    ["Referência", "Cohen (1960); bandas de interpretação de Landis e Koch (1977)."],
  ] },
  { h: "Salvar e compartilhar", items: [
    ["Salvar / Abrir", "guarda o projeto em .json (documentos, atributos, códigos, recortes, categorias, metatextos)."],
    ["REFI-QDA (.qde)", "o botão .qde exporta no formato de intercâmbio REFI-QDA, que NVivo, MAXQDA e ATLAS.ti abrem; o botão Abrir aceita .qde e .qdc de volta. Serve para não ficar preso a nenhum programa — inclusive a este."],
    ["Salvar Enlace", "no topo do programa, salva e restaura num único arquivo o trabalho das duas ferramentas (diagrama + análise textual)."],
    ["Compartilhar", "gera um HTML do projeto para leitura."],
    ["Relatório", "documento com o texto codificado, os códigos, as categorias e os metatextos."],
    ["Exemplo", "carrega um projeto pronto (trabalho remoto) já codificado, para ver como tudo funciona."],
  ] },
  { h: "Salvamento", items: ["O trabalho é salvo automaticamente no navegador. Para levar a outro computador, use Salvar (.json) ou Salvar Enlace (backup completo)."] },
];

// ---- confiabilidade entre codificadores (kappa de Cohen) ----
// Unidade de análise: caractere. Cada caractere recebe o rótulo do código que o
// cobre (primeiro recorte que o cobre); sem cobertura = "—". Os códigos dos dois
// codificadores são pareados pelo NOME (minúsculas).
// Referência: Cohen, J. (1960). A coefficient of agreement for nominal scales.
// Educational and Psychological Measurement, 20(1), 37-46. Bandas de interpretação:
// Landis, J. R., & Koch, G. G. (1977). Biometrics, 33(1), 159-174.
function coderCharLabels(project, doc) {
  const text = (doc && doc.text) || "";
  const labels = new Array(text.length).fill(null);
  const byId = {}; ((project && project.codes) || []).forEach((c) => { byId[c.id] = c; });
  for (const ex of exDoDoc(project, doc.id)) {
    const cid = (ex.codeIds && ex.codeIds[0]) || null;
    const code = cid ? byId[cid] : null;
    const name = code ? (code.name || "").trim().toLowerCase() : "";
    if (!name) continue;
    const s = Math.max(0, ex.start | 0), e = Math.min(text.length, ex.end | 0);
    for (let i = s; i < e; i++) if (labels[i] == null) labels[i] = name;
  }
  return labels.map((l) => (l == null ? "—" : l));
}
function interCoderKappa(projA, projB) {
  // pareia os documentos dos dois codificadores pelo nome; com um documento de
  // cada lado, pareia direto. Só entram os pares cujo texto é idêntico.
  const A = migrarProjeto(projA), B = migrarProjeto(projB);
  const da = docsDe(A), db = docsDe(B);
  const pares = [];
  if (da.length === 1 && db.length === 1) pares.push([da[0], db[0]]);
  else da.forEach((x) => {
    const y = db.find((z) => (z.name || "").trim().toLowerCase() === (x.name || "").trim().toLowerCase());
    if (y) pares.push([x, y]);
  });
  const usados = pares.filter(([x, y]) => (x.text || "").length > 0 && x.text === y.text);
  if (!usados.length) return { sameText: false };
  const a = [], b = [];
  usados.forEach(([x, y]) => {
    const la = coderCharLabels(A, x), lb = coderCharLabels(B, y);
    for (let i = 0; i < la.length; i++) { a.push(la[i]); b.push(lb[i]); }
  });
  const n = a.length;
  const nDocs = usados.length;
  const cats = Array.from(new Set([...a, ...b]));
  const countA = {}, countB = {};
  let agree = 0, unionCoded = 0, unionAgree = 0;
  const perCode = {}; cats.forEach((c) => { if (c !== "—") perCode[c] = { both: 0, aOnly: 0, bOnly: 0 }; });
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    if (x === y) agree++;
    countA[x] = (countA[x] || 0) + 1; countB[y] = (countB[y] || 0) + 1;
    if (x !== "—" || y !== "—") { unionCoded++; if (x === y) unionAgree++; }
    if (x !== "—" && x === y) perCode[x].both++;
    else { if (x !== "—") perCode[x].aOnly++; if (y !== "—") perCode[y].bOnly++; }
  }
  const po = n ? agree / n : 0;
  let pe = 0; for (const c of cats) pe += ((countA[c] || 0) / n) * ((countB[c] || 0) / n);
  const kappa = pe < 1 ? (po - pe) / (1 - pe) : 1;
  const poUnion = unionCoded ? unionAgree / unionCoded : 0;
  return {
    sameText: true, n, nDocs, po, pe, kappa, poUnion, unionCoded, perCode,
    codesA: Object.keys(countA).filter((c) => c !== "—"),
    codesB: Object.keys(countB).filter((c) => c !== "—"),
  };
}
function kappaBand(k) {
  if (k < 0) return "pobre (poor)";
  if (k <= 0.20) return "leve (slight)";
  if (k <= 0.40) return "razoável (fair)";
  if (k <= 0.60) return "moderada (moderate)";
  if (k <= 0.80) return "substancial (substantial)";
  return "quase perfeita (almost perfect)";
}

function parseJSON(text) {
  const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    const m = clean.match(/[\[{][\s\S]*[\]}]/);
    if (m) {
      try { return JSON.parse(m[0]); } catch (e2) { return null; }
    }
    return null;
  }
}

// ---- segmentação do texto para destaque + mapeamento de offset ----
function buildSegments(text, excerpts) {
  const pts = new Set([0, text.length]);
  excerpts.forEach((e) => { pts.add(e.start); pts.add(e.end); });
  const sorted = [...pts].filter((p) => p >= 0 && p <= text.length).sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i], en = sorted[i + 1];
    if (s === en) continue;
    const covering = excerpts.filter((e) => e.start <= s && e.end >= en);
    segs.push({ start: s, end: en, text: text.slice(s, en), covering });
  }
  if (segs.length === 0 && text.length > 0) segs.push({ start: 0, end: text.length, text, covering: [] });
  return segs;
}

function absOffset(node, offset) {
  let el = node.nodeType === 3 ? node.parentElement : node;
  while (el && !(el.dataset && el.dataset.start != null)) el = el.parentElement;
  if (!el) return null;
  const base = parseInt(el.dataset.start, 10);
  if (node.nodeType === 3) return base + offset;
  return base;
}

function escapeHTML(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// gera um HTML autocontido (somente leitura) que abre em qualquer navegador
function buildStandaloneHTML(project, opts = {}) {
  const MET = METHODS[(project && project.method) || "livre"] || METHODS.livre;
  const codeMap = Object.fromEntries(project.codes.map((c) => [c.id, c]));
  // um bloco por documento do corpus, cada um com o próprio texto codificado
  const marcar = (segs) => segs.map((seg) => {
    const c0 = seg.covering[0] ? codeMap[seg.covering[0].codeIds[0]] : null;
    const names = seg.covering.flatMap((e) => e.codeIds.map((id) => codeMap[id]?.name)).filter(Boolean).join(", ");
    const style = c0 ? `background:${c0.color}33;border-bottom:2px solid ${c0.color};` : "";
    const title = names ? ` title="${escapeHTML(names)}"` : "";
    return `<span style="${style}border-radius:2px"${title}>${escapeHTML(seg.text)}</span>`;
  }).join("");
  const docs = docsDe(project);
  const varios = docs.length > 1;
  const textHTML = docs.map((d) => {
    const corpo = marcar(buildSegments(d.text || "", exDoDoc(project, d.id)));
    const attrs = Object.entries(d.attrs || {}).filter(([, v]) => String(v).trim());
    const cab = varios
      ? `<h3 style="margin:18px 0 4px;font-size:15px;border-bottom:1px solid #e3e9ee;padding-bottom:3px">${escapeHTML(d.name)} <span style="font-weight:400;color:#999;font-size:12px">(${exDoDoc(project, d.id).length} recortes${d.paginas ? ` · ${d.paginas.length} páginas` : ""})</span></h3>`
        + (attrs.length ? `<div style="font-size:12px;color:#777;margin-bottom:4px">${attrs.map(([k, v]) => `${escapeHTML(k)}: ${escapeHTML(v)}`).join(" · ")}</div>` : "")
      : "";
    return cab + corpo;
  }).join("");
  const codeRows = project.codes.map((c) => {
    const n = project.excerpts.filter((e) => e.codeIds.includes(c.id)).length;
    return `<li style="margin:3px 0"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${c.color};margin-right:6px;vertical-align:middle"></span>${escapeHTML(c.name)} <b>(${n})</b></li>`;
  }).join("");
  const catBlocks = project.categories.map((cat) => {
    const codes = project.codes.filter((c) => cat.codeIds.includes(c.id));
    const exs = project.excerpts.filter((e) => e.codeIds.some((id) => cat.codeIds.includes(id)));
    const chips = codes.map((c) => `<span style="background:${c.color};color:#fff;padding:2px 8px;border-radius:10px;font-size:12px;margin:2px;display:inline-block">${escapeHTML(c.name)}</span>`).join("");
    return `<div style="margin-bottom:16px"><h3 style="margin:0 0 4px">${escapeHTML(cat.name)} <span style="font-weight:400;color:#999;font-size:13px">(${cat.tipo} · ${exs.length} recortes)</span></h3>${cat.desc ? `<p style="margin:0 0 6px;color:#555">${escapeHTML(cat.desc)}</p>` : ""}<div>${chips}</div></div>`;
  }).join("");
  const metaBlocks = project.metatexts.map((m) => `<div style="margin-bottom:18px"><h3 style="margin:0 0 6px">${escapeHTML(m.title)}</h3><p style="white-space:pre-wrap;line-height:1.7;margin:0">${escapeHTML(m.body)}</p></div>`).join("");
  const memoBlocks = (project.memos || []).filter((m) => (m.body || "").trim() || (m.title || "").trim()).map((m) => {
    const alvo = m.alvo && m.alvo.tipo === "codigo" ? (codeMap[m.alvo.id] || {}).name
      : m.alvo && m.alvo.tipo === "documento" ? nomeDoc(project, m.alvo.id) : "";
    return `<div style="margin-bottom:14px"><h3 style="margin:0 0 3px;font-size:14px">${escapeHTML(m.title || "Memo")}${alvo ? ` <span style="font-weight:400;color:#999;font-size:12px">(${escapeHTML(alvo)})</span>` : ""}</h3><p style="white-space:pre-wrap;line-height:1.6;margin:0;font-size:13px">${escapeHTML(m.body || "")}</p></div>`;
  }).join("");
  const stamp = new Date().toLocaleDateString("pt-BR");
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(project.name)}</title>
<style>@media print{.noprint{display:none!important}}@page{margin:18mm}</style></head>
<body style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#2b3a48;background:#ffffff;margin:0"${opts.print ? ' onload="setTimeout(function(){window.print()},300)"' : ""}>
${opts.print ? `<div class="noprint" style="position:sticky;top:0;display:flex;gap:10px;align-items:center;background:#1f7a8c;color:#fff;padding:10px 16px;font-family:system-ui">Relatório pronto. <button onclick="window.print()" style="border:none;background:#fff;color:#1f7a8c;font-weight:700;border-radius:6px;padding:6px 14px;cursor:pointer">Imprimir / Salvar como PDF</button><span style="font-size:12px;opacity:.85">escolha "Salvar como PDF" no destino da impressão</span></div>` : ""}
<div style="max-width:880px;margin:0 auto;padding:34px 24px">
<h1 style="margin:0 0 4px">${escapeHTML(project.name)}</h1>
<p style="font-family:system-ui;color:#888;font-size:13px;margin:0 0 24px">${escapeHTML(MET.name)} · ${project.excerpts.length} recortes · ${project.codes.length} códigos · ${project.categories.length} categorias · exportado em ${stamp}</p>
<h2 style="border-bottom:1px solid #e3e9ee;padding-bottom:4px">Texto (${escapeHTML(MET.tabs.codificacao)})</h2>
<div style="font-size:16px;line-height:1.9;white-space:pre-wrap;background:#fff;padding:20px;border:1px solid #e3e9ee;border-radius:6px">${textHTML || "<i>(sem texto)</i>"}</div>
<h2 style="border-bottom:1px solid #e3e9ee;padding-bottom:4px;margin-top:28px">Códigos</h2>
<ul style="font-family:system-ui;font-size:14px;list-style:none;padding:0">${codeRows || "<li>—</li>"}</ul>
<h2 style="border-bottom:1px solid #e3e9ee;padding-bottom:4px;margin-top:28px">${escapeHTML(MET.tabs.categorias)}</h2>${catBlocks || "<p>—</p>"}
<h2 style="border-bottom:1px solid #e3e9ee;padding-bottom:4px;margin-top:28px">${escapeHTML(MET.tabs.metatexto)}</h2>${metaBlocks || "<p>—</p>"}${memoBlocks ? `<h2 style="border-bottom:1px solid #e3e9ee;padding-bottom:4px;margin-top:28px">Memos da análise</h2>${memoBlocks}` : ""}
</div></body></html>`;
}

// Métodos de análise qualitativa: cada um adapta a terminologia das abas e traz seu passo a passo.
const METHODS = {
  livre: {
    name: "Análise livre / genérica",
    desc: "Fluxo geral de análise qualitativa, sem amarrar a uma abordagem específica: codifique trechos, agrupe em categorias e escreva a interpretação.",
    steps: ["Codificar trechos do texto", "Agrupar os códigos em categorias", "Quantitativo (opcional)", "Escrever a interpretação"],
    tabs: { codificacao: "Codificação", categorias: "Categorias", quantitativo: "Quantitativo", confiabilidade: "Confiabilidade", metatexto: "Metatexto" },
    show: ["codificacao", "categorias", "quantitativo", "confiabilidade", "metatexto"],
    catHint: "Crie categorias e associe códigos a elas. Emergentes nascem dos dados; a priori vêm da teoria.",
    metaHint: "Escreva aqui a interpretação, apoiada nos recortes.",
  },
  conteudo: {
    name: "Análise de Conteúdo (Bardin)",
    desc: "Análise sistemática das mensagens em três polos: pré-análise, exploração do material e tratamento dos resultados (inferência). As categorias podem ser a priori (vindas da teoria) ou emergentes (dos dados).",
    steps: ["Pré-análise: ler e organizar o material", "Exploração: recortar unidades e marcar com códigos", "Categorização: agrupar códigos em categorias", "Tratamento e inferência: quantitativo + interpretação"],
    tabs: { codificacao: "Codificação", categorias: "Categorias", quantitativo: "Quantitativo", confiabilidade: "Confiabilidade", metatexto: "Inferência" },
    show: ["codificacao", "categorias", "quantitativo", "confiabilidade", "metatexto"],
    ref: "Bardin, L. Análise de conteúdo.",
    catHint: "Categorias a priori (da teoria) ou emergentes (dos dados); a frequência por categoria alimenta a inferência.",
    metaHint: "Escreva a inferência: o que os dados, à luz da teoria e do contexto, permitem concluir.",
  },
  atd: {
    name: "Análise Textual Discursiva (Moraes & Galiazzi)",
    desc: "Processo auto-organizado em três momentos: unitarização (desmontar o texto em unidades de significado), categorização (agrupamento emergente) e captação do novo emergente (o metatexto).",
    steps: ["Unitarização: fragmentar o texto em unidades de significado", "Categorização: agrupar as unidades em categorias emergentes", "Metatexto: comunicar o novo compreendido"],
    tabs: { codificacao: "Unitarização", categorias: "Categorias", quantitativo: "Quantitativo", confiabilidade: "Confiabilidade", metatexto: "Metatexto" },
    show: ["codificacao", "categorias", "quantitativo", "metatexto"],
    ref: "Moraes, R.; Galiazzi, M. C. Análise textual discursiva.",
    catHint: "Categorias emergentes: agrupe as unidades de significado por semelhança, deixando o sistema emergir dos dados.",
    metaHint: "Escreva o metatexto: comunique o novo compreendido a partir das categorias emergentes.",
  },
  fenomenologia: {
    name: "Fenomenologia",
    desc: "Busca a estrutura do fenômeno tal como é vivido. Destacam-se unidades de significado nos relatos, faz-se a análise ideográfica (de cada sujeito) e a nomotética (convergências entre sujeitos), até a síntese da estrutura do fenômeno.",
    steps: ["Leitura dos relatos em atitude fenomenológica", "Unidades de significado: destacar trechos significativos", "Análise ideográfica: agrupar em categorias abertas", "Análise nomotética e síntese: convergências → estrutura"],
    tabs: { codificacao: "Unidades de significado", categorias: "Categorias abertas", quantitativo: "Convergências", confiabilidade: "Confiabilidade", metatexto: "Síntese" },
    show: ["codificacao", "categorias", "metatexto"],
    ref: "Ex.: Giorgi; Bicudo (fenomenologia na pesquisa qualitativa).",
    catHint: "Categorias abertas (análise ideográfica): agrupe as unidades de significado buscando convergências entre os sujeitos.",
    metaHint: "Escreva a síntese: a estrutura do fenômeno tal como se mostrou nas convergências entre os sujeitos.",
  },
  discurso: {
    name: "Análise de Discurso",
    desc: "Analisa não o conteúdo em si, mas como os sentidos são produzidos: recortes discursivos, formações discursivas e as condições de produção (histórico-ideológicas) do discurso.",
    steps: ["Constituir o corpus discursivo", "Recortes discursivos: destacar sequências significativas", "Formações discursivas: agrupar por regularidades de sentido", "Interpretação: sentidos, posições e condições de produção"],
    tabs: { codificacao: "Recortes discursivos", categorias: "Formações discursivas", quantitativo: "Quantitativo", confiabilidade: "Confiabilidade", metatexto: "Interpretação" },
    show: ["codificacao", "categorias", "metatexto"],
    ref: "Ex.: Pêcheux; Orlandi (análise de discurso).",
    catHint: "Formações discursivas: agrupe os recortes por regularidades de sentido (não por frequência).",
    metaHint: "Interprete os sentidos e as formações discursivas, considerando as condições de produção e as posições do sujeito.",
  },
  grounded: {
    name: "Teoria Fundamentada (Grounded Theory)",
    desc: "Constrói teoria a partir dos dados por níveis de codificação: aberta (rotular incidentes), axial (relacionar categorias) e seletiva (integrar em torno de uma categoria central).",
    steps: ["Codificação aberta: rotular incidentes nos dados", "Codificação axial: relacionar e agrupar categorias", "Codificação seletiva: integrar em torno da categoria central", "Teoria: articular as relações entre categorias"],
    tabs: { codificacao: "Codificação aberta", categorias: "Codificação axial", quantitativo: "Quantitativo", confiabilidade: "Confiabilidade", metatexto: "Teoria (cod. seletiva)" },
    show: ["codificacao", "categorias", "metatexto"],
    ref: "Ex.: Glaser & Strauss; Charmaz (grounded theory).",
    catHint: "Codificação axial: relacione e agrupe os códigos abertos em categorias mais densas.",
    metaHint: "Articule a teoria emergente: a categoria central e suas relações com as demais categorias.",
  },
  narrativas: {
    name: "Análise de Narrativas",
    desc: "Toma as narrativas como unidade de análise: identifica unidades narrativas, organiza enredos e temas e interpreta os sentidos e recorrências das histórias contadas.",
    steps: ["Ler as narrativas como totalidades", "Unidades narrativas: destacar episódios/sequências", "Temas e enredos: agrupar por recorrências", "Interpretação: sentidos e recorrências das histórias"],
    tabs: { codificacao: "Unidades narrativas", categorias: "Temas / enredos", quantitativo: "Quantitativo", confiabilidade: "Confiabilidade", metatexto: "Interpretação" },
    show: ["codificacao", "categorias", "metatexto"],
    ref: "Ex.: Clandinin & Connelly; Riessman (pesquisa narrativa).",
    catHint: "Temas / enredos: agrupe as unidades narrativas por recorrências e por enredos.",
    metaHint: "Interprete as narrativas: enredos, sentidos atribuídos e recorrências entre as histórias.",
  },
  bourdieu: {
    name: "Análise praxiológica (Bourdieu)",
    desc: "Lê as práticas como produto da relação entre o habitus (disposições incorporadas na trajetória), o capital (econômico, cultural, social e simbólico) e o campo (espaço de posições em disputa). Não se trata de interpretar o que o sujeito diz, mas de objetivar a posição de onde ele fala — e as disposições que essa posição produz. A sub-aba Campo permite mapear o espaço social dos agentes deste mesmo estudo.",
    steps: ["Objetivar o campo: posições, capital específico em disputa e regras do jogo", "Marcar no texto os indícios de capital, habitus e posição", "Agrupar em categorias praxiológicas (a priori, vindas da teoria)", "Interpretar: relacionar posição, disposições e práticas — sem cair no determinismo"],
    tabs: { codificacao: "Indícios (capital/habitus)", categorias: "Categorias praxiológicas", quantitativo: "Quantitativo", confiabilidade: "Confiabilidade", metatexto: "Interpretação" },
    show: ["codificacao", "categorias", "quantitativo", "metatexto"],
    ref: "Bourdieu, P. A distinção; O poder simbólico; Razões práticas; A reprodução (com Passeron).",
    catHint: "Categorias a priori vindas da teoria: capital econômico, cultural, social e simbólico, habitus, trajetória, estratégias de reprodução, violência simbólica, illusio e doxa.",
    metaHint: "Interprete relacionando a posição no campo, o volume e a estrutura do capital e as disposições do habitus. A pergunta é: de que posição social esta prática é possível — e o que ela reproduz ou subverte?",
  },
};
const METHOD_ORDER = ["livre", "conteudo", "atd", "fenomenologia", "discurso", "grounded", "narrativas", "bourdieu"];

// as abas Documentos e Consultas existem em todos os métodos (não mudam de nome)
Object.values(METHODS).forEach((m) => {
  m.tabs = { corpus: "Documentos", recuperacao: "Consultas", rede: "Rede", memos: "Memos", ...m.tabs };
  if (!m.show.includes("corpus")) m.show = ["corpus", ...m.show];
  if (!m.show.includes("rede")) {
    const j = m.show.indexOf("recuperacao");
    m.show = j >= 0 ? [...m.show.slice(0, j + 1), "rede", ...m.show.slice(j + 1)] : [...m.show, "rede"];
  }
  if (!m.show.includes("memos")) m.show = [...m.show, "memos"];
  if (!m.show.includes("recuperacao")) {
    const i = m.show.indexOf("categorias");
    m.show = i >= 0 ? [...m.show.slice(0, i + 1), "recuperacao", ...m.show.slice(i + 1)] : [...m.show, "recuperacao"];
  }
});


function App() {
  const [project, setProject] = useState(null);
  const [index, setIndex] = useState([]); // [{id,name}]
  const [tab, setTab] = useState("codificacao");
  const [showMethodInfo, setShowMethodInfo] = useState(false);
  const [cmpB, setCmpB] = useState(null);
  async function onPickB(id) {
    if (!id) { setCmpB(null); return; }
    try { const p = await loadKey(STORE.proj(id)); if (p) setCmpB(migrarProjeto(p)); } catch (e) {}
  }
  function onFileB(e) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { const o = parseJSON(String(r.result)); if (o && (typeof o.text === "string" || Array.isArray(o.docs))) setCmpB(migrarProjeto(o)); else { try { window.alert("Arquivo de projeto inválido."); } catch {} } };
    r.readAsText(f); e.target.value = "";
  }
  const [pending, setPending] = useState(null); // {start,end,text}
  const [selExcerpt, setSelExcerpt] = useState(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteVal, setPasteVal] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  useEffect(() => { if (!showHelp) return; const h = (e) => { if (e.key === "Escape") setShowHelp(false); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [showHelp]);
  const saveTimer = useRef(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const fileRef = useRef(null);
  const qHelpRef = useRef(null);

  // carregar na montagem
  useEffect(() => {
    (async () => {
      let idx = (await loadKey(STORE.index)) || [];
      let activeId = await loadKey(STORE.active);
      let proj = activeId ? await loadKey(STORE.proj(activeId)) : null;
      if (!proj) {
        proj = emptyProject("Projeto 1");
        idx = [{ id: proj.id, name: proj.name }];
        await saveKey(STORE.proj(proj.id), proj);
        await saveKey(STORE.index, idx);
        await saveKey(STORE.active, proj.id);
      }
      setIndex(idx);
      setProject(migrarProjeto(proj));
    })();
  }, []);

  // autosave
  useEffect(() => {
    if (!project) return;
    setSaving(true);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const p = { ...project, updated: Date.now() };
      await saveKey(STORE.proj(p.id), p);
      const idx = (await loadKey(STORE.index)) || [];
      const ni = idx.map((x) => (x.id === p.id ? { id: p.id, name: p.name } : x));
      if (!ni.find((x) => x.id === p.id)) ni.push({ id: p.id, name: p.name });
      setIndex(ni);
      await saveKey(STORE.index, ni);
      setSaving(false); setSavedAt(Date.now());
    }, 600);
  }, [project]);

  const update = useCallback((patch) => setProject((p) => {
    const np = (typeof patch === "function" ? patch(p) : patch) || {};
    const merged = { ...p, ...np };
    if ("text" in np) merged.isExample = false; // material próprio deixa de ser exemplo
    return merged;
  }), []);
  function chooseMethod(m) {
    if (project && project.isExample) {
      const ex = exampleFor(m); ex.id = project.id; ex.isExample = true; // troca o exemplo, mesmo "slot"
      setProject(migrarProjeto(ex)); setIndex((idx) => idx.map((x) => (x.id === ex.id ? { id: ex.id, name: ex.name } : x)));
      setPending(null); setSelExcerpt(null); setTab("codificacao");
    } else {
      update({ method: m });
    }
  }
  useEffect(() => {
    SUITE.getQual = async () => {
      let idx = [];
      try { idx = (await loadKey(STORE.index)) || []; } catch {}
      const projects = {};
      for (const it of idx) { try { const p = await loadKey(STORE.proj(it.id)); if (p) projects[it.id] = p; } catch {} }
      if (project) { projects[project.id] = project; if (!idx.find((x) => x.id === project.id)) idx = [...idx, { id: project.id, name: project.name }]; }
      let active = null; try { active = await loadKey(STORE.active); } catch {}
      return { index: idx, projects, active: active || (project && project.id) };
    };
    SUITE.setQual = async (data) => {
      if (!data || !data.projects) return;
      const idx = data.index || Object.values(data.projects).map((p) => ({ id: p.id, name: p.name }));
      for (const id in data.projects) { try { await saveKey(STORE.proj(id), data.projects[id]); } catch {} }
      try { await saveKey(STORE.index, idx); } catch {}
      const activeId = data.active && data.projects[data.active] ? data.active : (idx[0] && idx[0].id);
      if (activeId) { try { await saveKey(STORE.active, activeId); } catch {} const p = data.projects[activeId]; if (p) { setProject(migrarProjeto(p)); setIndex(idx); setPending(null); setSelExcerpt(null); } }
    };
    return () => { SUITE.getQual = null; SUITE.setQual = null; };
  }, [project]);

  // ---- projetos ----
  async function switchProject(id) {
    const p = await loadKey(STORE.proj(id));
    if (p) { setProject(migrarProjeto(p)); await saveKey(STORE.active, id); setPending(null); setSelExcerpt(null); }
  }
  async function newProject() {
    const p = emptyProject("Projeto " + (index.length + 1));
    await saveKey(STORE.proj(p.id), p);
    const ni = [...index, { id: p.id, name: p.name }];
    setIndex(ni); await saveKey(STORE.index, ni); await saveKey(STORE.active, p.id);
    setProject(p); setPending(null); setSelExcerpt(null);
  }
  async function loadExample() {
    const p = migrarProjeto(exampleFor((project && project.method) || "livre"));
    await saveKey(STORE.proj(p.id), p);
    const ni = [...index, { id: p.id, name: p.name }];
    setIndex(ni); await saveKey(STORE.index, ni); await saveKey(STORE.active, p.id);
    setProject(p); setPending(null); setSelExcerpt(null); setTab("codificacao");
  }
  async function loadReliabilityExample() {
    const p = migrarProjeto(exampleProject());
    await saveKey(STORE.proj(p.id), p);
    const ni = [...index, { id: p.id, name: p.name }];
    setIndex(ni); await saveKey(STORE.index, ni); await saveKey(STORE.active, p.id);
    setProject(p); setPending(null); setSelExcerpt(null);
    setCmpB(migrarProjeto(exampleCodingB())); setTab("confiabilidade");
  }
  function excludeWord(word) {
    const w = (word || "").toLowerCase();
    if (!w) return;
    update((p) => ({ wordExclude: [...new Set([...(p.wordExclude || []), w])] }));
  }
  function includeWord(word) {
    update((p) => ({ wordExclude: (p.wordExclude || []).filter((x) => x !== word) }));
  }
  async function deleteProject() {
    if (!confirm("Apagar este projeto? Esta ação não pode ser desfeita.")) return;
    const ni = index.filter((x) => x.id !== project.id);
    try { await window.storage.delete(STORE.proj(project.id)); } catch (e) {}
    if (ni.length === 0) { const p = emptyProject("Projeto 1"); await saveKey(STORE.proj(p.id), p); ni.push({ id: p.id, name: p.name }); }
    setIndex(ni); await saveKey(STORE.index, ni);
    await switchProject(ni[0].id);
  }

  // ---- corpus: acrescentar documentos (nunca substitui o que já foi codificado) ----
  function addDocs(novos) {
    const lista = (novos || []).filter((d) => d && typeof d.text === "string");
    if (!lista.length) return;
    update((p) => {
      const atual = docAtualDe(p);
      const soVazio = docsDe(p).length === 1 && !(atual.text || "").trim() && !(p.excerpts || []).length;
      const feitos = lista.map((d) => ({ id: uid(), name: d.name || "Documento", text: d.text, attrs: d.attrs || {}, paginas: d.paginas || null }));
      if (soVazio) { const docs = feitos.map((d, i) => (i === 0 ? { ...d, id: atual.id } : d)); return { docs, docAtual: docs[0].id }; }
      return { docs: [...docsDe(p), ...feitos], docAtual: feitos[0].id };
    });
    setPending(null); setSelExcerpt(null);
  }
  function onFile(e) {
    const arquivos = [...(e.target.files || [])];
    if (!arquivos.length) return;
    const lidos = new Array(arquivos.length);
    let faltam = arquivos.length;
    const pronto = (i, nome, texto, paginas) => { lidos[i] = { name: nome, text: texto, paginas: paginas || null }; if (--faltam === 0) addDocs(lidos.filter(Boolean)); };
    arquivos.forEach((f, i) => {
      const nome = (f.name || "documento").replace(/\.[^.]+$/, "");
      const r = new FileReader();
      if (/\.docx$/i.test(f.name) && typeof window !== "undefined" && window.mammoth) {
        r.onload = async () => {
          try { const out = await window.mammoth.extractRawText({ arrayBuffer: r.result }); pronto(i, nome, (out && out.value) || ""); }
          catch (err) { try { window.alert(`Não foi possível ler "${f.name}".`); } catch {} pronto(i, nome, ""); }
        };
        r.readAsArrayBuffer(f);
      } else if (/\.pdf$/i.test(f.name)) {
        r.onload = async () => { const o = await textoDePDF(r.result, f.name); pronto(i, nome, o.text, o.paginas); };
        r.readAsArrayBuffer(f);
      } else {
        r.onload = () => pronto(i, nome, String(r.result));
        r.readAsText(f);
      }
    });
    e.target.value = "";
  }
  function applyPaste() {
    addDocs([{ name: "Texto colado", text: pasteVal }]);
    setPasteMode(false); setPasteVal("");
  }
  function renameDoc(id, nome) { update((p) => ({ docs: docsDe(p).map((d) => (d.id === id ? { ...d, name: nome } : d)) })); }
  function removeDoc(id) {
    const n = exDoDoc(project, id).length;
    if (n) { let ok = true; try { ok = window.confirm(`Remover "${nomeDoc(project, id)}"? Os ${n} recortes feitos nele serão perdidos.`); } catch {} if (!ok) return; }
    update((p) => {
      const docs = docsDe(p).filter((d) => d.id !== id);
      const finais = docs.length ? docs : [{ id: uid(), name: "Documento 1", text: "", attrs: {} }];
      return { docs: finais, docAtual: finais[0].id, excerpts: (p.excerpts || []).filter((e) => e.docId !== id) };
    });
    setPending(null); setSelExcerpt(null);
  }
  function addMemo() {
    const m = { id: uid(), title: "Novo memo", body: "", alvo: null, updated: Date.now() };
    update((p) => ({ memos: [m, ...(p.memos || [])] }));
    return m.id;
  }
  function updateMemo(id, patch) { update((p) => ({ memos: (p.memos || []).map((m) => (m.id === id ? { ...m, ...patch, updated: Date.now() } : m)) })); }
  function removeMemo(id) { update((p) => ({ memos: (p.memos || []).filter((m) => m.id !== id) })); }
  function abrirDoc(id) { update({ docAtual: id }); setPending(null); setSelExcerpt(null); }
  function setAttr(docId, chave, valor) { update((p) => ({ docs: docsDe(p).map((d) => (d.id === docId ? { ...d, attrs: { ...(d.attrs || {}), [chave]: valor } } : d)) })); }
  function addAtributo(nome) {
    const n = (nome || "").trim(); if (!n) return;
    update((p) => ((p.atributos || []).includes(n) ? {} : { atributos: [...(p.atributos || []), n] }));
  }
  function removeAtributo(nome) {
    update((p) => ({ atributos: (p.atributos || []).filter((a) => a !== nome), docs: docsDe(p).map((d) => { const a = { ...(d.attrs || {}) }; delete a[nome]; return { ...d, attrs: a }; }) }));
  }

  // ---- seleção de trecho ----
  function onMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const a = absOffset(range.startContainer, range.startOffset);
    const b = absOffset(range.endContainer, range.endOffset);
    if (a == null || b == null) return;
    const s = Math.min(a, b), en = Math.max(a, b);
    if (en > s) { setPending({ start: s, end: en, text: textoDe(project).slice(s, en) }); setSelExcerpt(null); }
  }

  // ---- códigos ----
  function addCode(name) {
    const n = name.trim();
    if (!n) return null;
    const exist = project.codes.find((c) => c.name.toLowerCase() === n.toLowerCase());
    if (exist) return exist.id;
    const color = PALETTE[project.codes.length % PALETTE.length];
    const code = { id: uid(), name: n, color, desc: "" };
    update((p) => ({ codes: [...p.codes, code] }));
    return code.id;
  }
  function assignCode(codeId) {
    if (!pending || !codeId) return;
    update((p) => {
      const dAtual = docAtualDe(p).id;
      const same = p.excerpts.find((e) => e.docId === dAtual && e.start === pending.start && e.end === pending.end);
      if (same) {
        return { excerpts: p.excerpts.map((e) => e === same ? { ...e, codeIds: [...new Set([...e.codeIds, codeId])] } : e) };
      }
      const ex = { id: uid(), docId: docAtualDe(p).id, start: pending.start, end: pending.end, text: pending.text, codeIds: [codeId], memo: "" };
      return { excerpts: [...p.excerpts, ex] };
    });
    setPending(null);
    window.getSelection()?.removeAllRanges();
  }
  function removeCode(codeId) {
    const c = project.codes.find((x) => x.id === codeId);
    const n = project.excerpts.filter((e) => e.codeIds.includes(codeId)).length;
    if (n > 0) { let ok = true; try { ok = window.confirm(`Excluir o código "${c ? c.name : ""}"? Ele será removido de ${n} recorte(s).`); } catch {} if (!ok) return; }
    update((p) => ({
      codes: p.codes.filter((c) => c.id !== codeId),
      excerpts: p.excerpts.map((e) => ({ ...e, codeIds: e.codeIds.filter((c) => c !== codeId) })).filter((e) => e.codeIds.length > 0),
      categories: p.categories.map((cat) => ({ ...cat, codeIds: cat.codeIds.filter((c) => c !== codeId) })),
    }));
  }
  function renameCode(codeId, name) {
    update((p) => ({ codes: p.codes.map((c) => c.id === codeId ? { ...c, name } : c) }));
  }
  function setCodeColor(codeId, color) {
    update((p) => ({ codes: p.codes.map((c) => c.id === codeId ? { ...c, color } : c) }));
  }
  function mergeCode(fromId, intoId) {
    if (!fromId || !intoId || fromId === intoId) return;
    update((p) => ({
      codes: p.codes.filter((c) => c.id !== fromId),
      excerpts: p.excerpts.map((e) => e.codeIds.includes(fromId)
        ? { ...e, codeIds: [...new Set(e.codeIds.map((c) => c === fromId ? intoId : c))] } : e),
      categories: p.categories.map((cat) => ({ ...cat, codeIds: [...new Set(cat.codeIds.map((c) => c === fromId ? intoId : c))] })),
    }));
  }
  function removeExcerpt(id) {
    update((p) => ({ excerpts: p.excerpts.filter((e) => e.id !== id) }));
    if (selExcerpt === id) setSelExcerpt(null);
  }
  function setExcerptMemo(id, memo) {
    update((p) => ({ excerpts: p.excerpts.map((e) => e.id === id ? { ...e, memo } : e) }));
  }
  function toggleCodeOnExcerpt(exId, codeId) {
    update((p) => ({
      excerpts: p.excerpts.map((e) => e.id === exId
        ? { ...e, codeIds: e.codeIds.includes(codeId) ? e.codeIds.filter((c) => c !== codeId) : [...e.codeIds, codeId] }
        : e),
    }));
  }

  // ---- categorias ----
  function addCategory(name = "Nova categoria", tipo = "emergente") {
    update((p) => ({ categories: [...p.categories, { id: uid(), name, tipo, desc: "", codeIds: [] }] }));
  }
  function updateCategory(id, patch) {
    update((p) => ({ categories: p.categories.map((c) => c.id === id ? { ...c, ...patch } : c) }));
  }
  function removeCategory(id) {
    const c = project.categories.find((x) => x.id === id);
    let ok = true; try { ok = window.confirm(`Excluir a categoria "${c ? c.name : ""}"? Os códigos não são apagados, apenas desvinculados.`); } catch {}
    if (!ok) return;
    update((p) => ({ categories: p.categories.filter((c) => c.id !== id) }));
  }
  function clearProject() {
    const hasContent = textoTodo(project) || project.codes.length || project.excerpts.length || project.categories.length || project.metatexts.length;
    if (hasContent) { let ok = true; try { ok = window.confirm("Limpar este projeto? Texto, códigos, recortes, categorias e metatextos serão apagados (o nome é mantido)."); } catch {} if (!ok) return; }
    update(() => ({ text: "", codes: [], excerpts: [], categories: [], metatexts: [], wordExclude: [] }));
    setPending(null); setSelExcerpt(null); setTab("codificacao");
  }
  function toggleCodeInCategory(catId, codeId) {
    update((p) => ({
      categories: p.categories.map((c) => c.id === catId
        ? { ...c, codeIds: c.codeIds.includes(codeId) ? c.codeIds.filter((x) => x !== codeId) : [...c.codeIds, codeId] }
        : c),
    }));
  }

  // ---- metatexto ----
  function addMetatext(categoryId = null) {
    const cat = project.categories.find((c) => c.id === categoryId);
    const m = { id: uid(), title: cat ? cat.name : "Metatexto", categoryId, body: "" };
    update((p) => ({ metatexts: [...p.metatexts, m] }));
    return m.id;
  }
  function updateMetatext(id, patch) {
    update((p) => ({ metatexts: p.metatexts.map((m) => m.id === id ? { ...m, ...patch } : m) }));
  }
  function removeMetatext(id) {
    update((p) => ({ metatexts: p.metatexts.filter((m) => m.id !== id) }));
  }

  // ---- export / import ----
  function downloadFile(name, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  }
  function saveFile() {
    const base = (project.name || "projeto").replace(/\s+/g, "_");
    downloadFile(base + ".codifica.json", JSON.stringify(project, null, 2), "application/json");
  }
  function exportHTML() {
    const base = (project.name || "projeto").replace(/\s+/g, "_");
    downloadFile(base + ".html", buildStandaloneHTML(project), "text/html;charset=utf-8");
  }
  function exportQDE() {
    const base = (project.name || "projeto").replace(/\s+/g, "_");
    downloadFile(base + ".qde", exportarREFI(project), "application/xml;charset=utf-8");
  }
  function exportPDF() {
    const w = window.open("", "_blank");
    if (!w) { try { window.alert("Permita pop-ups para gerar o relatório em PDF."); } catch {} return; }
    w.document.open(); w.document.write(buildStandaloneHTML(project, { print: true })); w.document.close();
  }
  function exportReport() {
    const MR = METHODS[(project && project.method) || "livre"] || METHODS.livre;
    const lines = [];
    lines.push("# " + project.name + "\n");
    lines.push("_Método de análise: " + MR.name + "_\n");
    lines.push("**Passos:** " + MR.steps.map((s) => s.split(":")[0]).join(" → ") + "\n");
    if (MR.ref) lines.push("_Referência: " + MR.ref + "_\n");
    lines.push("## " + MR.tabs.categorias + "\n");
    project.categories.forEach((cat) => {
      lines.push(`### ${cat.name} (${cat.tipo})`);
      if (cat.desc) lines.push(cat.desc);
      const codes = project.codes.filter((c) => cat.codeIds.includes(c.id));
      codes.forEach((c) => {
        const exs = project.excerpts.filter((e) => e.codeIds.includes(c.id));
        lines.push(`- **${c.name}** (${exs.length})`);
        exs.slice(0, 50).forEach((e) => lines.push(`  > ${e.text.replace(/\n/g, " ").trim()}`));
      });
      lines.push("");
    });
    if (project.metatexts.length) {
      lines.push("## " + MR.tabs.metatexto + "\n");
      project.metatexts.forEach((m) => { lines.push(`### ${m.title}`); lines.push(m.body + "\n"); });
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = (project.name || "relatorio").replace(/\s+/g, "_") + ".md";
    a.click(); URL.revokeObjectURL(url);
  }
  function openFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    const ehREFI = /\.(qde|qdc|xml)$/i.test(f.name || "");
    r.onload = async () => {
      let p = null;
      if (ehREFI) {
        p = importarREFI(String(r.result), (f.name || "").replace(/\.[^.]+$/, ""));
        if (!p) { alert("Não consegui ler este arquivo REFI-QDA (.qde/.qdc)."); return; }
      } else {
        const obj = parseJSON(String(r.result));
        if (!obj || !(typeof obj.text === "string" || Array.isArray(obj.docs)) || !Array.isArray(obj.codes)) {
          alert("Arquivo inválido. Use um .codifica.json desta ferramenta ou um .qde/.qdc (REFI-QDA).");
          return;
        }
        p = migrarProjeto({ ...emptyProject(), ...obj, id: uid() });
      }
      await saveKey(STORE.proj(p.id), p);
      const ni = [...index, { id: p.id, name: p.name }];
      setIndex(ni); await saveKey(STORE.index, ni); await saveKey(STORE.active, p.id);
      setProject(p); setPending(null); setSelExcerpt(null);
    };
    r.readAsText(f);
    e.target.value = "";
  }

  // ---- derivados ----
  const codeMap = useMemo(() => Object.fromEntries((project?.codes || []).map((c) => [c.id, c])), [project]);
  const segments = useMemo(() => (project ? buildSegments(textoDe(project), exDoAtual(project)) : []), [project]);
  const codeFreq = useMemo(() => {
    if (!project) return [];
    return project.codes.map((c) => ({
      id: c.id, name: c.name, color: c.color,
      n: project.excerpts.filter((e) => e.codeIds.includes(c.id)).length,
    })).sort((a, b) => b.n - a.n);
  }, [project]);
  const catFreq = useMemo(() => {
    if (!project) return [];
    return project.categories.map((cat) => {
      const exs = project.excerpts.filter((e) => e.codeIds.some((id) => cat.codeIds.includes(id)));
      return { id: cat.id, name: cat.name, tipo: cat.tipo, codes: cat.codeIds.length, n: exs.length };
    });
  }, [project]);
  const cooc = useMemo(() => {
    if (!project) return [];
    const m = {};
    project.excerpts.forEach((e) => {
      const ids = [...new Set(e.codeIds)];
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const key = [ids[i], ids[j]].sort().join("|");
          m[key] = (m[key] || 0) + 1;
        }
    });
    return Object.entries(m).map(([k, n]) => { const [a, b] = k.split("|"); return { a, b, n }; }).sort((x, y) => y.n - x.n).slice(0, 12);
  }, [project]);

  useModalTrap(showHelp, qHelpRef, () => setShowHelp(false));

  if (!project) return <div style={{ padding: 40, fontFamily: "system-ui", color: "#5d4e42" }}>Carregando…</div>;

  const C = {
    paper: "#ffffff", ink: "#2b3a48", sub: "#6b7c8a", line: "#e3e9ee",
    panel: "#f7f9fb", accent: "#1f7a8c", accentSoft: "#e6eff3",
  };

  const method = (project && project.method) || "livre";
  const MET = METHODS[method] || METHODS.livre;
  const shown = MET.show || ["codificacao", "categorias", "quantitativo", "confiabilidade", "metatexto"];
  const TABS = shown.map((k) => [k, MET.tabs[k]]);
  const activeTab = shown.includes(tab) ? tab : shown[0]; // se a aba atual não existe neste método, cai na 1ª

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", color: C.ink, background: C.paper, height: "88vh", minHeight: 560, display: "flex", flexDirection: "column", borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: 8, gap: 12, padding: "10px 16px", borderBottom: `1px solid ${C.line}`, background: C.panel }}>
        <div style={{ fontWeight: 700, letterSpacing: 0.5, fontSize: 16, color: C.accent }}>Análise textual</div>
        <span style={{ fontSize: 11, color: C.sub, fontFamily: "system-ui" }}>análise qualitativa</span>
        <Btn onClick={loadExample}>Exemplo</Btn>
        <Btn onClick={() => setShowHelp(true)}>? Ajuda</Btn>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: saving ? C.sub : "#2e7d4f", fontFamily: "system-ui", minWidth: 78, textAlign: "right" }} title="o trabalho é salvo automaticamente no navegador">
          {saving ? "salvando…" : savedAt ? "✓ salvo " + new Date(savedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
        </span>
        <select value={project.id} onChange={(e) => switchProject(e.target.value)}
          style={{ fontFamily: "system-ui", fontSize: 12, padding: "4px 8px", border: `1px solid ${C.line}`, borderRadius: 4, background: "#fff" }}>
          {index.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input value={project.name} onChange={(e) => update({ name: e.target.value })}
          style={{ fontFamily: "system-ui", fontSize: 12, padding: "4px 8px", width: 130, border: `1px solid ${C.line}`, borderRadius: 4 }} />
        <label style={btnStyle(C)} title="abrir .codifica.json ou .qde/.qdc (REFI-QDA)">Abrir<input type="file" accept=".json,.qde,.qdc,.xml,application/json" onChange={openFile} style={{ display: "none" }} /></label>
        <Btn onClick={saveFile}>Salvar</Btn>
        <Btn onClick={exportQDE} title="exportar no formato REFI-QDA, que NVivo, MAXQDA e ATLAS.ti abrem">.qde</Btn>
        <Btn onClick={exportPDF}>Relatório PDF</Btn>
        <Btn onClick={newProject}>+ projeto</Btn>
        <Btn onClick={clearProject}>Limpar</Btn>
        <Btn onClick={deleteProject} danger>apagar</Btn>
      </div>
      {showHelp && (
        <div onClick={() => setShowHelp(false)} role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(20,30,38,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", zIndex: 1000 }}>
          <div ref={qHelpRef} onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 10, maxWidth: 700, width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,.25)", padding: "22px 26px", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: "#2b3a42" }}>Ajuda — Análise textual</h2>
              <button onClick={() => setShowHelp(false)} aria-label="fechar" style={{ border: "none", background: "#eef3f6", borderRadius: 6, width: 30, height: 30, cursor: "pointer", fontSize: 16, color: "#5a6b7a" }}>×</button>
            </div>
            <div style={{ fontSize: 12.5, color: "#7a8b99", marginBottom: 16 }}>Como fazer análise qualitativa de texto aqui. Pressione Esc para fechar.</div>
            {QHELP.map((sec, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1f7a8c", marginBottom: 6 }}>{sec.h}</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {sec.items.map((it, j) => (
                    <li key={j} style={{ fontSize: 13, color: "#3b4a52", lineHeight: 1.5, marginBottom: 3 }}>{Array.isArray(it) ? (<><b>{it[0]}:</b> {it[1]}</>) : it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* método de análise */}
      <div style={{ padding: "8px 16px", background: "#fbfcfd", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>Método de análise:</span>
          <select value={method} onChange={(e) => chooseMethod(e.target.value)}
            style={{ fontFamily: "system-ui", fontSize: 12.5, padding: "5px 8px", border: `1px solid ${C.line}`, borderRadius: 4, background: "#fff", fontWeight: 600, color: C.accent }}>
            {METHOD_ORDER.map((k) => <option key={k} value={k}>{METHODS[k].name}</option>)}
          </select>
          <span style={{ fontSize: 11.5, color: C.sub, flex: 1, minWidth: 160 }}>
            {MET.steps.map((s, i) => s.split(":")[0]).join("  →  ")}
          </span>
          <button onClick={() => setShowMethodInfo((v) => !v)} style={{ ...btnStyle(C), fontSize: 11.5, padding: "4px 9px" }}>{showMethodInfo ? "ocultar passos ▾" : "sobre o método ▸"}</button>
        </div>
        {showMethodInfo && (
          <div style={{ marginTop: 8, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ fontSize: 13, color: "#3b4a52", lineHeight: 1.5, marginBottom: 8, textAlign: "justify" }}>{MET.desc}</div>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {MET.steps.map((s, i) => <li key={i} style={{ fontSize: 12.5, color: "#46555f", lineHeight: 1.5, marginBottom: 2 }}>{s}</li>)}
            </ol>
            {MET.ref && <div style={{ marginTop: 8, fontSize: 11, color: C.sub, fontStyle: "italic" }}>{MET.ref}</div>}
            <div style={{ marginTop: 8, fontSize: 11, color: C.sub }}>As abas abaixo seguem a terminologia deste método; os dados são os mesmos se você trocar de método.</div>
          </div>
        )}
      </div>

      {/* tabs */}
      <div style={{ display: "flex", gap: 2, padding: "6px 16px 0", background: C.panel, borderBottom: `1px solid ${C.line}` }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            fontFamily: "system-ui", fontSize: 13, padding: "7px 14px", border: "none", cursor: "pointer",
            background: activeTab === k ? C.paper : "transparent", color: activeTab === k ? C.accent : C.sub,
            borderBottom: activeTab === k ? `2px solid ${C.accent}` : "2px solid transparent", fontWeight: activeTab === k ? 600 : 400,
            borderRadius: "4px 4px 0 0",
          }}>{label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        {activeTab === "corpus" && (
          <CorpusView {...{ project, C, addDocs, renameDoc, removeDoc, abrirDoc, setAttr, addAtributo, removeAtributo, onFile, setTab }} />
        )}
        {activeTab === "rede" && (
          <RedeView {...{ project, codeMap, C, abrirDoc, setTab }} />
        )}
        {activeTab === "memos" && (
          <MemosView {...{ project, C, addMemo, updateMemo, removeMemo, codeMap, abrirDoc, setTab }} />
        )}
        {activeTab === "recuperacao" && (
          <ConsultasView {...{ project, codeMap, C, abrirDoc, setTab }} />
        )}
        {activeTab === "codificacao" && (
          <CodificacaoView {...{ project, segments, codeMap, C, pending, setPending, selExcerpt, setSelExcerpt,
            addCode, assignCode, removeCode, renameCode, setCodeColor, mergeCode, removeExcerpt, setExcerptMemo, toggleCodeOnExcerpt,
            pasteMode, setPasteMode, pasteVal, setPasteVal, applyPaste, fileRef, onFile, onMouseUp, abrirDoc, setTab }} />
        )}
        {activeTab === "categorias" && (
          <CategoriasView {...{ project, codeFreq, C, addCategory, updateCategory, removeCategory, toggleCodeInCategory, catHint: MET.catHint, catLabel: MET.tabs.categorias }} />
        )}
        {activeTab === "quantitativo" && (
          <QuantitativoView {...{ project, codeFreq, catFreq, cooc, codeMap, C, excludeWord, includeWord }} />
        )}
        {activeTab === "confiabilidade" && (
          <ConfiabilidadeView {...{ projectA: project, index, cmpB, onPickB, onFileB, onExample: loadReliabilityExample, C }} />
        )}
        {activeTab === "metatexto" && (
          <MetatextoView {...{ project, C, addMetatext, updateMetatext, removeMetatext, metaLabel: MET.tabs.metatexto, metaHint: MET.metaHint }} />
        )}
      </div>
    </div>
  );
}

function btnStyle(C) {
  return { fontFamily: "system-ui", fontSize: 12, padding: "5px 10px", border: `1px solid ${C.line}`, borderRadius: 4, background: "#fff", color: C.ink, cursor: "pointer", whiteSpace: "nowrap" };
}
function Btn({ children, onClick, danger }) {
  const C = { line: "#e3e9ee", ink: "#2b3a48" };
  return <button onClick={onClick} style={{ ...btnStyle(C), color: danger ? "#b03a2e" : C.ink }}>{children}</button>;
}

// ============ CODIFICAÇÃO ============
function CodificacaoView(props) {
  const { project, segments, codeMap, C, pending, setPending, selExcerpt, setSelExcerpt,
    addCode, assignCode, removeCode, renameCode, setCodeColor, mergeCode, removeExcerpt, setExcerptMemo, toggleCodeOnExcerpt,
    pasteMode, setPasteMode, pasteVal, setPasteVal, applyPaste, fileRef, onFile, onMouseUp, abrirDoc, setTab } = props;
  const [newCode, setNewCode] = useState("");
  const ex = selExcerpt ? project.excerpts.find((e) => e.id === selExcerpt) : null;
  const [q, setQ] = useState("");
  const [mi, setMi] = useState(0);
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeInto, setMergeInto] = useState("");
  const scrollRef = useRef(null);
  const matchPositions = useMemo(() => {
    if (!q.trim() || !textoDe(project)) return [];
    const res = []; const t = textoDe(project).toLowerCase(); const needle = q.toLowerCase();
    let idx = t.indexOf(needle);
    while (idx >= 0) { res.push(idx); idx = t.indexOf(needle, idx + needle.length); }
    return res;
  }, [q, project]);
  useEffect(() => { setMi(0); }, [q]);
  useEffect(() => {
    if (!matchPositions.length || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-mi="${mi}"]`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [mi, matchPositions]);
  const renderSegContent = (seg) => {
    if (!q.trim()) return seg.text;
    const t = seg.text, lower = t.toLowerCase(), needle = q.toLowerCase();
    const parts = []; let from = 0, idx = lower.indexOf(needle), k = 0;
    while (idx >= 0) {
      if (idx > from) parts.push(t.slice(from, idx));
      const abs = seg.start + idx, gi = matchPositions.indexOf(abs);
      parts.push(<mark key={"m" + k++} data-mi={gi} style={{ background: gi === mi ? "#ffca28" : "#fff1a8", color: "inherit", padding: 0, borderRadius: 2 }}>{t.slice(idx, idx + needle.length)}</mark>);
      from = idx + needle.length; idx = lower.indexOf(needle, from);
    }
    if (from < t.length) parts.push(t.slice(from));
    return parts;
  };

  return (
    <>
      {/* texto */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: `1px solid ${C.line}` }}>
        {!textoDe(project) && !pasteMode && (
          <div style={{ margin: "auto", textAlign: "center", fontFamily: "system-ui", color: C.sub }}>
            <p style={{ marginBottom: 16, fontSize: 14 }}>Comece pelo material a analisar.</p>
            <label style={{ ...btnStyle(C), display: "inline-block", marginRight: 8, background: C.accent, color: "#fff", border: "none", padding: "8px 16px" }}>
              Abrir arquivos (.txt, .docx)<input ref={fileRef} type="file" accept=".txt,.docx,text/plain" multiple onChange={onFile} style={{ display: "none" }} />
            </label>
            <button onClick={() => setPasteMode(true)} style={{ ...btnStyle(C), padding: "8px 16px" }}>Colar texto</button>
          </div>
        )}
        {pasteMode && (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", height: "100%" }}>
            <textarea value={pasteVal} onChange={(e) => setPasteVal(e.target.value)} placeholder="Cole aqui a entrevista, documento ou corpus…"
              style={{ flex: 1, fontFamily: "system-ui", fontSize: 14, padding: 12, border: `1px solid ${C.line}`, borderRadius: 4, resize: "none" }} />
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button onClick={applyPaste} style={{ ...btnStyle(C), background: C.accent, color: "#fff", border: "none" }}>Usar este texto</button>
              <button onClick={() => setPasteMode(false)} style={btnStyle(C)}>Cancelar</button>
            </div>
          </div>
        )}
        {textoDe(project) && !pasteMode && (
          <>
            {docsDe(project).length > 1 && (
              <div style={{ padding: "5px 12px", borderBottom: `1px solid ${C.line}`, background: C.panel, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10.5, color: C.sub, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Documento</span>
                {docsDe(project).map((d) => {
                  const on = d.id === project.docAtual;
                  const n = exDoDoc(project, d.id).length;
                  return (
                    <button key={d.id} onClick={() => abrirDoc(d.id)} title={`${n} recorte(s)`}
                      style={{ ...btnStyle(C), fontSize: 11, padding: "3px 9px", background: on ? C.accent : "#fff", color: on ? "#fff" : C.ink, fontWeight: on ? 700 : 400 }}>
                      {d.name}{n ? ` (${n})` : ""}
                    </button>
                  );
                })}
                <button onClick={() => setTab("corpus")} style={{ ...btnStyle(C), fontSize: 11, padding: "3px 9px" }}>gerenciar…</button>
              </div>
            )}
            <div style={{ padding: "6px 12px", fontFamily: "system-ui", fontSize: 11, color: C.sub, borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span>{textoDe(project).length} caracteres</span>
              <span>{project.excerpts.length} recortes</span>
              <label style={{ ...btnStyle(C), padding: "3px 9px", fontSize: 11, cursor: "pointer" }} title="acrescentar documentos ao corpus (.txt, .docx)">
                + Documentos<input type="file" accept=".txt,.docx,text/plain" multiple onChange={onFile} style={{ display: "none" }} />
              </label>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar no texto…"
                  onKeyDown={(e) => { if (e.key === "Enter" && matchPositions.length) setMi((mi + (e.shiftKey ? -1 : 1) + matchPositions.length) % matchPositions.length); }}
                  style={{ fontFamily: "system-ui", fontSize: 12, padding: "3px 8px", border: `1px solid ${C.line}`, borderRadius: 4, width: 150 }} />
                {q.trim() !== "" && (
                  <>
                    <span style={{ minWidth: 64, textAlign: "center" }}>{matchPositions.length ? `${mi + 1} de ${matchPositions.length}` : "0 de 0"}</span>
                    <button onClick={() => matchPositions.length && setMi((mi - 1 + matchPositions.length) % matchPositions.length)} disabled={!matchPositions.length} style={{ ...btnStyle(C), padding: "2px 8px", fontSize: 12 }} aria-label="ocorrência anterior" title="anterior">‹</button>
                    <button onClick={() => matchPositions.length && setMi((mi + 1) % matchPositions.length)} disabled={!matchPositions.length} style={{ ...btnStyle(C), padding: "2px 8px", fontSize: 12 }} aria-label="próxima ocorrência" title="próxima">›</button>
                    <button onClick={() => setQ("")} style={{ ...btnStyle(C), padding: "2px 8px", fontSize: 12 }} aria-label="limpar busca" title="limpar busca">✕</button>
                  </>
                )}
              </div>
            </div>
            <div ref={scrollRef} onMouseUp={onMouseUp} style={{ flex: 1, overflow: "auto", padding: "18px 22px", fontSize: 16, lineHeight: 1.85, whiteSpace: "pre-wrap" }}>
              {segments.map((seg, i) => {
                const cov = seg.covering;
                const c0 = cov[0] ? codeMap[cov[0].codeIds[0]] : null;
                const isSel = cov.some((e) => e.id === selExcerpt);
                return (
                  <span key={i} data-start={seg.start}
                    onClick={() => cov.length && setSelExcerpt(cov[cov.length - 1].id)}
                    title={cov.length ? cov.flatMap((e) => e.codeIds.map((id) => codeMap[id]?.name)).filter(Boolean).join(", ") : ""}
                    style={{
                      background: c0 ? (c0.color + (isSel ? "55" : "30")) : "transparent",
                      borderBottom: cov.length > 1 ? `2px dotted ${c0?.color || C.accent}` : c0 ? `2px solid ${c0.color}` : "none",
                      cursor: cov.length ? "pointer" : "text",
                      boxShadow: isSel ? `0 0 0 1px ${c0?.color || C.accent}` : "none",
                      borderRadius: 2,
                    }}>{renderSegContent(seg)}</span>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* painel direito */}
      <div style={{ width: 320, display: "flex", flexDirection: "column", background: C.panel, overflow: "auto" }}>
        {/* recorte pendente */}
        {pending && (
          <div style={{ padding: 14, borderBottom: `1px solid ${C.line}`, background: C.accentSoft }}>
            <div style={{ fontFamily: "system-ui", fontSize: 11, color: C.accent, fontWeight: 600, marginBottom: 6 }}>RECORTE SELECIONADO</div>
            <div style={{ fontSize: 13, fontStyle: "italic", maxHeight: 70, overflow: "auto", marginBottom: 8 }}>"{pending.text}"</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input value={newCode} onChange={(e) => setNewCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newCode.trim()) { assignCode(addCode(newCode)); setNewCode(""); } }}
                placeholder="novo código + Enter"
                style={{ flex: 1, fontFamily: "system-ui", fontSize: 12, padding: "5px 8px", border: `1px solid ${C.line}`, borderRadius: 4 }} />
            </div>
            <div style={{ fontFamily: "system-ui", fontSize: 10, color: C.sub, marginBottom: 4 }}>aplicar código existente:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {project.codes.map((c) => (
                <button key={c.id} onClick={() => assignCode(c.id)}
                  style={{ fontFamily: "system-ui", fontSize: 11, padding: "3px 8px", border: "none", borderRadius: 10, background: c.color, color: "#fff", cursor: "pointer" }}>{c.name}</button>
              ))}
            </div>
            <button onClick={() => setPending(null)} style={{ ...btnStyle(C), fontSize: 11, marginTop: 8 }}>cancelar</button>
          </div>
        )}

        {/* excerto selecionado */}
        {ex && !pending && (
          <div style={{ padding: 14, borderBottom: `1px solid ${C.line}` }}>
            <div style={{ fontFamily: "system-ui", fontSize: 11, color: C.accent, fontWeight: 600, marginBottom: 6 }}>RECORTE CODIFICADO</div>
            <div style={{ fontSize: 13, fontStyle: "italic", maxHeight: 80, overflow: "auto", marginBottom: 8 }}>"{ex.text}"</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
              {project.codes.map((c) => (
                <button key={c.id} onClick={() => toggleCodeOnExcerpt(ex.id, c.id)}
                  style={{ fontFamily: "system-ui", fontSize: 11, padding: "3px 8px", border: `1px solid ${c.color}`, borderRadius: 10,
                    background: ex.codeIds.includes(c.id) ? c.color : "#fff", color: ex.codeIds.includes(c.id) ? "#fff" : c.color, cursor: "pointer" }}>{c.name}</button>
              ))}
            </div>
            <textarea value={ex.memo} onChange={(e) => setExcerptMemo(ex.id, e.target.value)} placeholder="memo analítico deste recorte…"
              style={{ width: "100%", fontFamily: "system-ui", fontSize: 12, padding: 8, border: `1px solid ${C.line}`, borderRadius: 4, resize: "vertical", minHeight: 50, boxSizing: "border-box" }} />
            <button onClick={() => removeExcerpt(ex.id)} style={{ ...btnStyle(C), fontSize: 11, marginTop: 8, color: "#b03a2e" }}>remover recorte</button>
          </div>
        )}

        {/* lista de códigos */}
        <div style={{ padding: 14 }}>
          <div style={{ fontFamily: "system-ui", fontSize: 11, color: C.sub, fontWeight: 600, marginBottom: 8 }}>CÓDIGOS ({project.codes.length})</div>
          {project.codes.length === 0 && <div style={{ fontFamily: "system-ui", fontSize: 12, color: C.sub }}>Nenhum código ainda. Selecione um trecho no texto.</div>}
          {project.codes.map((c) => {
            const n = project.excerpts.filter((e) => e.codeIds.includes(c.id)).length;
            return (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <input type="color" value={c.color} onChange={(e) => setCodeColor(c.id, e.target.value)} title="cor do código" style={{ width: 20, height: 20, padding: 0, border: "none", background: "none", cursor: "pointer", flexShrink: 0 }} />
                <input value={c.name} onChange={(e) => renameCode(c.id, e.target.value)}
                  style={{ flex: 1, fontFamily: "system-ui", fontSize: 13, border: "none", background: "transparent", borderBottom: `1px solid transparent` }}
                  onFocus={(e) => e.target.style.borderBottom = `1px solid ${C.line}`} onBlur={(e) => e.target.style.borderBottom = "1px solid transparent"} />
                <span style={{ fontFamily: "system-ui", fontSize: 11, color: C.sub }}>{n}</span>
                <button onClick={() => removeCode(c.id)} style={{ border: "none", background: "transparent", color: C.sub, cursor: "pointer", fontSize: 14 }}>×</button>
              </div>
            );
          })}
          {project.codes.length >= 2 && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
              <div style={{ fontFamily: "system-ui", fontSize: 11, color: C.sub, fontWeight: 600, marginBottom: 6 }}>MESCLAR CÓDIGOS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
                <select value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)} style={{ fontFamily: "system-ui", fontSize: 12, padding: "3px 6px", border: `1px solid ${C.line}`, borderRadius: 4, maxWidth: 110 }}>
                  <option value="">de…</option>
                  {project.codes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <span style={{ fontSize: 12, color: C.sub }}>em</span>
                <select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} style={{ fontFamily: "system-ui", fontSize: 12, padding: "3px 6px", border: `1px solid ${C.line}`, borderRadius: 4, maxWidth: 110 }}>
                  <option value="">…</option>
                  {project.codes.filter((c) => c.id !== mergeFrom).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button disabled={!mergeFrom || !mergeInto} onClick={() => {
                  const a = project.codes.find((c) => c.id === mergeFrom), b = project.codes.find((c) => c.id === mergeInto);
                  let ok = true; try { ok = window.confirm(`Mesclar "${a?.name}" em "${b?.name}"? Os recortes de "${a?.name}" passam a usar "${b?.name}" e o código "${a?.name}" é removido.`); } catch {}
                  if (ok) { mergeCode(mergeFrom, mergeInto); setMergeFrom(""); setMergeInto(""); }
                }} style={{ ...btnStyle(C), fontSize: 12, padding: "3px 10px", opacity: (!mergeFrom || !mergeInto) ? 0.5 : 1 }}>mesclar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ============ CATEGORIAS ============
function CategoriasView({ project, codeFreq, C, addCategory, updateCategory, removeCategory, toggleCodeInCategory, catHint, catLabel }) {
  const assigned = new Set(project.categories.flatMap((c) => c.codeIds));
  const livres = codeFreq.filter((c) => !assigned.has(c.id));
  return (
    <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
      {catHint && <div style={{ fontFamily: "system-ui", fontSize: 12.5, color: C.sub, lineHeight: 1.5, marginBottom: 12, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 10px" }}><b>{catLabel || "Categorias"}:</b> {catHint}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <button onClick={() => addCategory("Nova categoria", "emergente")} style={{ ...btnStyle(C), background: C.accent, color: "#fff", border: "none" }}>+ categoria emergente</button>
        <button onClick={() => addCategory("Nova categoria", "apriori")} style={btnStyle(C)}>+ categoria a priori</button>
        <span style={{ marginLeft: "auto", fontFamily: "system-ui", fontSize: 11, color: C.sub }}>{livres.length} código(s) sem categoria</span>
      </div>


      {/* códigos livres */}
      {livres.length > 0 && (
        <div style={{ marginBottom: 16, padding: 12, border: `1px dashed ${C.line}`, borderRadius: 6 }}>
          <div style={{ fontFamily: "system-ui", fontSize: 11, color: C.sub, marginBottom: 8 }}>SEM CATEGORIA — clique para incluir na categoria desejada abaixo</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {livres.map((c) => <span key={c.id} style={{ fontFamily: "system-ui", fontSize: 12, padding: "3px 8px", borderRadius: 10, background: c.color, color: "#fff" }}>{c.name} ({c.n})</span>)}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
        {project.categories.map((cat) => (
          <div key={cat.id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <input value={cat.name} onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
                style={{ flex: 1, fontFamily: "system-ui", fontSize: 14, fontWeight: 600, border: "none", background: "transparent" }} />
              <select value={cat.tipo} onChange={(e) => updateCategory(cat.id, { tipo: e.target.value })}
                style={{ fontFamily: "system-ui", fontSize: 10, border: `1px solid ${C.line}`, borderRadius: 4, padding: "2px 4px" }}>
                <option value="emergente">emergente</option>
                <option value="apriori">a priori</option>
              </select>
              <button onClick={() => removeCategory(cat.id)} style={{ border: "none", background: "transparent", color: C.sub, cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
            <textarea value={cat.desc} onChange={(e) => updateCategory(cat.id, { desc: e.target.value })} placeholder="definição da categoria…"
              style={{ width: "100%", fontFamily: "system-ui", fontSize: 12, padding: 6, border: `1px solid ${C.line}`, borderRadius: 4, resize: "vertical", minHeight: 36, boxSizing: "border-box", marginBottom: 8 }} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {codeFreq.map((c) => {
                const inCat = cat.codeIds.includes(c.id);
                return (
                  <button key={c.id} onClick={() => toggleCodeInCategory(cat.id, c.id)}
                    style={{ fontFamily: "system-ui", fontSize: 11, padding: "3px 8px", borderRadius: 10, cursor: "pointer",
                      border: `1px solid ${c.color}`, background: inCat ? c.color : "#fff", color: inCat ? "#fff" : c.color, opacity: inCat ? 1 : 0.55 }}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {project.categories.length === 0 && <div style={{ fontFamily: "system-ui", fontSize: 13, color: C.sub, marginTop: 20 }}>Nenhuma categoria. Crie uma e clique nos códigos para agregá-los.</div>}
    </div>
  );
}

// ============ QUANTITATIVO ============
function QuantitativoView({ project, codeFreq, catFreq, cooc, codeMap, C, excludeWord, includeWord }) {
  const totalRec = project.excerpts.length;
  const excluded = useMemo(() => new Set((project.wordExclude || []).map((w) => w.toLowerCase())), [project.wordExclude]);
  const topWords = useMemo(() => {
    const toks = textoTodo(project).toLowerCase().match(/[\p{L}]+/gu) || [];
    const counts = {};
    for (const w of toks) { if (w.length < 3 || STOPWORDS_PT.has(w) || excluded.has(w)) continue; counts[w] = (counts[w] || 0) + 1; }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 30);
  }, [project, excluded]);
  const cloudW = 580, cloudH = 360;
  const cloud = useMemo(() => buildWordCloud(topWords, cloudW, cloudH), [topWords]);
  const cloudRef = useRef(null);
  const chartRef = useRef(null);
  return (
    <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 18, fontFamily: "system-ui" }}>
        <Stat label="recortes" value={totalRec} C={C} />
        <Stat label="códigos" value={project.codes.length} C={C} />
        <Stat label="categorias" value={project.categories.length} C={C} />
        <Stat label="densidade média (cód/recorte)" value={totalRec ? (project.excerpts.reduce((s, e) => s + e.codeIds.length, 0) / totalRec).toFixed(2) : "0"} C={C} />
      </div>

      <SectionTitle C={C}>Frequência por código</SectionTitle>
      {codeFreq.length > 0 ? (
        <>
          <div ref={chartRef} style={{ height: Math.max(180, codeFreq.length * 26), marginBottom: 6 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={codeFreq} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontFamily: "system-ui", fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontFamily: "system-ui", fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="n" radius={[0, 3, 3, 0]}>
                  {codeFreq.map((c) => <Cell key={c.id} fill={c.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
            <button onClick={() => exportSvgElement(chartRef.current && chartRef.current.querySelector("svg"), "frequencia-codigos", "png")} style={{ ...btnStyle(C), fontSize: 11 }}>PNG</button>
            <button onClick={() => exportSvgElement(chartRef.current && chartRef.current.querySelector("svg"), "frequencia-codigos", "svg")} style={{ ...btnStyle(C), fontSize: 11 }}>SVG</button>
          </div>
        </>
      ) : <Empty C={C} />}

      <SectionTitle C={C}>Frequência por categoria</SectionTitle>
      {catFreq.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "system-ui", fontSize: 13, marginBottom: 24 }}>
          <thead><tr style={{ textAlign: "left", color: C.sub, borderBottom: `1px solid ${C.line}` }}>
            <th style={{ padding: 6 }}>Categoria</th><th>Tipo</th><th>Códigos</th><th>Recortes</th><th>%</th>
          </tr></thead>
          <tbody>
            {catFreq.map((c) => (
              <tr key={c.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                <td style={{ padding: 6, fontWeight: 600 }}>{c.name}</td>
                <td style={{ color: C.sub }}>{c.tipo}</td>
                <td>{c.codes}</td><td>{c.n}</td>
                <td>{totalRec ? Math.round((c.n / totalRec) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <Empty C={C} />}

      <SectionTitle C={C}>Coocorrência de códigos (mesmo recorte)</SectionTitle>
      {cooc.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {cooc.map((p, i) => (
            <div key={i} style={{ fontFamily: "system-ui", fontSize: 12, padding: "5px 10px", border: `1px solid ${C.line}`, borderRadius: 16, background: C.panel }}>
              <b style={{ color: codeMap[p.a]?.color }}>{codeMap[p.a]?.name}</b> + <b style={{ color: codeMap[p.b]?.color }}>{codeMap[p.b]?.name}</b> · {p.n}
            </div>
          ))}
        </div>
      ) : <div style={{ fontFamily: "system-ui", fontSize: 13, color: C.sub }}>Nenhum recorte com dois ou mais códigos ainda.</div>}

      <SectionTitle C={C}>Palavras frequentes no texto</SectionTitle>
      {topWords.length > 0 ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline" }}>
            {topWords.map(([word, n]) => {
              const size = 12 + Math.round((n / topWords[0][1]) * 12);
              return (
                <span key={word} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "system-ui", fontSize: size, lineHeight: 1.5, padding: "2px 6px 2px 8px", borderRadius: 14, background: C.panel, border: `1px solid ${C.line}`, color: C.ink }}>
                  {word} <span style={{ color: C.sub, fontSize: 11 }}>{n}</span>
                  <button onClick={() => excludeWord(word)} title="excluir esta palavra da nuvem e das frequentes" style={{ border: "none", background: "transparent", color: C.sub, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "system-ui", fontSize: 11, color: C.sub }}>excluir palavra:</span>
            <input placeholder="ex.: entrevistador" onKeyDown={(e) => { if (e.key === "Enter" && e.target.value.trim()) { excludeWord(e.target.value.trim()); e.target.value = ""; } }}
              style={{ fontFamily: "system-ui", fontSize: 12, padding: "3px 8px", border: `1px solid ${C.line}`, borderRadius: 4, width: 150 }} />
            <span style={{ fontFamily: "system-ui", fontSize: 11, color: C.sub }}>(Enter)</span>
          </div>
          {(project.wordExclude || []).length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
              <span style={{ fontFamily: "system-ui", fontSize: 11, color: C.sub }}>excluídas:</span>
              {(project.wordExclude || []).map((word) => (
                <span key={word} style={{ fontFamily: "system-ui", fontSize: 11, padding: "2px 6px", borderRadius: 10, background: "#fff", border: `1px dashed ${C.line}`, color: C.sub, textDecoration: "line-through" }}>
                  {word} <button onClick={() => includeWord(word)} title="restaurar" style={{ border: "none", background: "transparent", color: C.accent, cursor: "pointer", fontSize: 12, textDecoration: "none" }}>↺</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ fontFamily: "system-ui", fontSize: 11, color: C.sub, marginTop: 8 }}>palavras com 3+ letras, sem palavras vazias (artigos, preposições, pronomes etc.)</div>

          <SectionTitle C={C}>Nuvem de palavras</SectionTitle>
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, background: "#fff", display: "inline-block", maxWidth: "100%", overflow: "hidden" }}>
            <svg ref={cloudRef} viewBox={`0 0 ${cloudW} ${cloudH}`} width={cloudW} height={cloudH} style={{ maxWidth: "100%", height: "auto", display: "block" }} xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width={cloudW} height={cloudH} fill="#ffffff" />
              {cloud.map((p, i) => (
                <text key={i} x={p.x + p.w / 2} y={p.y + p.h * 0.74} textAnchor="middle"
                  fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" fontSize={p.fs} fontWeight={p.n >= (topWords[0] ? topWords[0][1] : 1) * 0.6 ? 700 : 500}
                  fill={PALETTE[p.ci % PALETTE.length]}>{p.word}</text>
              ))}
            </svg>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button onClick={() => exportSvgElement(cloudRef.current, "nuvem-palavras", "png")} style={{ ...btnStyle(C), fontSize: 11 }}>PNG</button>
            <button onClick={() => exportSvgElement(cloudRef.current, "nuvem-palavras", "svg")} style={{ ...btnStyle(C), fontSize: 11 }}>SVG</button>
          </div>
        </>
      ) : <div style={{ fontFamily: "system-ui", fontSize: 13, color: C.sub }}>Importe ou cole um texto para ver as palavras mais frequentes.</div>}
    </div>
  );
}
function Stat({ label, value, C }) {
  return <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 16px", minWidth: 90 }}>
    <div style={{ fontSize: 24, fontWeight: 700, color: C.accent }}>{value}</div>
    <div style={{ fontSize: 11, color: C.sub }}>{label}</div>
  </div>;
}
function SectionTitle({ children, C }) {
  return <div style={{ fontFamily: "system-ui", fontSize: 12, fontWeight: 600, color: C.sub, textTransform: "uppercase", letterSpacing: 0.5, margin: "4px 0 10px" }}>{children}</div>;
}
function Empty({ C }) { return <div style={{ fontFamily: "system-ui", fontSize: 13, color: C.sub, marginBottom: 20 }}>Sem dados ainda.</div>; }

// ============ CONFIABILIDADE ENTRE CODIFICADORES ============
function ConfiabilidadeView({ projectA, index, cmpB, onPickB, onFileB, onExample, C }) {
  const res = useMemo(() => (cmpB ? interCoderKappa(projectA, cmpB) : null), [projectA, cmpB]);
  const pct = (x) => (x * 100).toFixed(1) + "%";
  const others = (index || []).filter((p) => p.id !== projectA.id);
  return (
    <div style={{ flex: 1, overflow: "auto", padding: 18, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <SectionTitle C={C}>Confiabilidade entre codificadores</SectionTitle>
        <button onClick={onExample} style={{ ...btnStyle(C), fontSize: 11, marginBottom: 10, background: C.accent, color: "#fff", border: "none" }} title="carrega a entrevista de exemplo já com duas codificações (A e B) para ver o cálculo">carregar exemplo (A e B)</button>
      </div>
      <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.5, marginBottom: 14, maxWidth: 720 }}>
        Escolha a <b>Codificação B</b> abaixo (outro projeto ou um arquivo .json) para comparar com o projeto atual,
        ou clique em <b>carregar exemplo (A e B)</b> para ver uma demonstração pronta. As duas codificações precisam ser do mesmo texto;
        os códigos são pareados pelo nome.
      </div>
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>CODIFICAÇÃO A (projeto atual)</div>
          <div style={{ fontWeight: 600 }}>{projectA.name}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>CODIFICAÇÃO B</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={(cmpB && cmpB.id) || ""} onChange={(e) => onPickB(e.target.value)}
              style={{ fontSize: 12, padding: "5px 8px", border: `1px solid ${C.line}`, borderRadius: 4, background: "#fff" }}>
              <option value="">— escolher projeto —</option>
              {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span style={{ fontSize: 11, color: C.sub }}>ou</span>
            <label style={{ ...btnStyle(C), fontSize: 12 }}>abrir .json<input type="file" accept=".json,application/json" onChange={onFileB} style={{ display: "none" }} /></label>
          </div>
          {cmpB && <div style={{ fontSize: 12, marginTop: 4 }}>B: <b>{cmpB.name}</b></div>}
        </div>
      </div>

      {!cmpB && <Empty C={C} />}
      {cmpB && res && !res.sameText && (
        <div style={{ fontSize: 13, color: "#b3261e", background: "#fdecea", border: "1px solid #f5c6c0", borderRadius: 6, padding: "10px 14px", maxWidth: 720 }}>
          As duas codificações precisam ser exatamente do mesmo texto. Confira se A e B partem do mesmo material.
        </div>
      )}
      {cmpB && res && res.sameText && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <Stat label="kappa de Cohen (κ)" value={res.kappa.toFixed(3)} C={C} />
            <Stat label="observada (Po)" value={pct(res.po)} C={C} />
            <Stat label="por acaso (Pe)" value={pct(res.pe)} C={C} />
            <Stat label="nos trechos codificados" value={pct(res.poUnion)} C={C} />
          </div>
          <div style={{ fontSize: 13, marginBottom: 18, maxWidth: 720 }}>
            Concordância <b>{kappaBand(res.kappa)}</b> pela escala de Landis & Koch (1977), sobre {res.n.toLocaleString("pt-BR")} caracteres
            {" "}({res.unionCoded.toLocaleString("pt-BR")} codificados por ao menos um codificador).
          </div>

          <SectionTitle C={C}>Concordância por código</SectionTitle>
          {Object.keys(res.perCode).length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 18, maxWidth: 620 }}>
              <thead><tr style={{ textAlign: "left", color: C.sub, borderBottom: `1px solid ${C.line}` }}>
                <th style={{ padding: 6 }}>Código</th><th>Ambos</th><th>Só A</th><th>Só B</th><th>Concord.</th>
              </tr></thead>
              <tbody>
                {Object.entries(res.perCode).sort((x, y) => (y[1].both + y[1].aOnly + y[1].bOnly) - (x[1].both + x[1].aOnly + x[1].bOnly)).map(([name, v]) => {
                  const tot = v.both + v.aOnly + v.bOnly;
                  return (
                    <tr key={name} style={{ borderBottom: `1px solid ${C.line}` }}>
                      <td style={{ padding: 6, fontWeight: 600 }}>{name}</td>
                      <td>{v.both}</td><td>{v.aOnly}</td><td>{v.bOnly}</td>
                      <td>{tot ? Math.round((v.both / tot) * 100) : 0}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <Empty C={C} />}
          {(res.codesA.length === 0 || res.codesB.length === 0) && (
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>Atenção: uma das codificações não tem códigos aplicados.</div>
          )}

          <SectionTitle C={C}>Modelo utilizado</SectionTitle>
          <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.6, maxWidth: 720 }}>
            κ = (Po − Pe) / (1 − Pe), em que Po é a concordância observada e Pe a concordância esperada ao acaso.
            <div style={{ marginTop: 6 }}>Cohen, J. (1960). A coefficient of agreement for nominal scales. <i>Educational and Psychological Measurement</i>, 20(1), 37-46.</div>
            <div>Landis, J. R., &amp; Koch, G. G. (1977). The measurement of observer agreement for categorical data. <i>Biometrics</i>, 33(1), 159-174.</div>
          </div>
        </>
      )}
    </div>
  );
}

// ============ METATEXTO ============
function MetatextoView({ project, C, addMetatext, updateMetatext, removeMetatext, metaLabel = "Metatexto", metaHint = "Escreva aqui a interpretação, apoiada nos recortes." }) {
  const lower = metaLabel.toLowerCase();
  return (
    <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <button onClick={() => addMetatext(null)} style={{ ...btnStyle(C), background: C.accent, color: "#fff", border: "none" }}>+ novo texto</button>
        <span style={{ fontFamily: "system-ui", fontSize: 11, color: C.sub }}>vincule a uma categoria para gerar a partir dos excertos</span>
      </div>
      {project.metatexts.length === 0 && <div style={{ fontFamily: "system-ui", fontSize: 13, color: C.sub }}>Nenhum texto ainda. É aqui que se escreve a etapa de <b>{lower}</b>: {metaHint}</div>}
      {project.metatexts.map((m) => (
        <div key={m.id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 16, marginBottom: 16, maxWidth: 820 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <input value={m.title} onChange={(e) => updateMetatext(m.id, { title: e.target.value })}
              style={{ flex: 1, fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", fontSize: 18, fontWeight: 700, border: "none", background: "transparent" }} />
            <select value={m.categoryId || ""} onChange={(e) => updateMetatext(m.id, { categoryId: e.target.value || null })}
              style={{ fontFamily: "system-ui", fontSize: 12, padding: "4px 8px", border: `1px solid ${C.line}`, borderRadius: 4 }}>
              <option value="">(sem categoria)</option>
              {project.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => removeMetatext(m.id)} style={{ border: "none", background: "transparent", color: C.sub, cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
          <textarea value={m.body} onChange={(e) => updateMetatext(m.id, { body: e.target.value })} placeholder={metaHint}
            style={{ width: "100%", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", fontSize: 15, lineHeight: 1.7, padding: 12, border: `1px solid ${C.line}`, borderRadius: 4, resize: "vertical", minHeight: 160, boxSizing: "border-box" }} />
        </div>
      ))}
    </div>
  );
}





/* ============ DOCUMENTOS (corpus do projeto) ============ */
function CorpusView({ project, C, addDocs, renameDoc, removeDoc, abrirDoc, setAttr, addAtributo, removeAtributo, onFile, setTab }) {
  const [novoAttr, setNovoAttr] = React.useState("");
  const docs = docsDe(project);
  const attrs = project.atributos || [];
  const inp = { fontFamily: "system-ui", fontSize: 12.5, padding: "4px 7px", border: `1px solid ${C.line}`, borderRadius: 4, width: "100%", boxSizing: "border-box" };
  const th = { fontSize: 11, fontWeight: 700, color: C.sub, textAlign: "left", padding: "5px 7px", borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap" };
  const td = { padding: "3px 7px", borderBottom: `1px solid ${C.line}`, fontSize: 12.5 };
  return (
    <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Documentos do projeto</div>
        <span style={{ fontSize: 11.5, color: C.sub }}>{docs.length} documento(s) · {(project.excerpts || []).length} recortes no total</span>
        <label style={btnStyle(C)}>+ Documentos (.txt, .docx)
          <input type="file" accept=".txt,.docx,text/plain" multiple onChange={onFile} style={{ display: "none" }} />
        </label>
        <Btn onClick={() => addDocs([{ name: "Documento " + (docs.length + 1), text: "" }])}>+ vazio</Btn>
      </div>
      <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 12, lineHeight: 1.6 }}>
        Todos os documentos compartilham o mesmo livro de códigos e as mesmas categorias. Dá para selecionar vários arquivos de uma vez —
        cada um vira um documento, e o nome do arquivo vira o nome dele. Os <b>atributos</b> (escola, turno, sexo, ano…) servem para
        comparar a codificação entre grupos na aba Consultas.
      </div>

      <div style={{ overflowX: "auto", border: `1px solid ${C.line}`, borderRadius: 6 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620 }}>
          <thead><tr>
            <th style={th}>Documento</th><th style={{ ...th, textAlign: "right" }}>Caracteres</th><th style={{ ...th, textAlign: "right" }}>Recortes</th>
            {attrs.map((a) => (
              <th key={a} style={th}>{a}
                <button onClick={() => removeAtributo(a)} title={`remover o atributo "${a}"`}
                  style={{ marginLeft: 4, border: "none", background: "none", color: "#b3402f", cursor: "pointer", fontSize: 12 }}>✕</button>
              </th>
            ))}
            <th style={th} />
          </tr></thead>
          <tbody>
            {docs.map((d) => {
              const n = exDoDoc(project, d.id).length;
              const aberto = d.id === project.docAtual;
              return (
                <tr key={d.id} style={{ background: aberto ? C.accentSoft : "transparent" }}>
                  <td style={td}><input style={inp} value={d.name} onChange={(e) => renameDoc(d.id, e.target.value)} /></td>
                  <td style={{ ...td, textAlign: "right", color: C.sub }}>{(d.text || "").length.toLocaleString("pt-BR")}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: n ? 700 : 400, color: n ? C.ink : C.sub }}>{n}</td>
                  {attrs.map((a) => (
                    <td key={a} style={td}><input style={inp} value={(d.attrs || {})[a] || ""} placeholder="—" onChange={(e) => setAttr(d.id, a, e.target.value)} /></td>
                  ))}
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    <Btn onClick={() => { abrirDoc(d.id); setTab("codificacao"); }}>{aberto ? "aberto" : "abrir"}</Btn>{" "}
                    <Btn onClick={() => removeDoc(d.id)} danger>remover</Btn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: C.sub }}>Novo atributo:</span>
        <input style={{ ...inp, width: 180 }} value={novoAttr} placeholder="ex.: escola, turno, sexo, ano"
          onChange={(e) => setNovoAttr(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { addAtributo(novoAttr); setNovoAttr(""); } }} />
        <Btn onClick={() => { addAtributo(novoAttr); setNovoAttr(""); }}>adicionar</Btn>
      </div>
    </div>
  );
}

/* ============ CONSULTAS (recuperação entre documentos) ============ */
function ConsultasView({ project, codeMap, C, abrirDoc, setTab }) {
  const [sel, setSel] = React.useState([]);            // códigos escolhidos
  const [modo, setModo] = React.useState("qualquer");  // qualquer | todos | nenhum
  const [docFiltro, setDocFiltro] = React.useState("");
  const [attrChave, setAttrChave] = React.useState("");
  const [attrValor, setAttrValor] = React.useState("");
  const [busca, setBusca] = React.useState("");

  const docs = docsDe(project);
  const attrs = project.atributos || [];
  const valoresDe = (chave) => [...new Set(docs.map((d) => ((d.attrs || {})[chave] || "").trim()).filter(Boolean))].sort();

  const docsPermitidos = React.useMemo(() => {
    let ds = docs;
    if (docFiltro) ds = ds.filter((d) => d.id === docFiltro);
    if (attrChave && attrValor) ds = ds.filter((d) => ((d.attrs || {})[attrChave] || "").trim() === attrValor);
    return new Set(ds.map((d) => d.id));
  }, [docs, docFiltro, attrChave, attrValor]);

  const achados = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (project.excerpts || []).filter((e) => {
      if (!docsPermitidos.has(e.docId)) return false;
      if (q && !(e.text || "").toLowerCase().includes(q)) return false;
      if (!sel.length) return true;
      const ids = e.codeIds || [];
      if (modo === "qualquer") return sel.some((c) => ids.includes(c));
      if (modo === "todos") return sel.every((c) => ids.includes(c));
      return !sel.some((c) => ids.includes(c)); // nenhum
    });
  }, [project.excerpts, docsPermitidos, sel, modo, busca]);

  const porDoc = React.useMemo(() => {
    const m = {};
    achados.forEach((e) => { m[e.docId] = (m[e.docId] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [achados]);

  // comparação por grupo: código × valor do atributo
  const [grupoChave, setGrupoChave] = React.useState("");
  const cruzamento = React.useMemo(() => {
    if (!grupoChave) return null;
    const grupos = valoresDe(grupoChave);
    if (!grupos.length) return null;
    const grupoDoDoc = {};
    docs.forEach((d) => { grupoDoDoc[d.id] = ((d.attrs || {})[grupoChave] || "").trim(); });
    const nDocs = {}; grupos.forEach((g) => (nDocs[g] = docs.filter((d) => grupoDoDoc[d.id] === g).length));
    const linhas = (project.codes || []).map((c) => {
      const cel = {}; grupos.forEach((g) => (cel[g] = 0));
      (project.excerpts || []).forEach((e) => {
        const g = grupoDoDoc[e.docId];
        if (g && (e.codeIds || []).includes(c.id)) cel[g] += 1;
      });
      return { code: c, cel, total: grupos.reduce((s, g) => s + cel[g], 0) };
    }).filter((l) => l.total > 0).sort((a, b) => b.total - a.total);
    return { grupos, linhas, nDocs };
  }, [grupoChave, project, docs]);

  const exportar = () => {
    const linhas = [["documento", "codigos", "recorte", "memo"].join(";")];
    achados.forEach((e) => linhas.push([nomeDoc(project, e.docId), (e.codeIds || []).map((i) => (codeMap[i] || {}).name || i).join(", "), e.text, e.memo || ""]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")));
    const b = new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
    const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "recortes.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500);
  };

  const sels = { fontFamily: "system-ui", fontSize: 12.5, padding: "4px 7px", border: `1px solid ${C.line}`, borderRadius: 4, background: "#fff" };
  const th = { fontSize: 11, fontWeight: 700, color: C.sub, textAlign: "left", padding: "4px 7px", borderBottom: `1px solid ${C.line}` };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Consultas no corpus</div>
      <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 12 }}>
        Recupera os recortes de todos os documentos ao mesmo tempo — é o que responde “onde mais isso aparece?”.
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "0 1 260px", minWidth: 220, border: `1px solid ${C.line}`, borderRadius: 6, padding: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Códigos</div>
          <div style={{ maxHeight: 190, overflowY: "auto" }}>
            {(project.codes || []).map((c) => (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, padding: "2px 0", cursor: "pointer" }}>
                <input type="checkbox" checked={sel.includes(c.id)}
                  onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))} />
                <span style={{ width: 10, height: 10, borderRadius: 2, background: c.color, display: "inline-block" }} />
                {c.name}
              </label>
            ))}
            {!(project.codes || []).length && <div style={{ fontSize: 12, color: C.sub }}>nenhum código ainda</div>}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[["qualquer", "qualquer (OU)"], ["todos", "todos no mesmo recorte (E)"], ["nenhum", "nenhum (NÃO)"]].map(([v, l]) => (
              <button key={v} onClick={() => setModo(v)} style={{ ...btnStyle(C), background: modo === v ? C.accent : "#fff", color: modo === v ? "#fff" : C.ink, fontSize: 11 }}>{l}</button>
            ))}
          </div>
          {sel.length > 0 && <Btn onClick={() => setSel([])}>limpar seleção</Btn>}
        </div>

        <div style={{ flex: "1 1 380px", minWidth: 300 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <select style={sels} value={docFiltro} onChange={(e) => setDocFiltro(e.target.value)}>
              <option value="">todos os documentos</option>
              {docs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {attrs.length > 0 && (<>
              <select style={sels} value={attrChave} onChange={(e) => { setAttrChave(e.target.value); setAttrValor(""); }}>
                <option value="">— atributo —</option>
                {attrs.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              {attrChave && (
                <select style={sels} value={attrValor} onChange={(e) => setAttrValor(e.target.value)}>
                  <option value="">qualquer valor</option>
                  {valoresDe(attrChave).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              )}
            </>)}
            <input style={{ ...sels, minWidth: 150 }} placeholder="texto dentro do recorte…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <Btn onClick={exportar}>CSV</Btn>
          </div>

          <div style={{ fontSize: 12.5, color: C.ink, marginBottom: 6 }}>
            <b>{achados.length}</b> recorte(s) em <b>{porDoc.length}</b> documento(s)
            {porDoc.length > 0 && <span style={{ color: C.sub }}> · {porDoc.map(([id, n]) => `${nomeDoc(project, id)} (${n})`).join(" · ")}</span>}
          </div>

          <div style={{ maxHeight: 340, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 6 }}>
            {achados.map((e) => (
              <div key={e.id} style={{ padding: "8px 10px", borderBottom: `1px solid ${C.line}` }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
                  <button onClick={() => { abrirDoc(e.docId); setTab("codificacao"); }} title="abrir este documento"
                    style={{ ...btnStyle(C), fontSize: 10.5, padding: "2px 7px" }}>{nomeDoc(project, e.docId)}</button>
                  {(() => { const d = docsDe(project).find((x) => x.id === e.docId); const pg = d && paginaDoOffset(d, e.start); return pg ? <span style={{ fontSize: 10.5, color: C.sub }}>p. {pg}</span> : null; })()}
                  {(e.codeIds || []).map((id) => {
                    const c = codeMap[id]; if (!c) return null;
                    return <span key={id} style={{ background: c.color, color: "#fff", fontSize: 10.5, padding: "1px 7px", borderRadius: 9 }}>{c.name}</span>;
                  })}
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>“{e.text}”</div>
                {e.memo && <div style={{ fontSize: 11.5, color: C.sub, marginTop: 3 }}>memo: {e.memo}</div>}
              </div>
            ))}
            {!achados.length && <div style={{ padding: 14, fontSize: 12.5, color: C.sub }}>Nenhum recorte com esses filtros.</div>}
          </div>
        </div>
      </div>

      {attrs.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Comparação por grupo</div>
            <select style={sels} value={grupoChave} onChange={(e) => setGrupoChave(e.target.value)}>
              <option value="">— escolha um atributo —</option>
              {attrs.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <span style={{ fontSize: 11.5, color: C.sub }}>quantos recortes de cada código aparecem em cada grupo de documentos</span>
          </div>
          {cruzamento && (
            <div style={{ overflowX: "auto", border: `1px solid ${C.line}`, borderRadius: 6 }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 420 }}>
                <thead><tr>
                  <th style={th}>Código</th>
                  {cruzamento.grupos.map((g) => <th key={g} style={{ ...th, textAlign: "right" }}>{g}<div style={{ fontWeight: 400, color: C.sub }}>{cruzamento.nDocs[g]} doc.</div></th>)}
                  <th style={{ ...th, textAlign: "right" }}>total</th>
                </tr></thead>
                <tbody>
                  {cruzamento.linhas.map(({ code, cel, total }) => (
                    <tr key={code.id}>
                      <td style={{ padding: "3px 7px", fontSize: 12.5, borderBottom: `1px solid ${C.line}` }}>
                        <span style={{ width: 9, height: 9, borderRadius: 2, background: code.color, display: "inline-block", marginRight: 5 }} />{code.name}
                      </td>
                      {cruzamento.grupos.map((g) => <td key={g} style={{ padding: "3px 7px", fontSize: 12.5, textAlign: "right", borderBottom: `1px solid ${C.line}` }}>{cel[g] || "—"}</td>)}
                      <td style={{ padding: "3px 7px", fontSize: 12.5, textAlign: "right", fontWeight: 700, borderBottom: `1px solid ${C.line}` }}>{total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: C.sub, padding: "6px 8px" }}>
                São contagens brutas de recortes: grupos com mais documentos tendem a somar mais. Para comparar, olhe também o número de documentos de cada grupo.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


/* ============ MEMOS (diário da análise) ============ */
function MemosView({ project, C, addMemo, updateMemo, removeMemo, codeMap, abrirDoc, setTab }) {
  const [sel, setSel] = React.useState(null);
  const memos = project.memos || [];
  const atual = sel ? memos.find((m) => m.id === sel) : null;
  const inp = { fontFamily: "system-ui", fontSize: 13, padding: "6px 8px", border: `1px solid ${C.line}`, borderRadius: 4, width: "100%", boxSizing: "border-box" };
  const alvoLabel = (m) => {
    if (!m.alvo || !m.alvo.tipo) return "geral";
    if (m.alvo.tipo === "codigo") return "código: " + ((codeMap[m.alvo.id] || {}).name || "?");
    if (m.alvo.tipo === "documento") return "documento: " + nomeDoc(project, m.alvo.id);
    return "geral";
  };
  return (
    <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ flex: "0 1 300px", minWidth: 240 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Memos</div>
          <Btn onClick={() => { const m = addMemo(); setSel(m); }}>+ memo</Btn>
        </div>
        <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 10, lineHeight: 1.6 }}>
          O diário da análise: decisões, dúvidas, hipóteses e por que um código nasceu ou mudou de nome.
          É o que reconstitui o percurso quando a banca perguntar como você chegou ali.
        </div>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, maxHeight: 420, overflowY: "auto" }}>
          {memos.map((m) => (
            <div key={m.id} onClick={() => setSel(m.id)}
              style={{ padding: "8px 10px", borderBottom: `1px solid ${C.line}`, cursor: "pointer", background: sel === m.id ? C.accentSoft : "transparent" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{m.title || "(sem título)"}</div>
              <div style={{ fontSize: 11, color: C.sub }}>{alvoLabel(m)} · {new Date(m.updated || Date.now()).toLocaleDateString("pt-BR")}</div>
              <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2, maxHeight: 32, overflow: "hidden" }}>{(m.body || "").slice(0, 90)}</div>
            </div>
          ))}
          {!memos.length && <div style={{ padding: 14, fontSize: 12.5, color: C.sub }}>Nenhum memo ainda.</div>}
        </div>
      </div>
      <div style={{ flex: "1 1 380px", minWidth: 300 }}>
        {atual ? (
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: 14 }}>
            <input style={{ ...inp, fontSize: 15, fontWeight: 700 }} value={atual.title} placeholder="título do memo"
              onChange={(e) => updateMemo(atual.id, { title: e.target.value })} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: C.sub }}>Vincular a:</span>
              <select style={{ ...inp, width: "auto" }} value={atual.alvo && atual.alvo.tipo ? atual.alvo.tipo + ":" + atual.alvo.id : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return updateMemo(atual.id, { alvo: null });
                  const [tipo, id] = v.split(":");
                  updateMemo(atual.id, { alvo: { tipo, id } });
                }}>
                <option value="">— nada (memo geral) —</option>
                <optgroup label="Códigos">
                  {(project.codes || []).map((c) => <option key={c.id} value={"codigo:" + c.id}>{c.name}</option>)}
                </optgroup>
                <optgroup label="Documentos">
                  {docsDe(project).map((d) => <option key={d.id} value={"documento:" + d.id}>{d.name}</option>)}
                </optgroup>
              </select>
              {atual.alvo && atual.alvo.tipo === "documento" && (
                <Btn onClick={() => { abrirDoc(atual.alvo.id); setTab("codificacao"); }}>abrir documento</Btn>
              )}
              <div style={{ flex: 1 }} />
              <Btn onClick={() => { removeMemo(atual.id); setSel(null); }} danger>excluir</Btn>
            </div>
            <textarea style={{ ...inp, minHeight: 300, resize: "vertical", lineHeight: 1.6 }} value={atual.body}
              placeholder="o que você decidiu, o que ficou em dúvida, o que mudou e por quê…"
              onChange={(e) => updateMemo(atual.id, { body: e.target.value })} />
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: C.sub, padding: 20 }}>Escolha um memo à esquerda, ou crie um novo.</div>
        )}
      </div>
    </div>
  );
}

/* ============ REDE DE CÓDIGOS, LIGADA ÀS CITAÇÕES ============
   Os nós são os códigos (tamanho = nº de recortes) e as ligações são as
   co-ocorrências: dois códigos se ligam quando aparecem NO MESMO recorte.
   Nada aqui é desenhado à mão — a rede é a codificação vista de outro ângulo,
   e clicar num nó ou numa ligação mostra os recortes que a sustentam. */
const RW = 900, RH = 560;

function layoutRede(nos, arestas, iteracoes = 320) {
  const n = nos.length;
  if (!n) return [];
  // começa num círculo (determinístico: a mesma codificação dá sempre o mesmo desenho)
  const pos = nos.map((_, i) => ({
    x: RW / 2 + RW * 0.33 * Math.cos((2 * Math.PI * i) / n),
    y: RH / 2 + RH * 0.33 * Math.sin((2 * Math.PI * i) / n),
  }));
  const k = Math.sqrt((RW * RH) / n) * 0.52;
  let temp = RW * 0.07;
  for (let it = 0; it < iteracoes; it++) {
    const d = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
        let dist = Math.hypot(dx, dy) || 0.01;
        const f = (k * k) / dist;                     // repulsão
        dx /= dist; dy /= dist;
        d[i].x += dx * f; d[i].y += dy * f; d[j].x -= dx * f; d[j].y -= dy * f;
      }
    }
    arestas.forEach((a) => {
      let dx = pos[a.i].x - pos[a.j].x, dy = pos[a.i].y - pos[a.j].y;
      let dist = Math.hypot(dx, dy) || 0.01;
      const f = ((dist * dist) / k) * Math.min(2.5, 0.6 + a.n * 0.35); // atração pelo peso
      dx /= dist; dy /= dist;
      d[a.i].x -= dx * f; d[a.i].y -= dy * f; d[a.j].x += dx * f; d[a.j].y += dy * f;
    });
    for (let i = 0; i < n; i++) {
      const m = Math.hypot(d[i].x, d[i].y) || 0.01;
      pos[i].x += (d[i].x / m) * Math.min(m, temp);
      pos[i].y += (d[i].y / m) * Math.min(m, temp);
      pos[i].x = Math.max(46, Math.min(RW - 46, pos[i].x));
      pos[i].y = Math.max(38, Math.min(RH - 38, pos[i].y));
    }
    temp = Math.max(0.8, temp * 0.972);
  }
  return pos;
}

function redeDoProjeto(project, { docFiltro = "", minimo = 1 } = {}) {
  const recortes = (project.excerpts || []).filter((e) => !docFiltro || e.docId === docFiltro);
  const freq = {};
  recortes.forEach((e) => [...new Set(e.codeIds || [])].forEach((id) => { freq[id] = (freq[id] || 0) + 1; }));
  const nos = (project.codes || []).filter((c) => freq[c.id]).map((c) => ({ ...c, n: freq[c.id] }));
  const idx = {}; nos.forEach((c, i) => (idx[c.id] = i));
  const pares = {};
  recortes.forEach((e) => {
    const ids = [...new Set(e.codeIds || [])].filter((id) => idx[id] != null);
    for (let a = 0; a < ids.length; a++)
      for (let b = a + 1; b < ids.length; b++) {
        const ch = [ids[a], ids[b]].sort().join("|");
        pares[ch] = (pares[ch] || 0) + 1;
      }
  });
  const arestas = Object.entries(pares).map(([ch, n]) => {
    const [a, b] = ch.split("|");
    return { a, b, n, i: idx[a], j: idx[b] };
  }).filter((x) => x.n >= minimo).sort((x, y) => y.n - x.n);
  return { nos, arestas, recortes };
}

function buildRedeInner(nos, arestas, pos, sel) {
  const o = [];
  const maxN = Math.max(1, ...nos.map((c) => c.n));
  const maxE = Math.max(1, ...arestas.map((a) => a.n));
  const raio = (c) => 9 + (c.n / maxN) * 17;
  arestas.forEach((a) => {
    const on = sel && sel.tipo === "aresta" && sel.a === a.a && sel.b === a.b;
    const p1 = pos[a.i], p2 = pos[a.j];
    if (!p1 || !p2) return;
    o.push(`<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="${on ? "#1f7a8c" : "#9aa7b2"}" stroke-width="${(1 + (a.n / maxE) * 5).toFixed(1)}" stroke-opacity="${on ? 1 : 0.55}"/>`);
    if (a.n > 1 || on) {
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      o.push(`<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="8.5" fill="#ffffff" stroke="${on ? "#1f7a8c" : "#cfd6dd"}"/>`);
      o.push(`<text x="${mx.toFixed(1)}" y="${(my + 3.5).toFixed(1)}" font-size="10" fill="#5a6b7a" text-anchor="middle">${a.n}</text>`);
    }
  });
  nos.forEach((c, i) => {
    const p = pos[i]; if (!p) return;
    const on = sel && sel.tipo === "no" && sel.id === c.id;
    const r = raio(c);
    o.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${c.color}" fill-opacity="0.85" stroke="${on ? "#13313a" : "#ffffff"}" stroke-width="${on ? 3 : 1.8}"/>`);
    o.push(`<text x="${p.x.toFixed(1)}" y="${(p.y + r + 13).toFixed(1)}" font-size="11.5" fill="#2b3a48" text-anchor="middle" stroke="#ffffff" stroke-width="3" paint-order="stroke">${escapeHTML(c.name)}</text>`);
    o.push(`<text x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" font-size="10.5" fill="#ffffff" text-anchor="middle" font-weight="700">${c.n}</text>`);
  });
  return o.join("");
}
function buildRedeSVG(nos, arestas, pos, sel) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${RW} ${RH}" width="${RW}" height="${RH}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"><rect width="${RW}" height="${RH}" fill="#ffffff"/>${buildRedeInner(nos, arestas, pos, sel)}</svg>`;
}

function RedeView({ project, codeMap, C, abrirDoc, setTab }) {
  const [sel, setSel] = React.useState(null);       // {tipo:"no"|"aresta", ...}
  const [minimo, setMinimo] = React.useState(1);
  const [docFiltro, setDocFiltro] = React.useState("");
  const svgRef = React.useRef(null);

  const { nos, arestas, recortes } = React.useMemo(() => redeDoProjeto(project, { docFiltro, minimo }), [project, docFiltro, minimo]);
  const pos = React.useMemo(() => layoutRede(nos, arestas), [nos, arestas]);
  const inner = React.useMemo(() => buildRedeInner(nos, arestas, pos, sel), [nos, arestas, pos, sel]);
  React.useEffect(() => { if (svgRef.current) svgRef.current.innerHTML = inner; }, [inner]);

  // citações por trás do que está selecionado
  const citacoes = React.useMemo(() => {
    if (!sel) return [];
    if (sel.tipo === "no") return recortes.filter((e) => (e.codeIds || []).includes(sel.id));
    return recortes.filter((e) => (e.codeIds || []).includes(sel.a) && (e.codeIds || []).includes(sel.b));
  }, [sel, recortes]);

  const clique = (ev) => {
    const svg = svgRef.current; if (!svg) return;
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    const x = ((ev.clientX - r.left) / r.width) * RW, y = ((ev.clientY - r.top) / r.height) * RH;
    let melhor = null, dmin = Infinity;
    nos.forEach((c, i) => { const d = Math.hypot(pos[i].x - x, pos[i].y - y); if (d < dmin) { dmin = d; melhor = { tipo: "no", id: c.id }; } });
    if (dmin <= 30) { setSel(sel && sel.tipo === "no" && sel.id === melhor.id ? null : melhor); return; }
    let melhorA = null, dminA = Infinity;
    arestas.forEach((a) => {
      const mx = (pos[a.i].x + pos[a.j].x) / 2, my = (pos[a.i].y + pos[a.j].y) / 2;
      const d = Math.hypot(mx - x, my - y);
      if (d < dminA) { dminA = d; melhorA = { tipo: "aresta", a: a.a, b: a.b, n: a.n }; }
    });
    setSel(dminA <= 26 ? melhorA : null);
  };

  const baixar = (blob, nome) => { const u = URL.createObjectURL(blob); const el = document.createElement("a"); el.href = u; el.download = nome; el.click(); setTimeout(() => URL.revokeObjectURL(u), 1500); };
  const exportarSVG = () => baixar(new Blob([buildRedeSVG(nos, arestas, pos, null)], { type: "image/svg+xml" }), "rede-codigos.svg");
  const exportarPNG = () => {
    const img = new Image();
    img.onload = () => { const cv = document.createElement("canvas"); cv.width = RW * 2; cv.height = RH * 2; const cx = cv.getContext("2d"); cx.scale(2, 2); cx.drawImage(img, 0, 0); cv.toBlob((b) => b && baixar(b, "rede-codigos.png")); };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(buildRedeSVG(nos, arestas, pos, null))));
  };

  const sels = { fontFamily: "system-ui", fontSize: 12.5, padding: "4px 7px", border: `1px solid ${C.line}`, borderRadius: 4, background: "#fff" };
  const titulo = sel ? (sel.tipo === "no" ? (codeMap[sel.id] || {}).name : `${(codeMap[sel.a] || {}).name} + ${(codeMap[sel.b] || {}).name}`) : null;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Rede de códigos</div>
        <span style={{ fontSize: 11.5, color: C.sub }}>{nos.length} códigos · {arestas.length} ligações · {recortes.length} recortes</span>
        <select style={sels} value={docFiltro} onChange={(e) => { setDocFiltro(e.target.value); setSel(null); }}>
          <option value="">todos os documentos</option>
          {docsDe(project).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <label style={{ fontSize: 12, color: C.sub, display: "flex", alignItems: "center", gap: 5 }}>
          co-ocorrência mínima
          <input type="number" min="1" max="20" value={minimo} onChange={(e) => setMinimo(Math.max(1, +e.target.value || 1))} style={{ ...sels, width: 54 }} />
        </label>
        <Btn onClick={exportarPNG}>PNG</Btn>
        <Btn onClick={exportarSVG}>SVG</Btn>
      </div>
      <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 10, lineHeight: 1.6 }}>
        Dois códigos se ligam quando foram aplicados <b>ao mesmo recorte</b>; o número na ligação é quantas vezes isso
        aconteceu, e o número dentro do círculo é quantos recortes o código tem. Clique num código ou numa ligação para
        ver as citações que sustentam aquilo — a rede não é um desenho à parte, é a sua codificação vista de outro ângulo.
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 520px", minWidth: 320, border: `1px solid ${C.line}`, borderRadius: 6, padding: 6 }}>
          {nos.length ? (
            <svg ref={svgRef} viewBox={`0 0 ${RW} ${RH}`} onClick={clique} style={{ width: "100%", height: "auto", display: "block", cursor: "pointer" }} />
          ) : (
            <div style={{ padding: "50px 20px", textAlign: "center", color: C.sub, fontSize: 13 }}>
              Nenhum código aplicado ainda — codifique alguns trechos para a rede aparecer.
            </div>
          )}
        </div>
        <div style={{ flex: "0 1 320px", minWidth: 260 }}>
          {sel ? (
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 0.4 }}>
                {sel.tipo === "no" ? "Código" : "Co-ocorrência"}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, margin: "3px 0 8px" }}>{titulo}</div>
              <div style={{ fontSize: 12, color: C.sub, marginBottom: 8 }}>
                {citacoes.length} citação(ões){sel.tipo === "aresta" ? " em que os dois códigos aparecem juntos" : ""}
              </div>
              <div style={{ maxHeight: 380, overflowY: "auto" }}>
                {citacoes.map((e) => (
                  <div key={e.id} style={{ borderTop: `1px solid ${C.line}`, padding: "7px 0" }}>
                    <button onClick={() => { abrirDoc(e.docId); setTab("codificacao"); }} style={{ ...btnStyle(C), fontSize: 10.5, padding: "2px 7px", marginBottom: 3 }}>
                      {nomeDoc(project, e.docId)}
                    </button>
                    <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>“{e.text}”</div>
                    {e.memo && <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>memo: {e.memo}</div>}
                  </div>
                ))}
              </div>
              <Btn onClick={() => setSel(null)}>limpar seleção</Btn>
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.6, padding: 10 }}>
              Clique num código (círculo) para ver todos os seus recortes, ou numa ligação (o número entre dois códigos)
              para ver só os recortes em que os dois aparecem juntos.
              {arestas.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Ligações mais fortes</div>
                  {arestas.slice(0, 6).map((a) => (
                    <div key={a.a + a.b} onClick={() => setSel({ tipo: "aresta", a: a.a, b: a.b, n: a.n })} style={{ cursor: "pointer", fontSize: 12, padding: "3px 0" }}>
                      <b>{a.n}×</b> {(codeMap[a.a] || {}).name} <span style={{ color: C.sub }}>+</span> {(codeMap[a.b] || {}).name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

return App;
})();

export { AnaliseQualitativa };
