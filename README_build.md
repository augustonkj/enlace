# Build do Enlace

Gera o `Enlace.html` (arquivo único, offline, abre por duplo clique) a partir do
código-fonte modular em `src/`.

## Pré-requisitos
- Node.js 18 ou superior.

## Passos (uma vez)
Na pasta do projeto (onde estão `src/`, `build_enlace.mjs` e `package.json`):

```
npm install
```

Isso instala o esbuild (bundler), as bibliotecas empacotadas no app
(react, react-dom, recharts) e o mammoth (embutido para leitura de `.docx`).

## Gerar o HTML
```
npm run build
```
ou diretamente:
```
node build_enlace.mjs src/main.jsx Enlace.html
```

Saída: `Enlace.html` (~1,3 MB). É só abrir no navegador.

## Estrutura do código (`src/`)
- `lib.js` — camada compartilhada: cores, `NODE_TYPES`, `MOMENTS`, geometria/SVG
  (`buildInner`), layouts, `brandes`, `parseCSV`, seeds, `Hint`, `SUITE` (ponte
  entre as ferramentas). Exporta tudo num barrel no fim do arquivo.
- `EditorTAR.jsx` — editor Ator-Rede. Uma única instância serve as duas vistas da
  sub-aba **Ator-Rede** via a prop `viewMode`: `analise` (Tabela) e `diagrama`.
- `AnaliseQualitativa.jsx` — análise textual. Persiste em `window.storage`
  (localStorage). Os métodos ficam na tabela `METHODS` (8 presets: livre, Bardin,
  ATD, fenomenologia, discurso, grounded, narrativas, Bourdieu) — cada um só
  troca terminologia, passos, abas visíveis e dicas; o motor é o mesmo. Duas
  abas são comuns a todos e registradas por código logo após `METHOD_ORDER`:
  **Documentos** (`corpus`) e **Consultas** (`recuperacao`).

  O projeto é um **corpus**: `docs[]` (`{id, name, text, attrs, paginas}`),
  `docAtual`, `atributos[]`, e os recortes carregam `docId`. Projetos do formato
  antigo (um `project.text`) são convertidos por `migrarProjeto()`, chamada em
  todo ponto de carga — o texto vira um documento e os recortes apontam para ele.
  Helpers: `docsDe`, `docAtualDe`, `textoDe`, `exDoDoc`, `textoTodo`.

  **PDF**: `textoDePDF()` usa o pdf.js embutido e roda **sem Worker** — o módulo
  do worker é importado e pendurado em `globalThis.pdfjsWorker`, que é o gancho
  de "fake worker" da própria biblioteca. Sem isso não haveria como ler PDF num
  arquivo único aberto por duplo clique. Guarda o mapa de páginas em `doc.paginas`,
  e `paginaDoOffset()` diz em que página cai cada recorte. É o que faz o bundle
  passar de ~1,6 MB para ~3,3 MB.

  **REFI-QDA**: `exportarREFI()`/`importarREFI()` leem e escrevem o QDA-XML 1.0
  (`.qde`/`.qdc`) — o formato que NVivo, MAXQDA e ATLAS.ti abrem.

  **Memos** (`project.memos`): diário da análise, cada um podendo se vincular a
  um código ou a um documento. Saem no relatório em PDF e no `.qde` como `<Note>`.
- `RevisaoLiteratura.jsx` — janela **Revisão**: tabela de referências (importa
  `.csv` com cabeçalho, `.bib` e `.ris`; o BibTeX decodifica acento em LaTeX),
  detecção de duplicatas por DOI ou título+ano, e a etapa de cada referência.
  As contagens do diagrama saem dessas etapas — `contagens()` — e o desenho é
  montado por `layoutDiagrama()`/`buildRevisaoInner()`. No modo `sistematica`
  aparecem o protocolo e o fluxo PRISMA completo; no `narrativa`, um fluxo de
  três passos. Cada caixa aceita sobrescrita manual de rótulo e número
  (`state.over`), com botão para recalcular. Ponte `SUITE`
  (`getRevisao`/`setRevisao`).
- `CampoBourdieu.jsx` — janela **Campo (Bourdieu)**: propriedades do campo
  (capital específico, illusio, doxa, polos) e agentes com os quatro capitais
  (0–10). Deriva o espaço social — volume = soma dos capitais (eixo vertical),
  composição = econômico − cultural (eixo horizontal) — e desenha trajetórias a
  partir da posição anterior. Ponte `SUITE` (`getCampo`/`setCampo`).
- `AnaliseQuantitativa.jsx` — janela quantitativa: testes estatísticos sobre
  dados colados/abertos ali, independente das demais.
- `App.jsx` — casca com as 3 abas + sub-abas da Qualitativa + salvar/abrir
  Enlace + tutorial.
- `main.jsx` — ponto de entrada (`createRoot`).

As janelas:

```
Análise Qualitativa ─┬─ Texto            (codificação, 8 métodos)
                     ├─ Revisão          (referências + fluxo PRISMA)
                     ├─ Ator-Rede ──┬─ Tabela     mesma rede
                     │              └─ Diagrama   (estado do EditorTAR)
                     └─ Campo (Bourdieu)  (espaço social dos agentes)
Mapa conceitual        (diagrama livre, independente)
Análise Quantitativa   (testes estatísticos, independente)
```

O "Salvar Enlace…" (menu Arquivo) reúne os cinco estados num único `.json` pela
ponte `SUITE`: `tar`, `qual`, `geral`, `campo` e `revisao`.

## Como funciona o build
O `build_enlace.mjs` faz o bundle de `src/main.jsx` com **esbuild** (resolve os
imports do `src/` e empacota react/react-dom/recharts no próprio bundle, sem UMD
avulso), embute o `mammoth` como UMD (`window.mammoth`), injeta o shim
`window.storage` (localStorage) e o CSS de foco visível, e escreve um HTML único.

## Editar o app
Altere os arquivos em `src/` e rode `npm run build` de novo.

## Observações
- O `.docx` é lido via `mammoth` (embutido), então a importação de Word funciona offline.
- Se aparecer "node_modules não encontrado", confirme que rodou `npm install` nesta pasta.
