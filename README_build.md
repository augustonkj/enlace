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
- `AnaliseQualitativa.jsx` — análise textual (análise livre: codificar,
  categorizar e interpretar). Persiste em `window.storage` (localStorage). As
  abas ficam em `ABAS`, na ordem em que aparecem: **Documentos** (`corpus`),
  **Codificação**, **Categorias**, **Consultas** (`recuperacao`),
  **Quantitativo** e **Metatexto**.

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

- `RevisaoLiteratura.jsx` — janela **Revisão**: tabela de referências (importa
  `.csv` com cabeçalho, `.bib` e `.ris`; o BibTeX decodifica acento em LaTeX),
  detecção de duplicatas por DOI ou título+ano, e a etapa de cada referência.
  As contagens do diagrama saem dessas etapas — `contagens()` — e o desenho é
  montado por `layoutDiagrama()`/`buildRevisaoInner()`, sempre com o protocolo e
  o fluxo PRISMA completo. Cada caixa do diagrama aceita sobrescrita manual de
  rótulo e número (`state.over`), com botão para recalcular. As notas de cada
  referência são caixas (`notas[]`, `{id, titulo, texto}`), quantas a pessoa
  quiser; `migrarRevisao()`, chamada em todo ponto de carga, converte o formato
  antigo (um texto só). Ponte `SUITE` (`getRevisao`/`setRevisao`).
- `DiagramaGeral.jsx` — janela **Mapa conceitual**. Cada nó guarda forma
  (retângulo, arredondado, elipse, losango, hexágono), preenchimento, borda, cor
  do texto, fonte (família, corpo, negrito, itálico) e largura/altura fixas
  opcionais; cada ligação guarda cor, espessura, traço e pontas. `formaDoNo()`
  devolve a geometria uma única vez e os mesmos números alimentam o desenho na
  tela (JSX interativo) e a exportação (string SVG) — sem isso o que se vê e o
  que se exporta divergem. Seleção múltipla por Shift+clique, com `alinhar()` e
  `distribuir()` próprios (usam o tamanho real de cada forma), laço de seleção
  arrastando no fundo, camadas (a ordem de `nodes[]` é a ordem de pintura) e
  grade opcional. As ligações são `<path>`: retas, curvas (Bézier quadrática) ou
  em cotovelo — `caminhoLigacao()` devolve também a direção do último trecho,
  senão a seta aponta torto na curva.
- `AnaliseQuantitativa.jsx` — janela quantitativa: testes estatísticos sobre
  dados colados/abertos ali, independente das demais.
- `App.jsx` — casca com as 3 abas + sub-abas da Qualitativa + salvar/abrir
  Enlace + tutorial.
- `main.jsx` — ponto de entrada (`createRoot`).

As janelas:

```
Análise Qualitativa ─┬─ Texto            (codificação, corpus e consultas)
                     ├─ Revisão          (referências + fluxo PRISMA)
                     └─ Ator-Rede ──┬─ Tabela     mesma rede
                                    └─ Diagrama   (estado do EditorTAR)
Mapa conceitual        (diagrama livre, independente)
Análise Quantitativa   (testes estatísticos, independente)
```

O "Salvar Enlace…" (menu Arquivo) reúne os quatro estados num único `.json` pela
ponte `SUITE`: `tar`, `qual`, `geral` e `revisao`.

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
na tela. São 132 verificações cobrindo a estrutura das janelas, a revisão com
PRISMA, o corpus de vários documentos, a ida e volta do REFI-QDA, a busca no
corpus, o comportamento quando o navegador recusa gravar (`07-armazenamento.mjs` finge a cota estourando) e os 11 tipos de
gráfico da janela quantitativa (`09-graficos.mjs`, caracterização feita para
proteger a saída do recharts), a migração das chaves do nome antigo e as
opções do mapa conceitual.

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
