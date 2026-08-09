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
- `AnaliseQualitativa.jsx` — análise textual (codificação, categorias, metatexto,
  confiabilidade). Persiste em `window.storage` (localStorage). Os métodos ficam
  na tabela `METHODS` (8 presets: livre, Bardin, ATD, fenomenologia, discurso,
  grounded, narrativas, Bourdieu) — cada um só troca terminologia, passos, abas
  visíveis e dicas; o motor de codificação é o mesmo.
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
                     ├─ Ator-Rede ──┬─ Tabela     mesma rede
                     │              └─ Diagrama   (estado do EditorTAR)
                     └─ Campo (Bourdieu)  (espaço social dos agentes)
Mapa conceitual        (diagrama livre, independente)
Análise Quantitativa   (testes estatísticos, independente)
```

O "Salvar Enlace…" (menu Arquivo) reúne os quatro estados num único `.json` pela
ponte `SUITE`: `tar`, `qual`, `geral` e `campo`.

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
