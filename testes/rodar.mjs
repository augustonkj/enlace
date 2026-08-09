#!/usr/bin/env node
/*
  Roda todas as suítes contra o Enlace.html JÁ CONSTRUÍDO.
  Uso: npm test   (ou: node testes/rodar.mjs [filtro])

  Cada suíte carrega o arquivo único num DOM (jsdom), clica na interface como
  um usuário e imprime linhas "  ok  " ou "  FALHA ". O que não dá para testar
  aqui — layout, seleção de texto do navegador — está anotado dentro de cada
  arquivo. Se um teste falhar, rode-o sozinho para ver o detalhe:
      node testes/03-corpus.mjs
*/
import { readdirSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const app = join(aqui, "..", "Enlace.html");
if (!existsSync(app)) {
  console.error("Enlace.html não existe. Rode antes:  npm run build");
  process.exit(1);
}

const filtro = process.argv[2] || "";
const suites = readdirSync(aqui).filter((f) => /^\d\d-.*\.mjs$/.test(f) && f.includes(filtro)).sort();
if (!suites.length) { console.error("nenhuma suíte encontrada" + (filtro ? ` para "${filtro}"` : "")); process.exit(1); }

const rodar = (arquivo) => new Promise((resolve) => {
  const p = spawn(process.execPath, [join(aqui, arquivo)], { stdio: ["ignore", "pipe", "pipe"] });
  let saida = "";
  p.stdout.on("data", (d) => (saida += d));
  p.stderr.on("data", (d) => (saida += d));
  p.on("close", (code) => {
    const ok = (saida.match(/^ {2}ok {2}/gm) || []).length;
    const falhas = (saida.match(/^ {2}FALHA/gm) || []).length;
    resolve({ arquivo, ok, falhas, code, saida });
  });
});

console.log(`Enlace — ${suites.length} suíte(s) contra o Enlace.html construído\n`);
let totalOk = 0, totalFalhas = 0, quebradas = 0;
for (const s of suites) {
  const r = await rodar(s);
  totalOk += r.ok; totalFalhas += r.falhas;
  const ruim = r.falhas > 0 || (r.code !== 0 && r.ok === 0);
  if (ruim) quebradas++;
  console.log(`${ruim ? "✗" : "✓"} ${s.padEnd(24)} ${String(r.ok).padStart(3)} ok  ${r.falhas ? String(r.falhas) + " FALHA(S)" : ""}`);
  if (ruim) console.log(r.saida.split("\n").filter((l) => /FALHA|Error|erros/.test(l)).slice(0, 8).map((l) => "    " + l).join("\n"));
}
console.log(`\n${totalOk} verificações ok · ${totalFalhas} falhas · ${quebradas} suíte(s) com problema`);
process.exit(totalFalhas > 0 || quebradas > 0 ? 1 : 0);
