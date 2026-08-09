import React, { useState, useRef, useEffect } from "react";
import { SUITE, useModalTrap, Menu, MenuItem } from "./lib.js";
import { EditorTAR } from "./EditorTAR.jsx";
import { AnaliseQualitativa } from "./AnaliseQualitativa.jsx";
import { AnaliseQuantitativa } from "./AnaliseQuantitativa.jsx";
import { DiagramaGeral } from "./DiagramaGeral.jsx";
import { CampoBourdieu } from "./CampoBourdieu.jsx";

/* ===== Casca: seletor de ferramentas ===== */
const TOURQ = [
  { t: "Bem-vindo ao Enlace", b: "O Enlace reúne três janelas: Análise Qualitativa (que abriga a análise de texto, a Teoria Ator-Rede e o Campo de Bourdieu), Mapa conceitual e Análise Quantitativa. Tudo começa em branco; cada ferramenta tem um botão Exemplo (no menu Projeto) se você quiser ver um modelo pronto." },
  { t: "Texto", b: "A primeira sub-aba da Análise Qualitativa: cole ou abra um texto, selecione trechos e aplique códigos, agrupe em categorias e escreva o metatexto. São oito métodos — de Bardin e ATD à análise praxiológica de Bourdieu —, e trocar de método muda a terminologia, não os seus dados.", tool: "qual", sub: "texto" },
  { t: "Ator-Rede", b: "A segunda sub-aba: cadastre os actantes e as associações da Teoria Ator-Rede em tabelas e alterne, ali mesmo, entre Tabela e Diagrama — são a mesma rede vista de dois jeitos.", tool: "qual", sub: "tar" },
  { t: "Campo (Bourdieu)", b: "A terceira sub-aba: descreva o campo (capital em disputa, illusio, doxa, polos) e dê a cada agente os quatro capitais. O gráfico posiciona todo mundo no espaço social — volume de capital na vertical, composição (econômico × cultural) na horizontal — e desenha trajetórias.", tool: "qual", sub: "campo" },
  { t: "Mapa conceitual", b: "Um mapa conceitual livre, sem as regras da Teoria Ator-Rede: nós e ligações rotuladas, para organizar ideias.", tool: "diag" },
  { t: "Análise Quantitativa", b: "Espaço dedicado aos testes estatísticos, independente das outras janelas.", tool: "quant" },
];
const QUAL_SUBS = [["texto", "Texto"], ["tar", "Ator-Rede"], ["campo", "Campo (Bourdieu)"]];
export default function App() {
  const [tool, setTool] = useState("qual");
  const [qualSub, setQualSub] = useState("texto"); // sub-aba da Qualitativa: "texto" | "tar" | "campo"
  const [tarView, setTarView] = useState("analise"); // dentro de Ator-Rede: "analise" (tabela) | "diagrama"
  const [tourQ, setTourQ] = useState(-1);
  const tabs = [["qual", "Análise Qualitativa"], ["diag", "Mapa conceitual"], ["quant", "Análise Quantitativa"]];
  const showTar = tool === "qual" && qualSub === "tar";
  const finishTourQ = () => { setTourQ(-1); try { window.localStorage.setItem("enlace_tour_done", "1"); } catch {} };
  // "qualmap_tour_done": chave do nome antigo — quem já viu o tutorial não vê de novo
  useEffect(() => { try { if (!window.localStorage.getItem("enlace_tour_done") && !window.localStorage.getItem("qualmap_tour_done")) setTourQ(0); } catch {} }, []);
  useEffect(() => { if (tourQ < 0) return; const st = TOURQ[tourQ]; if (!st) return; if (st.tool && tool !== st.tool) setTool(st.tool); if (st.sub) setQualSub(st.sub); }, [tourQ]);
  const miniBtn = { border: "1px solid #cfd6dd", background: "#fff", color: "#46555f", borderRadius: 6, padding: "6px 12px", fontSize: 12.5, cursor: "pointer", fontWeight: 600 };
  const primaryBtn = { border: "none", background: "#1f7a8c", color: "#fff", borderRadius: 6, padding: "6px 14px", fontSize: 12.5, cursor: "pointer", fontWeight: 600 };
  const fileRefAll = useRef(null);
  const tourQRef = useRef(null);
  const aboutRef = useRef(null);
  const [showAbout, setShowAbout] = useState(false);
  const [msg, setMsg] = useState("");
  useModalTrap(tourQ >= 0, tourQRef, finishTourQ);
  useModalTrap(showAbout, aboutRef, () => setShowAbout(false));
  const salvarTudo = async () => {
    try {
      const tar = SUITE.getTar ? SUITE.getTar() : null;
      const qual = SUITE.getQual ? await SUITE.getQual() : null;
      const geral = SUITE.getGeral ? SUITE.getGeral() : null;
      const campo = SUITE.getCampo ? SUITE.getCampo() : null;
      const payload = { __enlace: 1, savedAt: new Date().toISOString(), tar, qual, geral, campo };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const u = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = u; a.download = `enlace-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1500);
      setMsg("projeto do Enlace salvo"); setTimeout(() => setMsg(""), 2500);
    } catch (e) { setMsg("falha ao salvar"); setTimeout(() => setMsg(""), 2500); }
  };
  const abrirTudo = (ev) => {
    const f = ev.target.files && ev.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      try {
        const o = JSON.parse(String(r.result));
        if (!o || !(o.__enlace || o.__qualmap)) { setMsg("este arquivo não é um projeto do Enlace"); setTimeout(() => setMsg(""), 3000); return; }
        if (o.tar && SUITE.setTar) SUITE.setTar(o.tar);
        if (o.qual && SUITE.setQual) await SUITE.setQual(o.qual);
        if (o.geral && SUITE.setGeral) SUITE.setGeral(o.geral);
        if (o.campo && SUITE.setCampo) SUITE.setCampo(o.campo);
        setMsg("projeto do Enlace restaurado"); setTimeout(() => setMsg(""), 2500);
      } catch (e) { setMsg("não foi possível abrir o arquivo"); setTimeout(() => setMsg(""), 3000); }
    };
    r.readAsText(f); ev.target.value = "";
  };
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", borderBottom: "1px solid #e3e9ee", background: "#fff", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <circle cx="6" cy="7" r="3" fill="#1f7a8c" />
            <circle cx="20" cy="6" r="2.4" fill="#7a5ea8" />
            <circle cx="19" cy="19" r="3" fill="#2e7d4f" />
            <circle cx="7" cy="18" r="2.2" fill="#b06a1f" />
            <line x1="6" y1="7" x2="20" y2="6" stroke="#cfd6dd" strokeWidth="1.4" />
            <line x1="6" y1="7" x2="19" y2="19" stroke="#cfd6dd" strokeWidth="1.4" />
            <line x1="20" y1="6" x2="19" y2="19" stroke="#cfd6dd" strokeWidth="1.4" />
            <line x1="7" y1="18" x2="19" y2="19" stroke="#cfd6dd" strokeWidth="1.4" />
            <line x1="6" y1="7" x2="7" y2="18" stroke="#cfd6dd" strokeWidth="1.4" />
          </svg>
          <div style={{ lineHeight: 1.05 }}>
            <div style={{ fontWeight: 800, color: "#1f7a8c", fontSize: 17, letterSpacing: 0.2 }}>Enlace</div>
            <div style={{ fontSize: 10.5, color: "#7a8b99" }}>análises qualitativas, quantitativas e diagramas</div>
          </div>
        </div>
        <div style={{ display: "flex", border: "1px solid #cfd6dd", borderRadius: 6, overflow: "hidden", marginLeft: 6 }}>
          {tabs.map(([v, l]) => (
            <button key={v} onClick={() => setTool(v)} style={{ border: "none", padding: "7px 14px", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: tool === v ? "#1f7a8c" : "#fff", color: tool === v ? "#fff" : "#46555f" }}>{l}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ flex: 1 }} />
        {msg && <span style={{ fontSize: 11.5, color: "#1f7a8c", marginRight: 4 }}>{msg}</span>}
        <Menu label="Arquivo" align="right" width={210} btnStyle={miniBtn} title="salvar/abrir o Enlace inteiro e tutorial">
          {(close) => (<>
            <MenuItem onClick={() => { salvarTudo(); close(); }}>Salvar Enlace…</MenuItem>
            <MenuItem onClick={() => { fileRefAll.current?.click(); close(); }}>Abrir Enlace…</MenuItem>
            <MenuItem onClick={() => { setTourQ(0); close(); }}>Tutorial</MenuItem>
          </>)}
        </Menu>
        <input ref={fileRefAll} type="file" accept=".json,application/json" onChange={abrirTudo} style={{ display: "none" }} />
        <button onClick={() => setShowAbout(true)} style={miniBtn} title="sobre o Enlace">Sobre</button>
      </div>
      {tool === "qual" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderBottom: "1px solid #eef1f4", background: "#fafbfc", flexShrink: 0, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: "#7a8b99", fontWeight: 600 }}>Qualitativa:</span>
          <div style={{ display: "flex", border: "1px solid #cfd6dd", borderRadius: 6, overflow: "hidden" }}>
            {QUAL_SUBS.map(([v, l]) => (
              <button key={v} onClick={() => setQualSub(v)} style={{ border: "none", padding: "5px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, background: qualSub === v ? "#1f7a8c" : "#fff", color: qualSub === v ? "#fff" : "#5a6b7a" }}>{l}</button>
            ))}
          </div>
          {qualSub === "tar" && (<>
            <span style={{ width: 1, height: 20, background: "#dde3e9", margin: "0 2px" }} />
            <div style={{ display: "flex", border: "1px solid #cfd6dd", borderRadius: 6, overflow: "hidden" }}>
              {[["analise", "Tabela"], ["diagrama", "Diagrama"]].map(([v, l]) => (
                <button key={v} onClick={() => setTarView(v)} style={{ border: "none", padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, background: tarView === v ? "#46626c" : "#fff", color: tarView === v ? "#fff" : "#5a6b7a" }}>{l}</button>
              ))}
            </div>
          </>)}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <div style={{ display: showTar ? "block" : "none", height: "100%" }}><EditorTAR active={showTar} viewMode={tarView} setViewMode={(v) => { setTool("qual"); setQualSub("tar"); setTarView(v === "diagrama" ? "diagrama" : "analise"); }} /></div>
        <div style={{ display: tool === "diag" ? "block" : "none", height: "100%" }}><DiagramaGeral active={tool === "diag"} /></div>
        <div style={{ display: tool === "qual" && qualSub === "texto" ? "block" : "none", height: "100%" }}><AnaliseQualitativa /></div>
        <div style={{ display: tool === "qual" && qualSub === "campo" ? "block" : "none", height: "100%" }}><CampoBourdieu active={tool === "qual" && qualSub === "campo"} /></div>
        <div style={{ display: tool === "quant" ? "block" : "none", height: "100%" }}><AnaliseQuantitativa active={tool === "quant"} /></div>
      </div>
      {tourQ >= 0 && TOURQ[tourQ] && (
        <div role="dialog" aria-modal="true" aria-label="Tutorial do Enlace" style={{ position: "fixed", inset: 0, background: "rgba(20,30,38,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 1200 }}>
          <div ref={tourQRef} style={{ background: "#fff", borderRadius: 12, maxWidth: 460, width: "100%", boxShadow: "0 12px 40px rgba(0,0,0,.3)", padding: "22px 24px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#1f7a8c", letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 6 }}>Tutorial do Enlace · {tourQ + 1}/{TOURQ.length}</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 18, color: "#2b3a42" }}>{TOURQ[tourQ].t}</h2>
            <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "#46555f", lineHeight: 1.5 }}>{TOURQ[tourQ].b}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {TOURQ.map((_, i) => (<span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i === tourQ ? "#1f7a8c" : "#cfd6dd" }} />))}
              <div style={{ flex: 1 }} />
              <button onClick={finishTourQ} style={miniBtn}>Pular</button>
              {tourQ > 0 && <button onClick={() => setTourQ(tourQ - 1)} style={miniBtn}>Anterior</button>}
              {tourQ < TOURQ.length - 1 ? <button onClick={() => setTourQ(tourQ + 1)} style={primaryBtn}>Próximo</button> : <button onClick={finishTourQ} style={primaryBtn}>Começar</button>}
            </div>
          </div>
        </div>
      )}
      {showAbout && (
        <div role="dialog" aria-modal="true" aria-label="Sobre o Enlace" onClick={() => setShowAbout(false)} style={{ position: "fixed", inset: 0, background: "rgba(20,30,38,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 1300 }}>
          <div ref={aboutRef} onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, maxWidth: 560, width: "100%", maxHeight: "86vh", overflow: "auto", boxShadow: "0 12px 40px rgba(0,0,0,.3)", padding: "24px 26px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <svg width="42" height="42" viewBox="0 0 26 26" aria-hidden="true">
                <line x1="6" y1="7" x2="20" y2="6" stroke="#cfd6dd" strokeWidth="1.4" />
                <line x1="6" y1="7" x2="19" y2="19" stroke="#cfd6dd" strokeWidth="1.4" />
                <line x1="20" y1="6" x2="19" y2="19" stroke="#cfd6dd" strokeWidth="1.4" />
                <line x1="7" y1="18" x2="19" y2="19" stroke="#cfd6dd" strokeWidth="1.4" />
                <line x1="6" y1="7" x2="7" y2="18" stroke="#cfd6dd" strokeWidth="1.4" />
                <circle cx="6" cy="7" r="3" fill="#1f7a8c" />
                <circle cx="20" cy="6" r="2.4" fill="#7a5ea8" />
                <circle cx="19" cy="19" r="3" fill="#2e7d4f" />
                <circle cx="7" cy="18" r="2.2" fill="#b06a1f" />
              </svg>
              <div>
                <div style={{ fontWeight: 800, color: "#1f7a8c", fontSize: 22, letterSpacing: 0.2 }}>Enlace</div>
                <div style={{ fontSize: 12, color: "#7a8b99" }}>análises qualitativas, quantitativas e diagramas · versão 9</div>
              </div>
              <div style={{ flex: 1 }} />
              <button onClick={() => setShowAbout(false)} aria-label="Fechar" style={{ ...miniBtn, padding: "4px 10px", lineHeight: 1 }}>✕</button>
            </div>

            <h3 style={{ margin: "0 0 6px", fontSize: 13, color: "#1f7a8c", textTransform: "uppercase", letterSpacing: ".5px" }}>Sobre o software</h3>
            <p style={{ margin: "0 0 10px", fontSize: 13.5, color: "#46555f", lineHeight: 1.6 }}>
              O Enlace reúne três janelas para pesquisa qualitativa e quantitativa. A Análise Qualitativa abriga as três ferramentas de análise: Texto (codificação em códigos e categorias, em oito métodos), Ator-Rede (a rede de actantes da Teoria Ator-Rede, em tabela e em diagrama) e Campo (o espaço social de Bourdieu, por volume e estrutura do capital). Ao lado ficam o Mapa conceitual e a Análise Quantitativa (testes estatísticos).
            </p>
            <p style={{ margin: "0 0 10px", fontSize: 13.5, color: "#46555f", lineHeight: 1.6 }}>
              Funciona offline, no navegador ou como aplicativo de desktop, e o trabalho é salvo num único arquivo.
            </p>

            <h3 style={{ margin: "18px 0 8px", fontSize: 13, color: "#1f7a8c", textTransform: "uppercase", letterSpacing: ".5px" }}>Desenvolvedores</h3>
            {[
              {
                nome: "Antonio Augusto Ignacio",
                formacao: [
                  "Bacharelado em Química (2023)",
                  "Licenciatura em Ciências Biológicas (2025)",
                  "Licenciatura em Matemática (2026)",
                  "Licenciatura em Pedagogia (2026)",
                  "Mestrado em Ciências Ambientais (UTFPR, 2026)",
                  "Doutorando em Educação em Ciências e Educação Matemática (UNIOESTE)",
                ],
                resumo: "Atua principalmente nas áreas relacionadas ao ensino de matemática e ciências, com experiência em modelagem matemática, engenharia química e análise, desenvolvimento e validação de softwares. É autor de softwares científicos como PDESolver, Pyisotherm, DRMSimulator e HexapodaID.",
              },
              {
                nome: "Evandro Alves Nakajima",
                formacao: [
                  "Graduação em Matemática (UEM, 2010)",
                  "Mestrado em Matemática (USP, 2013)",
                  "Doutorado em Engenharia Química (UNIOESTE, 2023)",
                  "Professor Adjunto da UTFPR, Campus Santa Helena",
                ],
                resumo: "Atua nas áreas de Matemática Aplicada e Engenharia Química, com ênfase em modelagem matemática, métodos numéricos e simulação de processos. Suas pesquisas abrangem simulação de adsorção em leito fixo, reforma a seco do metano, otimização e redes neurais, além do ensino de matemática e ciências. É autor de softwares científicos como PDESolver, Pyisotherm, DRMSimulator e HexapodaID.",
              },
            ].map((d, i) => (
              <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid #f0f4f7" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#2b3a42", marginBottom: 4 }}>{d.nome}</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9aa7b1", textTransform: "uppercase", letterSpacing: ".5px", margin: "6px 0 3px" }}>Formação</div>
                <ul style={{ margin: "0 0 4px", paddingLeft: 18 }}>
                  {d.formacao.map((f, j) => (<li key={j} style={{ fontSize: 12.5, color: "#46555f", lineHeight: 1.5 }}>{f}</li>))}
                </ul>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9aa7b1", textTransform: "uppercase", letterSpacing: ".5px", margin: "8px 0 3px" }}>Resumo</div>
                <p style={{ margin: 0, fontSize: 12.5, color: "#46555f", lineHeight: 1.6, textAlign: "justify" }}>{d.resumo}</p>
              </div>
            ))}

            <div style={{ borderTop: "1px solid #eef2f5", marginTop: 18, paddingTop: 12, fontSize: 11.5, color: "#7a8b99", lineHeight: 1.6 }}>
              © 2026 Enlace. Software livre para uso acadêmico e educacional.
            </div>

            <div style={{ display: "flex", marginTop: 16 }}>
              <div style={{ flex: 1 }} />
              <button onClick={() => setShowAbout(false)} style={primaryBtn}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
