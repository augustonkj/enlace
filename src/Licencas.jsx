import React, { useState } from "react";

/* ============================================================
   Sobre › Licenças e referências.

   - Licença do próprio Enlace.
   - Bibliotecas de terceiros embutidas no arquivo: a lista e os textos de
     licença vêm do build (window.ENLACE_LICENCAS, montado por
     build_enlace.mjs a partir de node_modules), então não fica desatualizada.
   - O pdf.js não vai embutido: é baixado do jsDelivr só ao importar um PDF.
   - Obras e padrões em que as ferramentas se apoiam (métodos, testes,
     formatos). Ao citar um método novo no app, acrescente-o aqui.
   ============================================================ */

const REFERENCIAS = [
  { area: "Análise textual", itens: [
    "REFI-QDA. REFI-QDA Standard: QDA-XML (projetos .qdpx/.qde e codebook .qdc). Rotterdam Exchange Format Initiative, 2019. Disponível em: https://www.qdasoftware.org.",
  ] },
  { area: "Revisão de literatura", itens: [
    "PAGE, M. J. et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. BMJ, v. 372, n71, 2021. DOI: 10.1136/bmj.n71.",
  ] },
  { area: "Teoria Ator-Rede", itens: [
    "LATOUR, B. Reassembling the social: an introduction to actor-network-theory. Oxford: Oxford University Press, 2005.",
    "CALLON, M. Some elements of a sociology of translation: domestication of the scallops and the fishermen of St Brieuc Bay. In: LAW, J. (org.). Power, action and belief: a new sociology of knowledge? London: Routledge & Kegan Paul, 1986. p. 196-233.",
    "BRANDES, U. A faster algorithm for betweenness centrality. Journal of Mathematical Sociology, v. 25, n. 2, p. 163-177, 2001.",
  ] },
  { area: "Análise Quantitativa", itens: [
    "MOREIRA, M. A. Metodologias de pesquisa em ensino. São Paulo: Livraria da Física, 2011. (os testes estatísticos seguem os tópicos do capítulo de métodos quantitativos)",
    "SIEGEL, S. Nonparametric statistics for the behavioral sciences. New York: McGraw-Hill, 1956.",
    "KRUSKAL, W. H.; WALLIS, W. A. Use of ranks in one-criterion variance analysis. Journal of the American Statistical Association, v. 47, n. 260, p. 583-621, 1952.",
    "KERLINGER, F. N. Foundations of behavioral research. New York: Holt, Rinehart and Winston, 1964.",
    "SHAPIRO, S. S.; WILK, M. B. An analysis of variance test for normality (complete samples). Biometrika, v. 52, n. 3-4, p. 591-611, 1965.",
    "ROYSTON, P. Approximating the Shapiro-Wilk W-test for non-normality. Statistics and Computing, v. 2, n. 3, p. 117-119, 1992.",
    "BROWN, M. B.; FORSYTHE, A. B. Robust tests for the equality of variances. Journal of the American Statistical Association, v. 69, n. 346, p. 364-367, 1974.",
    "SILVEIRA, F. L. da. Material didático do Instituto de Física da UFRGS (Porto Alegre), seguido no cálculo do Alfa de Cronbach.",
  ] },
];

// carregado sob demanda, fora do arquivo (ver PDFJS_RAIZ em AnaliseQualitativa.jsx)
const SOB_DEMANDA = [
  { nome: "pdf.js (pdfjs-dist)", licenca: "Apache-2.0", autor: "Mozilla Foundation", url: "https://github.com/mozilla/pdf.js",
    nota: "não vai embutido: é baixado do jsDelivr só quando você importa um PDF na análise textual." },
];

const h3 = { margin: "16px 0 6px", fontSize: 13, color: "#1f7a8c", textTransform: "uppercase", letterSpacing: ".5px" };
const p = { margin: "0 0 8px", fontSize: 12.5, color: "#46555f", lineHeight: 1.6 };
const link = { color: "#1f7a8c" };

