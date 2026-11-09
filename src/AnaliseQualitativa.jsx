import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { SUITE, useModalTrap, BarrasH, marcarAlterado, useHistorico, useAtalhosDesfazer } from "./lib.js";

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

// Os projetos ficam só na memória desta página — nada é gravado no navegador.
// O formato de chave/valor (texto JSON) foi mantido para que trocar, criar e
// apagar projetos continue funcionando igual; o arquivo salvo é o que guarda.
const memoria = new Map();
async function loadKey(key) {
  const v = memoria.get(key);
  return v == null ? null : JSON.parse(v);
}
async function saveKey(key, val) {
  memoria.set(key, JSON.stringify(val));
  return { ok: true };
}
async function deleteKey(key) { memoria.delete(key); }

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
    wordExclude: [],  // palavras removidas da nuvem/frequentes
    updated: Date.now(),
  };
}

/* ---- corpus: helpers e migração do formato antigo (um texto por projeto) ----
   Projetos salvos antes desta versão têm project.text; viram um documento único,
   e os recortes sem docId passam a pertencer a ele. */
function migrarProjeto(p) {
  if (!p || typeof p !== "object") return p;
  const base = { atributos: [], wordExclude: [] };
  if (Array.isArray(p.docs) && p.docs.length) {
    const docAtual = p.docs.some((d) => d.id === p.docAtual) ? p.docAtual : p.docs[0].id;
    const d0 = p.docs[0].id;
    return { ...base, ...p, docAtual, excerpts: (p.excerpts || []).map((e) => (e.docId ? e : { ...e, docId: d0 })) };
  }
  const doc = { id: "d1", name: p.name || "Documento 1", text: typeof p.text === "string" ? p.text : "", attrs: {} };
  const { text, ...resto } = p;
  return { ...base, ...resto, docs: [doc], docAtual: "d1", excerpts: (p.excerpts || []).map((e) => ({ ...e, docId: "d1" })) };
}
/* ---- PDF: texto com as páginas mapeadas ----
   Embutir o pdf.js dobraria o arquivo (~1,6 MB → ~3,3 MB). Por isso ele é
   carregado sob demanda, da CDN, só quando um .pdf é escolhido: o app segue
   leve e offline para .txt/.docx, e ler PDF pede internet naquele momento.
   Roda SEM Worker: o módulo do worker é pendurado em globalThis.pdfjsWorker,
   o gancho de "fake worker" da própria biblioteca (funciona em file://).
   Usa o build "legacy": o moderno chama APIs recentes demais (Math.sumPrecise,
   Map.getOrInsertComputed...) e quebra no Safari com um TypeError. */
const PDFJS_RAIZ = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/";
const PDFJS_CDN = PDFJS_RAIZ + "legacy/build/";
let _pdfjs = null;
// o Safari não deixa percorrer um ReadableStream com "for await", e o
// getTextContent() do pdf.js faz exatamente isso: sem este suporte, todo PDF falha
function streamIteravel() {
  const RS = typeof ReadableStream !== "undefined" && ReadableStream.prototype;
  if (!RS || RS[Symbol.asyncIterator]) return;
  RS[Symbol.asyncIterator] = async function* () {
    const leitor = this.getReader();
    try {
      for (;;) { const { done, value } = await leitor.read(); if (done) return; yield value; }
    } finally { leitor.releaseLock(); }
  };
}
function carregarPdfjs() {
  if (!_pdfjs) {
    streamIteravel();
    const importar = (u) => import(/* webpackIgnore: true */ u);
    _pdfjs = Promise.all([importar(PDFJS_CDN + "pdf.min.mjs"), importar(PDFJS_CDN + "pdf.worker.min.mjs")])
      .then(([lib, worker]) => {
        globalThis.pdfjsWorker = worker;
        try { lib.GlobalWorkerOptions.workerSrc = PDFJS_CDN + "pdf.worker.min.mjs"; } catch {}
        return lib;
      })
      .catch((e) => { _pdfjs = null; throw Object.assign(new Error("sem-pdfjs"), { causa: e }); });
  }
  return _pdfjs;
}
async function textoDePDF(buffer, nome) {
  let lib;
  try { lib = await carregarPdfjs(); }
  catch (e) {
    try { console.error("PDF:", e.causa || e); } catch {}
    try { window.alert(`Para ler PDF ("${nome}") o Enlace baixa o leitor na hora, e isso precisa de internet. Conecte-se e importe de novo — ou converta para .docx/.txt.`); } catch {}
    return { text: "", paginas: null };
  }
  try {
    const pdf = await lib.getDocument({
      data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: false,
      // fontes padrão e CMaps: sem eles, PDFs com fontes não embutidas ou asiáticas saem sem texto
      standardFontDataUrl: PDFJS_RAIZ + "standard_fonts/", cMapUrl: PDFJS_RAIZ + "cmaps/", cMapPacked: true,
    }).promise;
    const partes = [], paginas = [];
    let pos = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const cont = await pg.getTextContent();
      // o PDF quebra uma linha em vários pedaços (às vezes um por sílaba): só
      // entra espaço quando há distância real entre o fim de um e o início do outro
      let t = "", ant = null;
      cont.items.forEach((it) => {
        const str = it.str || "", tr = it.transform || [1, 0, 0, 1, 0, 0];
        const x = tr[4], y = tr[5], corpo = Math.hypot(tr[2], tr[3]) || 10;
        if (str && ant && !/\s$/.test(t) && !/^\s/.test(str)) {
          const outraLinha = Math.abs(y - ant.y) > corpo * 0.5;
          if (outraLinha || x - ant.fim > corpo * 0.15) t += " ";
        }
        t += str;
        if (str) ant = { y, fim: x + (it.width || 0) };
        if (it.hasEOL) { t += "\n"; ant = null; }
      });
      const bloco = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n\n";
      paginas.push({ n: i, inicio: pos, fim: pos + bloco.length });
      partes.push(bloco); pos += bloco.length;
    }
    const text = partes.join("");
    if (!text.trim()) { try { window.alert(`"${nome}" não tem texto selecionável — parece digitalizado (imagem). Passe um OCR antes de importar.`); } catch {} }
    return { text, paginas };
  } catch (e) {
    try { console.error("PDF:", e); } catch {}
    const tipo = e && e.name;
    const msg = tipo === "PasswordException" ? `"${nome}" está protegido por senha. Remova a senha (ex.: abra e salve de novo como PDF) e importe outra vez.`
      : tipo === "InvalidPDFException" ? `"${nome}" não parece ser um PDF válido (arquivo corrompido ou incompleto).`
      : `Não foi possível ler o PDF "${nome}".\n\nDetalhe técnico: ${(e && (e.message || tipo)) || e}`;
    try { window.alert(msg); } catch {}
    return { text: "", paginas: null };
  }
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
  const notas = (p.metatexts || []).map((m) => paraNota(m, "Metatexto")).join("\n");
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

