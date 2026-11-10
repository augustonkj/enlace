#!/usr/bin/env node
/*
 * build_enlace.mjs — gera o Enlace.html offline (tudo embutido) a partir de src/.
 *
 * Uso:
 *   node build_enlace.mjs [entrada.jsx] [saida.html]
 *   (padrão: src/main.jsx  ->  Enlace.html)
 *
 * Pré-requisitos (uma vez):
 *   npm install   (instala react, react-dom, recharts, mammoth, esbuild)
 *
 * O script:
 *   1) faz o bundle de src/main.jsx com esbuild (resolve os imports do src/ e
 *      empacota react, react-dom e recharts direto no bundle — sem UMD avulso);
 *   2) embute o mammoth como UMD (continua sendo usado como window.mammoth);
 *   3) escreve um HTML único, offline, que abre por duplo clique.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IN = process.argv[2] || "src/main.jsx";
const OUT = process.argv[3] || "Enlace.html";

// procura node_modules em ./ , ./offline/ ou no diretório do script
function nm() {
  const cands = [
    join(process.cwd(), "node_modules"),
    join(process.cwd(), "offline", "node_modules"),
    join(__dirname, "node_modules"),
    join(__dirname, "offline", "node_modules"),
  ];
  for (const c of cands) if (existsSync(join(c, "react"))) return c;
  throw new Error("node_modules não encontrado. Rode: npm install");
}
const NM = nm();
const esc = (s) => s.replace(/<\/script>/gi, "<\\/script>");

// 1: bundle do app (react + react-dom + recharts entram no bundle)
const result = await esbuild.build({
  entryPoints: [join(__dirname, IN)],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2018",
  jsx: "transform", // clássico: React.createElement (cada arquivo .jsx importa React)
  loader: { ".js": "jsx" }, // lib.js contém JSX (componente Hint)
  minify: true,
  legalComments: "none", // os avisos de licença vão inteiros na aba Licenças (ver coletarLicencas)
  metafile: true,
  write: false,
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
const app = esc(result.outputFiles[0].text);

// Licenças: todo pacote que entra no arquivo (pelo bundle ou pelo UMD do
// mammoth, com as dependências dele) leva o próprio texto de licença, que o
// app mostra em Sobre › Licenças e referências. MIT/ISC/BSD exigem que o aviso
// de copyright acompanhe o software; como o bundle é minificado, ele vai aqui.
// pacotes sem arquivo LICENSE costumam trazer a licença numa seção do README
function licencaDoReadme(dir) {
  const rd = readdirSync(dir).find((f) => /^readme(\.md|\.markdown)?$/i.test(f));
  if (!rd) return "";
  const m = readFileSync(join(dir, rd), "utf8").match(/^#{1,3}\s*licen[cs]e\b[^\n]*\n([\s\S]*?)(?=^#{1,3}\s|(?![\s\S]))/im);
  return m ? m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim() : "";
}
function coletarLicencas(metafile) {
  const nomes = new Set();
  for (const o of Object.values(metafile.outputs))
    for (const i of Object.keys(o.inputs)) { const m = i.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/); if (m) nomes.add(m[1]); }
  const viaMammoth = (p, vistos = new Set()) => {
    if (vistos.has(p) || !existsSync(join(NM, p, "package.json"))) return vistos;
    vistos.add(p);
    const j = JSON.parse(readFileSync(join(NM, p, "package.json"), "utf8"));
    for (const d of Object.keys(j.dependencies || {})) viaMammoth(d, vistos);
    return vistos;
  };
  for (const p of viaMammoth("mammoth")) nomes.add(p);
  const ARQ = /^(licen[cs]e|copying)(\.(md|txt|markdown))?$|^licen[cs]e-mit(\.(md|txt))?$/i;
  return [...nomes].sort().map((nome) => {
    const dir = join(NM, nome);
    const j = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const arq = readdirSync(dir).find((f) => ARQ.test(f));
    const autor = typeof j.author === "string" ? j.author : (j.author && j.author.name) || "";
    let url = j.homepage || (j.repository && (j.repository.url || j.repository)) || "";
    url = String(url).replace(/^git\+/, "").replace(/^git:\/\//, "https://").replace(/\.git$/, "");
    if (/^[\w.-]+\/[\w.-]+$/.test(url)) url = "https://github.com/" + url;
    return { nome, versao: j.version, licenca: j.license || "", autor: autor.replace(/\s*<[^>]*>/, ""), url,
      texto: arq ? readFileSync(join(dir, arq), "utf8").trim() : licencaDoReadme(dir) };
  });
}
const licencas = coletarLicencas(result.metafile);

// 2: mammoth como UMD embutido (usado como window.mammoth na importação de .docx)
const mammoth = esc(readFileSync(join(NM, "mammoth/mammoth.browser.min.js"), "utf8"));

// 3+4: HTML final
const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Enlace</title>
<style>
  html,body,#rootapp{height:100%;margin:0}
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  #loadmsg{padding:40px;color:#5a6b7a;font-size:14px}
  #errbox{display:none;padding:16px 40px;color:#b3261e;font-size:13px;white-space:pre-wrap;font-family:ui-monospace,monospace}
  /* acessibilidade: foco visível por teclado */
  :focus-visible{outline:2px solid #1f7a8c;outline-offset:1px;border-radius:3px}
  button:focus-visible,select:focus-visible,input:focus-visible,textarea:focus-visible,label:focus-visible,a:focus-visible,[tabindex]:focus-visible{outline:2px solid #1f7a8c;outline-offset:1px}
</style>
</head><body>
<div id="rootapp"><div id="loadmsg">Carregando o Enlace...</div></div><pre id="errbox" role="alert"></pre>
<script>
window.addEventListener("error",function(e){var b=document.getElementById("errbox");if(b){b.style.display="block";b.textContent="Erro:\\n"+(e.message||e.error||e)+"\\n"+((e.error&&e.error.stack)||"");}});
</script>
<script>window.ENLACE_LICENCAS=${esc(JSON.stringify(licencas))};</script>
<script>${mammoth}</script>
<script>try{ ${app} }catch(e){var b=document.getElementById("errbox");if(b){b.style.display="block";b.textContent="Erro ao iniciar o app:\\n"+(e.message||e)+"\\n"+(e.stack||"");}var l=document.getElementById("loadmsg");if(l)l.textContent="";}</script>
</body></html>`;

writeFileSync(OUT, html);
console.log(`OK: ${OUT} gerado (${Math.round(html.length / 1024)} KB) a partir de ${IN}`);