function Pacote({ x }) {
  const [aberto, setAberto] = useState(false);
  return (
    <li style={{ padding: "6px 0", borderBottom: "1px solid #f0f4f7", listStyle: "none" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 12.5, color: "#2b3a42" }}>{x.nome}</b>
        {x.versao && <span style={{ fontSize: 11.5, color: "#9aa7b2" }}>{x.versao}</span>}
        <span style={{ fontSize: 11, fontWeight: 700, color: "#46626c", background: "#eef3f6", borderRadius: 4, padding: "1px 6px" }}>{x.licenca || "licença não declarada"}</span>
        {x.autor && <span style={{ fontSize: 11.5, color: "#6b7c8a" }}>{x.autor}</span>}
        <span style={{ flex: 1 }} />
        {x.url && /^https?:/.test(x.url) && <a href={x.url} target="_blank" rel="noopener noreferrer" style={{ ...link, fontSize: 11.5 }}>site</a>}
        {x.texto && <button onClick={() => setAberto(!aberto)} style={{ border: "none", background: "transparent", color: "#1f7a8c", fontSize: 11.5, cursor: "pointer", padding: 0 }}>{aberto ? "ocultar licença" : "ver licença"}</button>}
      </div>
      {!x.texto && !x.nota && <div style={{ fontSize: 11.5, color: "#7a8b99", marginTop: 2 }}>o pacote não traz o texto da licença; veja o site do projeto.</div>}
      {x.nota && <div style={{ fontSize: 11.5, color: "#7a8b99", marginTop: 2 }}>{x.nota}</div>}
      {aberto && <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, lineHeight: 1.5, color: "#46555f", background: "#f7f9fa", border: "1px solid #e3e9ee", borderRadius: 6, padding: "8px 10px", margin: "6px 0 2px", maxHeight: 260, overflow: "auto" }}>{x.texto}</pre>}
    </li>
  );
}

export function PainelLicencas() {
  const embutidos = (typeof window !== "undefined" && Array.isArray(window.ENLACE_LICENCAS)) ? window.ENLACE_LICENCAS : [];
  return (
    <div>
      <h3 style={{ ...h3, marginTop: 0 }}>Licença do Enlace</h3>
      <p style={p}>
        © 2026 Antonio Augusto Ignacio e Evandro Alves Nakajima. O Enlace é distribuído sob a licença{" "}
        <a href="https://creativecommons.org/licenses/by-nc/4.0/deed.pt-br" target="_blank" rel="noopener noreferrer" style={link}>Creative Commons Atribuição-NãoComercial 4.0 Internacional (CC BY-NC 4.0)</a>:
        você pode usar, copiar, adaptar e redistribuir, desde que cite os autores e não use para fins comerciais.
        As bibliotecas de terceiros abaixo continuam sob as licenças próprias.
      </p>

      <h3 style={h3}>Bibliotecas de terceiros</h3>
      <p style={p}>Embutidas neste arquivo ({embutidos.length}). Agradecemos aos autores e mantenedores.</p>
      <ul style={{ margin: 0, padding: 0 }}>
        {embutidos.map((x) => <Pacote key={x.nome} x={x} />)}
        {SOB_DEMANDA.map((x) => <Pacote key={x.nome} x={x} />)}
      </ul>

      <h3 style={h3}>Referências</h3>
      <p style={p}>Obras, métodos e padrões em que as ferramentas do Enlace se baseiam.</p>
      {REFERENCIAS.map((g) => (
        <div key={g.area} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9aa7b1", textTransform: "uppercase", letterSpacing: ".5px", margin: "8px 0 4px" }}>{g.area}</div>
          {g.itens.map((t, i) => <p key={i} style={{ ...p, margin: "0 0 5px", paddingLeft: 18, textIndent: -18 }}>{t}</p>)}
        </div>
      ))}
    </div>
  );
}