const QHELP = [
  { h: "O que é", items: ["Módulo de análise qualitativa de texto. Apoia o ciclo geral da análise: codificação > categorização > interpretação."] },
  { h: "Fluxo geral", items: ["1) Na aba Documentos, importe os textos do corpus (.txt, .docx, .pdf) — vários de uma vez, se quiser. 2) Selecione um trecho e aplique um ou mais códigos; o livro de códigos vale para todos os documentos. 3) Agrupe os códigos em categorias. 4) Na aba Consultas, recupere os recortes de todo o corpus e compare grupos de documentos. 5) Veja o quantitativo (frequências, nuvem de palavras). 6) Escreva o metatexto."] },
  { h: "As abas", items: [
    ["Codificação", "o texto fica à esquerda; selecione um trecho e marque com códigos (cores). Cada trecho marcado é um recorte (unidade de análise). Aqui também se renomeia e se mescla códigos."],
    ["Categorias", "crie categorias e associe códigos a elas. Categoria emergente nasce dos dados; a priori vem da teoria."],
    ["Quantitativo", "frequência de cada código e categoria, co-ocorrências, palavras frequentes e nuvem de palavras (com exportação em PNG/SVG)."],
    ["Metatexto", "onde se escreve a interpretação, apoiada nos recortes. Pode vincular a uma categoria."],
  ] },
  { h: "Importar texto e buscar", items: [
    ["Importar documentos", "pela aba Documentos ou pelo botão no cabeçalho do texto: .txt, .docx (Word) e .pdf. Cada arquivo vira um documento do corpus e o nome do arquivo vira o nome dele — importar NÃO substitui nem apaga o que já foi codificado. Em PDF, a página de cada trecho é preservada e aparece nas Consultas; o leitor de PDF é baixado na hora, então importar .pdf precisa de internet."],
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
  { h: "Salvar e compartilhar", items: [
    ["Salvar / Abrir", "guarda o projeto em .json (documentos, atributos, códigos, recortes, categorias, metatextos)."],
    ["REFI-QDA (.qde)", "o botão .qde exporta no formato de intercâmbio REFI-QDA, que NVivo, MAXQDA e ATLAS.ti abrem; o botão Abrir aceita .qde e .qdc de volta. Serve para não ficar preso a nenhum programa — inclusive a este."],
    ["Salvar Enlace", "no topo do programa, salva e restaura num único arquivo o trabalho das duas ferramentas (diagrama + análise textual)."],
    ["Compartilhar", "gera um HTML do projeto para leitura."],
    ["Relatório PDF", "só os resultados: frequência dos códigos, categorias, co-ocorrências, palavras mais frequentes, algumas citações por código, o metatexto e a lista dos documentos. O texto integral dos documentos não entra."],
  ] },
  { h: "Salvamento", items: ["Nada é gravado no navegador: o trabalho só existe enquanto a página está aberta. Use Salvar (.json) ou Salvar Enlace (backup completo) — se houver alterações não salvas, o navegador pergunta antes de fechar."] },
];

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
  if (node.nodeType !== 3) return base;
  // com a busca ativa o segmento vira vários filhos (texto + <mark>): soma o
  // comprimento do texto de todos os nós anteriores até o elemento [data-start],
  // senão o recorte cai em caracteres errados.
  let extra = offset;
  for (let cur = node; cur && cur !== el; cur = cur.parentNode)
    for (let sib = cur.previousSibling; sib; sib = sib.previousSibling) extra += (sib.textContent || "").length;
  return base + extra;
}

function escapeHTML(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// gera um HTML autocontido (somente leitura) que abre em qualquer navegador
/* Relatório: só os RESULTADOS da análise. O material integral (o texto de cada
   documento) fica de fora — ele está nos arquivos de origem e só inchava o PDF.
   Os recortes aparecem como citações ilustrativas, poucas por código. */
const CITACOES_POR_CODIGO = 3;
function buildStandaloneHTML(project, opts = {}) {
  const E = escapeHTML;
  const docs = docsDe(project);
  const docMap = Object.fromEntries(docs.map((d) => [d.id, d]));
  const exs = project.excerpts || [];
  const total = exs.length;
  const pct = (n) => (total ? ((n / total) * 100).toFixed(1).replace(".", ",") + "%" : "—");
  const h2 = (t) => `<h2 style="border-bottom:1px solid #e3e9ee;padding-bottom:4px;margin:30px 0 10px;font-size:18px">${t}</h2>`;
  const th = (t, al = "left") => `<th style="text-align:${al};padding:5px 8px;background:#f4f7f9;border-bottom:1px solid #e3e9ee;font-size:12px">${t}</th>`;
  const td = (t, al = "left") => `<td style="text-align:${al};padding:5px 8px;border-bottom:1px solid #eef1f4;vertical-align:top">${t}</td>`;
  const tabela = (cab, linhas) => `<table style="border-collapse:collapse;width:100%;font-size:13px">${"<tr>" + cab.join("") + "</tr>"}${linhas.join("")}</table>`;
  const bola = (cor) => `<span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${cor};margin-right:6px;vertical-align:-1px"></span>`;

  // códigos: frequência, % e em quantos documentos aparecem
  const freq = project.codes.map((c) => {
    const seus = exs.filter((e) => (e.codeIds || []).includes(c.id));
    return { c, n: seus.length, nDocs: new Set(seus.map((e) => e.docId)).size, seus };
  }).sort((x, y) => y.n - x.n);
  const maxN = Math.max(1, ...freq.map((f) => f.n));
  const tabCodigos = freq.length ? tabela(
    [th("Código"), th("Recortes", "right"), th("% dos recortes", "right"), th("Documentos", "right"), th("")],
    freq.map(({ c, n, nDocs }) => "<tr>" + td(bola(c.color) + `<b>${E(c.name)}</b>` + (c.desc ? `<div style="color:#777;font-size:12px;margin-top:2px">${E(c.desc)}</div>` : ""))
      + td(n, "right") + td(pct(n), "right") + td(`${nDocs}${docs.length > 1 ? ` de ${docs.length}` : ""}`, "right")
      + td(`<div style="width:120px;height:9px;background:#eef1f4;border-radius:4px"><div style="width:${(n / maxN) * 100}%;height:100%;background:${c.color};border-radius:4px"></div></div>`) + "</tr>")
  ) : "<p>—</p>";

  // categorias
  const catBlocks = project.categories.map((cat) => {
    const codes = project.codes.filter((c) => cat.codeIds.includes(c.id));
    const n = exs.filter((e) => (e.codeIds || []).some((id) => cat.codeIds.includes(id))).length;
    const chips = codes.map((c) => `<span style="background:${c.color};color:#fff;padding:2px 8px;border-radius:10px;font-size:12px;margin:2px;display:inline-block">${E(c.name)}</span>`).join("");
    return `<div style="margin-bottom:14px;page-break-inside:avoid"><h3 style="margin:0 0 4px;font-size:15px">${E(cat.name)} <span style="font-weight:400;color:#999;font-size:12.5px">(${E(cat.tipo || "")} · ${n} recortes · ${pct(n)})</span></h3>${cat.desc ? `<p style="margin:0 0 6px;color:#555;font-size:13.5px">${E(cat.desc)}</p>` : ""}<div>${chips || '<i style="color:#999;font-size:12px">sem códigos</i>'}</div></div>`;
  }).join("");

  // co-ocorrências (dois códigos no mesmo recorte)
  const pares = {};
  exs.forEach((e) => {
    const ids = [...new Set(e.codeIds || [])];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const k = [ids[i], ids[j]].sort().join("|"); pares[k] = (pares[k] || 0) + 1;
    }
  });
  const nome = Object.fromEntries(project.codes.map((c) => [c.id, c]));
  const topPares = Object.entries(pares).sort((x, y) => y[1] - x[1]).slice(0, 15).filter(([k]) => k.split("|").every((id) => nome[id]));
  const tabCooc = topPares.length ? tabela([th("Códigos"), th("Recortes em comum", "right")],
    topPares.map(([k, n]) => { const [a, b] = k.split("|").map((id) => nome[id]); return "<tr>" + td(bola(a.color) + E(a.name) + " &nbsp;+&nbsp; " + bola(b.color) + E(b.name)) + td(n, "right") + "</tr>"; })) : "";

  // palavras mais frequentes do corpus (respeita as palavras excluídas na aba Quantitativo)
  const fora = new Set((project.wordExclude || []).map((w) => w.toLowerCase()));
  const cont = {};
  for (const w of textoTodo(project).toLowerCase().match(/[\p{L}]+/gu) || []) {
    if (w.length < 3 || STOPWORDS_PT.has(w) || fora.has(w)) continue;
    cont[w] = (cont[w] || 0) + 1;
  }
  const palavras = Object.entries(cont).sort((x, y) => y[1] - x[1]).slice(0, 25);

  // corpus: só a ficha de cada documento, sem o texto
  const tabDocs = docs.length ? tabela([th("Documento"), th("Atributos"), th("Recortes", "right")],
    docs.map((d) => {
      const at = Object.entries(d.attrs || {}).filter(([, v]) => String(v).trim()).map(([k, v]) => `${E(k)}: ${E(v)}`).join(" · ");
      return "<tr>" + td(E(d.name) + (d.paginas ? ` <span style="color:#999;font-size:12px">(${d.paginas.length} p.)</span>` : "")) + td(at || '<span style="color:#bbb">—</span>') + td(exDoDoc(project, d.id).length, "right") + "</tr>";
    })) : "<p>—</p>";

  // citações ilustrativas
  const citacoes = freq.filter((f) => f.n).map(({ c, n, seus }) => {
    const itens = seus.slice(0, CITACOES_POR_CODIGO).map((e) => {
      const d = docMap[e.docId];
      const pg = d && paginaDoOffset(d, e.start);
      const fonte = [docs.length > 1 && d ? E(d.name) : "", pg ? "p. " + pg : ""].filter(Boolean).join(", ");
      const txt = (e.text || "").replace(/\s+/g, " ").trim();
      return `<blockquote style="margin:6px 0;padding:4px 12px;border-left:3px solid ${c.color};color:#444;font-size:13.5px">“${E(txt.length > 400 ? txt.slice(0, 400) + "…" : txt)}”${fonte ? ` <span style="color:#999;font-size:12px">(${fonte})</span>` : ""}</blockquote>`;
    }).join("");
    const resto = n - Math.min(n, CITACOES_POR_CODIGO);
    return `<div style="margin-bottom:14px;page-break-inside:avoid"><div style="font-weight:700;font-size:14px">${bola(c.color)}${E(c.name)} <span style="font-weight:400;color:#999;font-size:12.5px">(${n})</span></div>${itens}${resto ? `<div style="color:#999;font-size:12px;margin-left:15px">+ ${resto} outro(s) recorte(s)</div>` : ""}</div>`;
  }).join("");

  const metaBlocks = project.metatexts.map((m) => {
    const cat = m.categoryId && project.categories.find((k) => k.id === m.categoryId);
    return `<div style="margin-bottom:18px"><h3 style="margin:0 0 6px;font-size:15px">${E(m.title)}${cat ? ` <span style="font-weight:400;color:#999;font-size:12.5px">(categoria: ${E(cat.name)})</span>` : ""}</h3><p style="white-space:pre-wrap;line-height:1.7;margin:0;font-size:14px">${E(m.body)}</p></div>`;
  }).join("");

  const stamp = new Date().toLocaleDateString("pt-BR");
  const resumo = [[docs.length, "documentos"], [total, "recortes"], [project.codes.length, "códigos"], [project.categories.length, "categorias"]]
    .map(([n, r]) => `<div style="flex:1;min-width:110px;border:1px solid #e3e9ee;border-radius:8px;padding:10px 12px"><div style="font-size:22px;font-weight:700;color:#1f7a8c">${n}</div><div style="font-size:12px;color:#777">${r}</div></div>`).join("");
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${E(project.name)} — resultados</title>
<style>@media print{.noprint{display:none!important}}@page{margin:18mm}tr{page-break-inside:avoid}</style></head>
<body style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#2b3a48;background:#ffffff;margin:0"${opts.print ? ' onload="setTimeout(function(){window.print()},300)"' : ""}>
${opts.print ? `<div class="noprint" style="position:sticky;top:0;display:flex;gap:10px;align-items:center;background:#1f7a8c;color:#fff;padding:10px 16px;font-family:system-ui">Relatório pronto. <button onclick="window.print()" style="border:none;background:#fff;color:#1f7a8c;font-weight:700;border-radius:6px;padding:6px 14px;cursor:pointer">Imprimir / Salvar como PDF</button><span style="font-size:12px;opacity:.85">escolha "Salvar como PDF" no destino da impressão</span></div>` : ""}
<div style="max-width:880px;margin:0 auto;padding:34px 24px">
<h1 style="margin:0 0 4px">${E(project.name)}</h1>
<p style="color:#888;font-size:13px;margin:0 0 16px">Resultados da análise · exportado em ${stamp}</p>
<div style="display:flex;gap:10px;flex-wrap:wrap">${resumo}</div>
${h2("Códigos")}${tabCodigos}
${h2("Categorias")}${catBlocks || "<p>—</p>"}
${tabCooc ? h2("Co-ocorrências") + '<p style="color:#777;font-size:12.5px;margin:0 0 8px">Pares de códigos aplicados ao mesmo recorte.</p>' + tabCooc : ""}
${palavras.length ? h2("Palavras mais frequentes") + `<p style="font-size:13.5px;line-height:2">${palavras.map(([w, n]) => `<span style="background:#f4f7f9;border-radius:4px;padding:2px 7px;margin-right:4px;white-space:nowrap">${E(w)} <b>${n}</b></span>`).join(" ")}</p>` : ""}
${citacoes ? h2("Citações ilustrativas") + `<p style="color:#777;font-size:12.5px;margin:0 0 8px">Até ${CITACOES_POR_CODIGO} recortes por código.</p>` + citacoes : ""}
${h2("Metatexto")}${metaBlocks || "<p>—</p>"}
${h2("Corpus analisado")}${tabDocs}
</div></body></html>`;
}

// Abas da análise de texto, na ordem em que aparecem.
const ABAS = { corpus: "Documentos", codificacao: "Codificação", categorias: "Categorias", recuperacao: "Consultas", quantitativo: "Quantitativo", metatexto: "Metatexto" };


function App({ active = true }) {
  const [project, setProject] = useState(null);
  const [index, setIndex] = useState([]); // [{id,name}]
  const hist = useHistorico(project, setProject, { chave: project && project.id });
  useAtalhosDesfazer(active, hist.desfazer, hist.refazer);
  const [tab, setTab] = useState("codificacao");
  const [pending, setPending] = useState(null); // {start,end,text}
  const [selExcerpt, setSelExcerpt] = useState(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteVal, setPasteVal] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  useEffect(() => { if (!showHelp) return; const h = (e) => { if (e.key === "Escape") setShowHelp(false); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [showHelp]);
  const saveTimer = useRef(null);
  const projectRef = useRef(null); projectRef.current = project; // sempre o projeto atual, p/ flush do autosave
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

  // guarda o projeto na memória da página (não no navegador) e marca que há o que salvar
  const projetoInicial = useRef(true);
  useEffect(() => {
    if (!project) return;
    if (projetoInicial.current) projetoInicial.current = false; else marcarAlterado();
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const p = { ...project, updated: Date.now() };
      await saveKey(STORE.proj(p.id), p);
      const idx = (await loadKey(STORE.index)) || [];
      const ni = idx.map((x) => (x.id === p.id ? { id: p.id, name: p.name } : x));
      if (!ni.find((x) => x.id === p.id)) ni.push({ id: p.id, name: p.name });
      setIndex(ni);
      await saveKey(STORE.index, ni);
    }, 600);
  }, [project]);

  // grava o projeto atual imediatamente (cancela o debounce), para não perder as
  // últimas edições ao trocar/criar/abrir projeto dentro da janela de 600ms.
  const flushSave = async () => {
    clearTimeout(saveTimer.current); saveTimer.current = null;
    const p = projectRef.current;
    if (p) { try { await saveKey(STORE.proj(p.id), { ...p, updated: Date.now() }); } catch {} }
  };

  const update = useCallback((patch) => setProject((p) => ({ ...p, ...((typeof patch === "function" ? patch(p) : patch) || {}) })), []);
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
  async function switchProject(id, flush = true) {
    if (flush) await flushSave(); else { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const p = await loadKey(STORE.proj(id));
    if (p) { setProject(migrarProjeto(p)); await saveKey(STORE.active, id); setPending(null); setSelExcerpt(null); }
  }
  async function newProject() {
    await flushSave();
    const p = emptyProject("Projeto " + (index.length + 1));
    await saveKey(STORE.proj(p.id), p);
    const ni = [...index, { id: p.id, name: p.name }];
    setIndex(ni); await saveKey(STORE.index, ni); await saveKey(STORE.active, p.id);
    setProject(p); setPending(null); setSelExcerpt(null);
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
    clearTimeout(saveTimer.current); saveTimer.current = null; // não regravar o projeto que será apagado
    const ni = index.filter((x) => x.id !== project.id);
    await deleteKey(STORE.proj(project.id));
    if (ni.length === 0) { const p = emptyProject("Projeto 1"); await saveKey(STORE.proj(p.id), p); ni.push({ id: p.id, name: p.name }); }
    setIndex(ni); await saveKey(STORE.index, ni);
    await switchProject(ni[0].id, false);
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
    const lines = [];
    lines.push("# " + project.name + "\n");
    lines.push("## Categorias\n");
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
      lines.push("## Metatexto\n");
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
        // arquivo do formato antigo (um "text", sem "docs"): o docs vazio do projeto-base
        // não pode entrar, senão a migração o vê e descarta o texto do arquivo
        const { docs, docAtual, ...base } = emptyProject();
        p = migrarProjeto({ ...(Array.isArray(obj.docs) ? emptyProject() : base), ...obj, id: uid() });
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

  const TABS = Object.entries(ABAS);

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", color: C.ink, background: C.paper, height: "88vh", minHeight: 560, display: "flex", flexDirection: "column", borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: 8, gap: 12, padding: "10px 16px", borderBottom: `1px solid ${C.line}`, background: C.panel }}>
        <div style={{ fontWeight: 700, letterSpacing: 0.5, fontSize: 16, color: C.accent }}>Análise textual</div>
        <span style={{ fontSize: 11, color: C.sub, fontFamily: "system-ui" }}>análise qualitativa</span>
        <Btn onClick={() => setShowHelp(true)}>? Ajuda</Btn>
        <Btn onClick={hist.desfazer} disabled={!hist.podeDesfazer} title="desfazer (Ctrl+Z)">↶</Btn>
        <Btn onClick={hist.refazer} disabled={!hist.podeRefazer} title="refazer (Ctrl+Shift+Z)">↷</Btn>
        <div style={{ flex: 1 }} />
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

      {/* tabs */}
      <div style={{ display: "flex", gap: 2, padding: "6px 16px 0", background: C.panel, borderBottom: `1px solid ${C.line}` }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            fontFamily: "system-ui", fontSize: 13, padding: "7px 14px", border: "none", cursor: "pointer",
            background: tab === k ? C.paper : "transparent", color: tab === k ? C.accent : C.sub,
            borderBottom: tab === k ? `2px solid ${C.accent}` : "2px solid transparent", fontWeight: tab === k ? 600 : 400,
            borderRadius: "4px 4px 0 0",
          }}>{label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        {tab === "corpus" && (
          <CorpusView {...{ project, C, addDocs, renameDoc, removeDoc, abrirDoc, setAttr, addAtributo, removeAtributo, onFile, setTab }} />
        )}
        {tab === "recuperacao" && (
          <ConsultasView {...{ project, codeMap, C, abrirDoc, setTab }} />
        )}
        {tab === "codificacao" && (
          <CodificacaoView {...{ project, segments, codeMap, C, pending, setPending, selExcerpt, setSelExcerpt,
            addCode, assignCode, removeCode, renameCode, setCodeColor, mergeCode, removeExcerpt, setExcerptMemo, toggleCodeOnExcerpt,
            pasteMode, setPasteMode, pasteVal, setPasteVal, applyPaste, fileRef, onFile, onMouseUp, abrirDoc, setTab }} />
        )}
        {tab === "categorias" && (
          <CategoriasView {...{ project, codeFreq, C, addCategory, updateCategory, removeCategory, toggleCodeInCategory }} />
        )}
        {tab === "quantitativo" && (
          <QuantitativoView {...{ project, codeFreq, catFreq, cooc, codeMap, C, excludeWord, includeWord }} />
        )}
        {tab === "metatexto" && (
          <MetatextoView {...{ project, C, addMetatext, updateMetatext, removeMetatext }} />
        )}
      </div>
    </div>
  );
}

function btnStyle(C) {
  return { fontFamily: "system-ui", fontSize: 12, padding: "5px 10px", border: `1px solid ${C.line}`, borderRadius: 4, background: "#fff", color: C.ink, cursor: "pointer", whiteSpace: "nowrap" };
}
function Btn({ children, onClick, danger, disabled, title }) {
  const C = { line: "#e3e9ee", ink: "#2b3a48" };
  return <button onClick={onClick} disabled={disabled} title={title} style={{ ...btnStyle(C), color: danger ? "#b03a2e" : C.ink, opacity: disabled ? 0.45 : 1, cursor: disabled ? "default" : "pointer" }}>{children}</button>;
}

// ============ CODIFICAÇÃO ============
/* Documento aberto na Codificação: uma linha só, que abre uma coluna com a
   lista. Com dezenas de documentos, um botão por documento tomava a tela. */
function SeletorDocumentos({ project, C, abrirDoc, setTab }) {
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const docs = docsDe(project);
  const i = Math.max(0, docs.findIndex((d) => d.id === project.docAtual));
  const atual = docs[i];
  const nAtual = atual ? exDoDoc(project, atual.id).length : 0;
  const f = dobrarTexto(filtro.trim().toLowerCase());
  const lista = f ? docs.filter((d) => dobrarTexto((d.name || "").toLowerCase()).includes(f)) : docs;
  useEffect(() => {
    if (!aberto) return;
    const esc = (e) => { if (e.key === "Escape") setAberto(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto]);
  const escolher = (id) => { abrirDoc(id); setAberto(false); setFiltro(""); };
  return (
    <>
      <div style={{ padding: "5px 12px", borderBottom: `1px solid ${C.line}`, background: C.panel, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <button onClick={() => setAberto(!aberto)} aria-expanded={aberto} title="escolher o documento"
          style={{ ...btnStyle(C), fontSize: 11.5, padding: "3px 10px", display: "flex", alignItems: "center", gap: 6, minWidth: 0, maxWidth: "70%", background: aberto ? C.accent : "#fff", color: aberto ? "#fff" : C.ink }}>
          <span aria-hidden="true">☰</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700 }}>{atual ? atual.name : "—"}</span>
          {nAtual > 0 && <span style={{ opacity: 0.75 }}>({nAtual})</span>}
        </button>
        <span style={{ fontSize: 11, color: C.sub, whiteSpace: "nowrap" }}>{i + 1} de {docs.length}</span>
        <button onClick={() => abrirDoc(docs[i - 1].id)} disabled={i === 0} aria-label="documento anterior" title="documento anterior" style={{ ...btnStyle(C), padding: "2px 8px", fontSize: 12 }}>‹</button>
        <button onClick={() => abrirDoc(docs[i + 1].id)} disabled={i === docs.length - 1} aria-label="próximo documento" title="próximo documento" style={{ ...btnStyle(C), padding: "2px 8px", fontSize: 12 }}>›</button>
        <button onClick={() => setTab("corpus")} style={{ ...btnStyle(C), fontSize: 11, padding: "3px 9px", marginLeft: "auto" }}>gerenciar…</button>
      </div>
      {aberto && (
        <div role="dialog" aria-label="Documentos do projeto"
          style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 270, maxWidth: "85%", zIndex: 5, background: "#fff", borderRight: `1px solid ${C.line}`, boxShadow: "4px 0 14px rgba(0,0,0,.08)", display: "flex", flexDirection: "column", fontFamily: "system-ui" }}>
          <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10.5, color: C.sub, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Documentos ({docs.length})</span>
            <button onClick={() => setAberto(false)} aria-label="fechar" title="fechar (Esc)" style={{ ...btnStyle(C), padding: "1px 7px", fontSize: 12, marginLeft: "auto" }}>✕</button>
          </div>
          <div style={{ padding: "6px 10px" }}>
            <input autoFocus value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="filtrar por nome…"
              onKeyDown={(e) => { if (e.key === "Enter" && lista.length) escolher(lista[0].id); }}
              style={{ width: "100%", boxSizing: "border-box", fontSize: 12, padding: "4px 8px", border: `1px solid ${C.line}`, borderRadius: 4 }} />
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "0 6px 8px" }}>
            {lista.map((d) => {
              const on = d.id === project.docAtual;
              const n = exDoDoc(project, d.id).length;
              return (
                <button key={d.id} onClick={() => escolher(d.id)} title={d.name}
                  style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", border: "none", borderRadius: 4, padding: "6px 8px", marginBottom: 1, cursor: "pointer", fontSize: 12.5, background: on ? C.accent : "transparent", color: on ? "#fff" : C.ink, fontWeight: on ? 700 : 400 }}>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                  {n > 0 && <span style={{ fontSize: 11, opacity: 0.75 }}>{n}</span>}
                </button>
              );
            })}
            {!lista.length && <div style={{ fontSize: 12, color: C.sub, padding: 8 }}>nenhum documento com esse nome</div>}
          </div>
        </div>
      )}
    </>
  );
}

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
      <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: `1px solid ${C.line}`, position: "relative", minWidth: 0 }}>
        {!textoDe(project) && !pasteMode && (
          <div style={{ margin: "auto", textAlign: "center", fontFamily: "system-ui", color: C.sub }}>
            <p style={{ marginBottom: 16, fontSize: 14 }}>Comece pelo material a analisar.</p>
            <label style={{ ...btnStyle(C), display: "inline-block", marginRight: 8, background: C.accent, color: "#fff", border: "none", padding: "8px 16px" }}>
              Abrir arquivos (.txt, .docx, .pdf)<input ref={fileRef} type="file" accept=".txt,.docx,.pdf,text/plain,application/pdf" multiple onChange={onFile} style={{ display: "none" }} />
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
              <SeletorDocumentos {...{ project, C, abrirDoc, setTab }} />
            )}
            <div style={{ padding: "6px 12px", fontFamily: "system-ui", fontSize: 11, color: C.sub, borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span>{textoDe(project).length} caracteres</span>
              <span>{project.excerpts.length} recortes</span>
              <label style={{ ...btnStyle(C), padding: "3px 9px", fontSize: 11, cursor: "pointer" }} title="acrescentar documentos ao corpus (.txt, .docx, .pdf)">
                + Documentos<input type="file" accept=".txt,.docx,.pdf,text/plain,application/pdf" multiple onChange={onFile} style={{ display: "none" }} />
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
function CategoriasView({ project, codeFreq, C, addCategory, updateCategory, removeCategory, toggleCodeInCategory }) {
  const assigned = new Set(project.categories.flatMap((c) => c.codeIds));
  const livres = codeFreq.filter((c) => !assigned.has(c.id));
  return (
    <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
      <div style={{ fontFamily: "system-ui", fontSize: 12.5, color: C.sub, lineHeight: 1.5, marginBottom: 12, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 10px" }}><b>Categorias:</b> Crie categorias e associe códigos a elas. Emergentes nascem dos dados; a priori vêm da teoria.</div>
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
            <BarrasH dados={codeFreq} />
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

// ============ METATEXTO ============
function MetatextoView({ project, C, addMetatext, updateMetatext, removeMetatext }) {
  const metaHint = "Escreva aqui a interpretação, apoiada nos recortes.";
  return (
    <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <button onClick={() => addMetatext(null)} style={{ ...btnStyle(C), background: C.accent, color: "#fff", border: "none" }}>+ novo texto</button>
        <span style={{ fontFamily: "system-ui", fontSize: 11, color: C.sub }}>vincule a uma categoria para gerar a partir dos excertos</span>
      </div>
      {project.metatexts.length === 0 && <div style={{ fontFamily: "system-ui", fontSize: 13, color: C.sub }}>Nenhum texto ainda. É aqui que se escreve a etapa de <b>metatexto</b>: {metaHint}</div>}
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
        <label style={btnStyle(C)}>+ Documentos (.txt, .docx, .pdf)
          <input type="file" accept=".txt,.docx,.pdf,text/plain,application/pdf" multiple onChange={onFile} style={{ display: "none" }} />
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
/* Busca no texto bruto de todos os documentos — é o que encontra o que ainda
   NÃO foi codificado. Dobra os caracteres (minúsculas, sem acento) preservando
   os índices, para o trecho de contexto sair do texto original. */
function dobrarTexto(s) {
  let o = "";
  for (let i = 0; i < s.length; i++) {
    const d = s[i].normalize("NFD");
    o += (d[0] || s[i]).toLowerCase();
  }
  return o;
}
function buscarNoCorpus(project, termo, limitePorDoc = 60) {
  const alvo = dobrarTexto(String(termo || "").trim());
  if (alvo.length < 2) return [];
  return docsDe(project).map((d) => {
    const texto = d.text || "";
    const dobrado = dobrarTexto(texto);
    const achados = [];
    let i = dobrado.indexOf(alvo);
    while (i >= 0 && achados.length < limitePorDoc) {
      const ini = Math.max(0, i - 55), fim = Math.min(texto.length, i + alvo.length + 55);
      achados.push({
        pos: i,
        antes: (ini > 0 ? "…" : "") + texto.slice(ini, i),
        termo: texto.slice(i, i + alvo.length),
        depois: texto.slice(i + alvo.length, fim) + (fim < texto.length ? "…" : ""),
        codificado: (project.excerpts || []).some((e) => e.docId === d.id && i >= e.start && i < e.end),
      });
      i = dobrado.indexOf(alvo, i + alvo.length);
    }
    const total = achados.length + (i >= 0 ? 1 : 0); // sinaliza corte
    return { doc: d, achados, cortado: i >= 0, total };
  }).filter((x) => x.achados.length);
}

function ConsultasView({ project, codeMap, C, abrirDoc, setTab }) {
  const [sel, setSel] = React.useState([]);            // códigos escolhidos
  const [modo, setModo] = React.useState("qualquer");  // qualquer | todos | nenhum
  const [docFiltro, setDocFiltro] = React.useState("");
  const [attrChave, setAttrChave] = React.useState("");
  const [attrValor, setAttrValor] = React.useState("");
  const [busca, setBusca] = React.useState("");
  const [alvoBusca, setAlvoBusca] = React.useState("recortes"); // "recortes" | "corpus"
  const noCorpus = React.useMemo(() => (alvoBusca === "corpus" ? buscarNoCorpus(project, busca) : []), [alvoBusca, busca, project]);
  const totalCorpus = noCorpus.reduce((s, x) => s + x.achados.length, 0);
  const naoCodificados = noCorpus.reduce((s, x) => s + x.achados.filter((a) => !a.codificado).length, 0);

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
    const q = alvoBusca === "recortes" ? busca.trim().toLowerCase() : "";
    return (project.excerpts || []).filter((e) => {
      if (!docsPermitidos.has(e.docId)) return false;
      if (q && !(e.text || "").toLowerCase().includes(q)) return false;
      if (!sel.length) return true;
      const ids = e.codeIds || [];
      if (modo === "qualquer") return sel.some((c) => ids.includes(c));
      if (modo === "todos") return sel.every((c) => ids.includes(c));
      return !sel.some((c) => ids.includes(c)); // nenhum
    });
  }, [project.excerpts, docsPermitidos, sel, modo, busca, alvoBusca]);

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
            <input style={{ ...sels, minWidth: 150 }} placeholder={alvoBusca === "corpus" ? "palavra no texto dos documentos…" : "texto dentro do recorte…"} value={busca} onChange={(e) => setBusca(e.target.value)} />
            <div style={{ display: "flex", border: `1px solid ${C.line}`, borderRadius: 4, overflow: "hidden" }}>
              {[["recortes", "nos recortes"], ["corpus", "no texto"]].map(([v, l]) => (
                <button key={v} onClick={() => setAlvoBusca(v)} title={v === "corpus" ? "procura no texto bruto de todos os documentos — inclusive no que ainda não foi codificado" : "procura só dentro dos recortes já codificados"}
                  style={{ border: "none", padding: "4px 9px", fontSize: 11.5, cursor: "pointer", fontWeight: 600, background: alvoBusca === v ? C.accent : "#fff", color: alvoBusca === v ? "#fff" : C.sub }}>{l}</button>
              ))}
            </div>
            <Btn onClick={exportar}>CSV</Btn>
          </div>

          {alvoBusca === "corpus" && (
            <div style={{ marginBottom: 10 }}>
              {busca.trim().length < 2 ? (
                <div style={{ fontSize: 12.5, color: C.sub }}>Digite ao menos duas letras para procurar no texto de todos os documentos.</div>
              ) : (
                <>
                  <div style={{ fontSize: 12.5, marginBottom: 6 }}>
                    <b>{totalCorpus}</b> ocorrência(s) de “{busca.trim()}” em <b>{noCorpus.length}</b> documento(s)
                    {naoCodificados > 0 && <span style={{ color: "#b06a1f" }}> · <b>{naoCodificados}</b> fora de qualquer recorte</span>}
                  </div>
                  <div style={{ maxHeight: 340, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 6 }}>
                    {noCorpus.map(({ doc, achados, cortado }) => (
                      <div key={doc.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: C.panel }}>
                          <b style={{ fontSize: 12.5 }}>{doc.name}</b>
                          <span style={{ fontSize: 11.5, color: C.sub }}>{achados.length}{cortado ? "+" : ""} ocorrência(s)</span>
                          <div style={{ flex: 1 }} />
                          <button onClick={() => { abrirDoc(doc.id); setTab("codificacao"); }} style={{ ...btnStyle(C), fontSize: 10.5, padding: "2px 8px" }}>abrir e codificar</button>
                        </div>
                        {achados.map((a, i) => (
                          <div key={i} style={{ padding: "5px 12px", fontSize: 12.5, lineHeight: 1.5, borderTop: `1px solid ${C.line}` }}>
                            <span style={{ color: C.sub }}>{a.antes}</span>
                            <mark style={{ background: a.codificado ? "#cde8d5" : "#ffe9b8", padding: "0 2px", borderRadius: 2 }}>{a.termo}</mark>
                            <span style={{ color: C.sub }}>{a.depois}</span>
                            {!a.codificado && <span style={{ fontSize: 10.5, color: "#b06a1f", marginLeft: 6 }}>não codificado</span>}
                          </div>
                        ))}
                      </div>
                    ))}
                    {!noCorpus.length && <div style={{ padding: 14, fontSize: 12.5, color: C.sub }}>Nada encontrado no texto dos documentos.</div>}
                  </div>
                </>
              )}
            </div>
          )}

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

return App;
})();

export { AnaliseQualitativa };
