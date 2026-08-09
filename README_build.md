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
(react, react-dom, recharts), o mammoth (embutido para leitura de `.docx`) e o
jsdom, usado só pelos testes.

## Gerar o HTML
```
npm run build
```
ou diretamente:
```
node build_enlace.mjs src/main.jsx Enlace.html
```

Saída: `Enlace.html` (~1,6 MB). É só abrir no navegador.

## Estrutura do código (`src/`)
- `lib.js` — camada compartilhada: cores, `NODE_TYPES`, `MOMENTS`, geometria/SVG
  (`buildInner`), layouts, `brandes`, `parseCSV`, seeds, `Hint`, `SUITE` (ponte
  entre as ferramentas). Exporta tudo num barrel no fim do arquivo.
- `EditorTAR.jsx` — editor Ator-Rede. Uma única instância serve as duas vistas da
  sub-aba **Ator-Rede** via a prop `viewMode`: `analise` (Tabela) e `diagrama`.
- `AnaliseQualitativa.jsx` — análise textual. Persiste em `window.storage`
  (localStorage). Os métodos ficam na tabela `METHODS` (8 presets: livre, Bardin,
  ATD, fenomenologia, discurso, grounded, narrativas, Bourdieu) — cada um só
  troca terminologia, passos, abas visíveis e dicas; o motor é o mesmo. Quatro
  abas são comuns a todos os métodos e registradas por código logo após
  `METHOD_ORDER`: **Documentos** (`corpus`), **Consultas** (`recuperacao`),
  **Rede** (`rede`) e **Memos** (`memos`).

  O projeto é um **corpus**: `docs[]` (`{id, name, text, attrs, paginas}`),
  `docAtual`, `atributos[]`, e os recortes carregam `docId`. Projetos do formato
  antigo (um `project.text`) são convertidos por `migrarProjeto()`, chamada em
  todo ponto de carga — o texto vira um documento e os recortes apontam para ele.
  Helpers: `docsDe`, `docAtualDe`, `textoDe`, `exDoDoc`, `textoTodo`.

  **PDF**: fora, de propósito. O pdf.js embutido chegou a funcionar (inclusive
  sem Worker, pelo gancho `globalThis.pdfjsWorker`, para o arquivo continuar
  abrindo por duplo clique), mas sozinho levava o bundle de ~1,6 MB para ~3,3 MB
  — caro demais para um app cujo ponto é ser um arquivo único leve. O mapa de
  páginas (`doc.paginas`, `paginaDoOffset()`) segue no modelo, então um leitor
  leve pode entrar depois sem outra mudança.

  **REFI-QDA**: `exportarREFI()`/`importarREFI()` leem e escrevem o QDA-XML 1.0
  (`.qde`/`.qdc`) — o formato que NVivo, MAXQDA e ATLAS.ti abrem.

  **Memos** (`project.memos`): diário da análise, cada um podendo se vincular a
  um código ou a um documento. Saem no relatório em PDF e no `.qde` como `<Note>`.

  **Rede** (`RedeView`): grafo calculado da própria codificação — os nós são os
  códigos (tamanho = nº de recortes) e as ligações são co-ocorrências no mesmo
  recorte. `redeDoProjeto()` monta, `layoutRede()` posiciona (Fruchterman-Reingold
  determinístico, sem `Math.random`, para o mesmo projeto render sempre o mesmo
  desenho) e clicar num nó ou numa ligação lista as citações que a sustentam.
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
Análise Qualitativa ─┬─ Texto            (codificação, 8 métodos, corpus + rede)
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

## Testes
```
npm run verificar     # constrói e roda tudo
npm test              # só roda (usa o Enlace.html já construído)
node testes/03-corpus.mjs   # uma suíte sozinha, com o detalhe de cada passo
```
As suítes em `testes/` carregam o **arquivo único já construído** num DOM
(jsdom) e clicam na interface como um usuário: trocam de aba, carregam os
exemplos, importam arquivos, editam células e conferem os números que aparecem
na tela. São 113 verificações cobrindo a estrutura das janelas, a revisão com
PRISMA, o corpus de vários documentos, a ida e volta do REFI-QDA, os memos, a
rede de códigos, a busca no corpus, o comportamento quando o navegador recusa
gravar (`07-armazenamento.mjs` finge a cota estourando) e os 11 tipos de
gráfico da janela quantitativa (`09-graficos.mjs`, caracterização feita para
proteger a saída do recharts).

O que o jsdom **não** alcança está anotado dentro dos arquivos: ele não faz
layout (então `getBoundingClientRect` devolve zeros e cliques por coordenada no
SVG não funcionam) nem seleção de texto do navegador. Essas partes precisam de
conferência num navegador de verdade.

## Editar o app
Altere os arquivos em `src/` e rode `npm run build` de novo — e depois
`npm test`, que é barato e pega regressão nas partes frágeis (migração de
projetos antigos, contagens do PRISMA, ida e volta do REFI-QDA).

## Observações
- O `.docx` é lido via `mammoth` (embutido), então a importação de Word funciona offline.
- Se aparecer "node_modules não encontrado", confirme que rodou `npm install` nesta pasta.
