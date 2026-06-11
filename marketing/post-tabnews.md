Pitch: dados-publicos-mcp, um servidor MCP que para de pedir API key e reconstrói os índices de dados públicos de licitação do Brasil offline na sua máquina, com legislação do Planalto, CNPJ e sanções da CGU em SQLite+FTS5

Disclaimer de vínculo antes de qualquer coisa: trabalho na Licitei e ajudei a construir isto. É open source, AGPL-3.0-only, o repo está no fim do post. Não tem CTA comercial aqui. Vim trazer as decisões de arquitetura, os trade-offs e os trechos de código, que é o que interessa pra quem nunca vai licitar na vida mas curte resolver problema de dado público brasileiro. Feedback de quem já fez harvest de base gov em produção é o que eu mais quero levar daqui.

## O problema: duas paredes

Quem tenta cruzar dados públicos de licitação no Brasil esbarra em duas paredes logo no começo.

A primeira: as APIs oficiais só buscam por identificador exato. A consulta de CNPJ (BrasilAPI, MinhaReceita) exige o número do CNPJ. Você não pergunta "quais empresas têm CONSTRUTORA SILVA no nome", você confirma um CNPJ que já tem na mão. O PNCP filtra por `codigoMunicipioIbge`, mas quer o código do IBGE, não o nome do município. Os filtros existem e ficam inúteis até você resolver `nome -> código` por fora.

A segunda: a parte que vale ouro pra due diligence (legislação, sanções, quadro societário) está em PDF no site do Planalto ou em ZIP de CSV com encoding de 1998 espalhado por CDN do governo. Nada disso chega consultável pra uma IA.

A ideia do MCP foi parar de pedir que o modelo "saiba" essas coisas e dar a ele ferramentas pra buscar nas fontes oficiais. Hoje são 78 ferramentas MCP, 12 fontes oficiais indexáveis, 43 normas no catálogo de legislação e 240 testes passando.

---

## Três camadas, separadas por taxa de mudança do dado

O servidor (stdio, plugado no Claude/Cursor/Continue.dev) expõe as ferramentas sobre três camadas. A decisão de qual camada usar pra cada fonte foi metade do trabalho, e o critério acabou sendo um só: a taxa de mudança do dado, não a fonte.

1. **Legislação offline.** As leis do Planalto, 43 normas no catálogo, indexadas em SQLite com FTS5. Texto de lei muda devagar, cabe num índice empacotado, consulta full-text sem rede.
2. **Online em tempo real.** PNCP (contratações) e CNPJ (BrasilAPI/MinhaReceita). Dado que muda toda hora e que a API gratuita já entrega bem, você consulta na hora e não cacheia.
3. **Índices locais pesados, reconstruídos na sua máquina.** Receita CNPJ, sanções CGU, SICAF, CATMAT/CATSER, CAPAG, IBGE, CNAE, TSE, Câmara, Querido Diário e PNCP offline. Aqui mora o diferencial: busca em massa que nenhuma API gratuita oferece.

O ponto de design que importa: sem API key e sem banco de terceiros. Os índices vivem em `~/.local/share` no Linux/Mac ou `%LOCALAPPDATA%` no Windows, na máquina de quem roda. A query "quem são os sócios desse fornecedor" não passa por servidor meu.

---

## A busca que justifica indexar localmente

A camada 3 é a tese central. Indexando o dump aberto da Receita (~7,5 GB no mês de referência) você passa a achar empresa e sócio por nome, e a cruzar sócios em comum entre fornecedores diferentes. Sócio compartilhado entre concorrentes do mesmo certame é sinal clássico de laranja ou conluio. Nenhuma API pública entrega isso em massa, porque a consulta oficial responde por CNPJ exato.

Com a tabela inteira de sócios na máquina, achar empresa por nome vira uma query FTS5 e cruzar sócios em comum vira um JOIN local, em vez de uma chamada que não existe:

```ts
CREATE VIRTUAL TABLE IF NOT EXISTS socios_fts USING fts5 (
  cnpj_basico,
  nome_socio
);
```

```ts
// duas tools concretas que a API oficial não tem:
//  - buscar_socio_por_nome  (acha o sócio e lista todas as empresas em que aparece)
//  - socios_em_comum        (recebe N CNPJs e devolve o quadro societário compartilhado)
```

O dump da Receita tem todas as armadilhas que você imagina: ISO-8859-1, CSV com `;` e decimal por vírgula, sem cabeçalho, e o CNPJ vem fatiado em `básico + ordem + dv` que você remonta na mão. Pior: o código de município nesse dump é o da RFB, que não bate com o do IBGE. Cada fonte tem o gotcha dela. A Câmara, por exemplo, manda UTF-8 com BOM contra todo o resto (RFB/CGU/TSE em ISO-8859-1). Mapear esses detalhes é onde o tempo foi embora.

---

## Decisão 1: erro como valor de retorno, sem throw cruzando o boundary MCP

Num servidor MCP você fala stdio com o cliente. Uma exceção não tratada que atravessa esse boundary não degrada uma ferramenta, ela derruba a sessão inteira do assistente, e o usuário vê um erro genérico de protocolo sem pista do que aconteceu. `throw` num handler de tool é uma péssima fronteira.

Adotei erro-como-valor com `better-result` e um catálogo declarativo em `evlog`. A tool sempre devolve um `Result`, e a camada MCP traduz isso pra resposta estruturada. Cada erro do catálogo carrega `message`, `why` e `fix`:

```ts
export const dadosPublicosErrors = defineErrorCatalog("dados-publicos", {
  INDICE_AUSENTE: {
    status: 404,
    message: ({ path }: { path: string }) =>
      `Indice offline do PNCP nao encontrado em ${path}.`,
    why: "O indice offline (pncp-bulk) ainda nao foi construido nesta maquina.",
    fix: "Rode a indexacao (build) primeiro: index pncp-bulk.",
    tags: ["dados-publicos", "indice"],
  },
  // ...
});
```

No ponto de decisão fica inline, sem statement de erro espalhado:

```ts
return Result.err(dadosPublicosErrors.INDICE_AUSENTE({ path }));
```

O `fix` virou um detalhe bom pro outro lado da fronteira. Quando o modelo recebe "índice ausente, rode `index pncp-bulk`", ele lê a instrução e se recupera sozinho, em vez de só ver uma stack trace. O aprendizado que levo pra outros projetos: quando o consumidor da sua API é uma IA, a mensagem de erro é parte da interface, porque o modelo lê e age sobre ela.

Um corolário que pega muita gente: `console.log` num servidor MCP stdio corrompe o canal do protocolo. Todo log estruturado do `evlog` vai pra stderr, e o stdout fica reservado pro MCP.

---

## Decisão 2: zero dependência pesada, em cima do runtime do Bun

São 7 dependências de runtime: `@modelcontextprotocol/sdk`, `better-result`, `cac`, `cheerio`, `dayjs`, `evlog`, `zod`. Repare no que não está aí: nenhum driver de SQLite, nenhuma lib de unzip, nenhum cliente HTTP.

A stack é Bun + TypeScript, e o Bun já traz o que essas fontes pedem:

- **SQLite + FTS5** nativo via `bun:sqlite`, sem `better-sqlite3` e sem subir Postgres com `pg_trgm`. Busca full-text de lei e de razão social roda no mesmo binário do runtime. O store inteiro recebe um `Database`, então em teste eu passo `Database(":memory:")` e rodo sem rede e sem disco.
- **unzip** via `node:zlib`, porque os dumps gov vêm em ZIP.
- **HTTP** com `fetch` nativo, e por cima dele um retry com backoff exponencial e timeout próprio.

Trade-off honesto: amarrar no runtime do Bun me deu zero dependência nativa e build trivial, ao custo de não rodar puro em Node. Pra uma ferramenta que o dev instala localmente, achei que valia. Pra publicar como lib embutível em qualquer lugar, a conta mudaria.

---

## Decisão 3: download resumível por HTTP Range

Reconstruir o índice da Receita significa baixar ~7,5 GB. Em conexão brasileira, a queda no meio é quando, não se. Então o download é resumível por HTTP Range: se já existe arquivo parcial, peço o resto. Só anexo se o servidor confirmar com `206`; se ele responder `200`, recomeço do zero pra não colar bytes velhos com novos.

```ts
const existing = tamanhoAtual(dest); // o que já está em disco, 0 se não existe
if (existing > 0) headers.range = `bytes=${existing}-`;

const response = await fetchWithRetry(url, { headers });
const append = response.status === 206 && existing > 0;
const handle = await open(dest, append ? "a" : "w");
```

O retry só repete em status que valem a pena, em até 3 tentativas com backoff:

```ts
const retryableStatusCodes = new Set([408, 413, 429, 500, 502, 503, 504]);
```

Aprendizado: pra reconstruir índice de fonte oficial, o caminho feliz é o caso raro. O código que importa é o do download interrompido, do ZIP corrompido e do timeout.

---

## O que dá pra fazer hoje

Um exemplo concreto de due diligence que junta as camadas: dado um fornecedor, cruzo as 5 listas de sanção da CGU (CEIS, CNEP, CEPIM, CEAF e Acordos de Leniência) com filtro de sanção vigente na data do certame, não vigente hoje, e ainda puxo o risco fiscal do órgão comprador pela nota CAPAG do Tesouro. Tudo a partir dos índices locais, offline.

```bash
# roda como servidor MCP (stdio) no Claude/Cursor/Continue.dev
bunx dados-publicos-mcp serve

# reconstrói um índice local na sua máquina
bun src/index.ts index pncp-bulk
```

---

## Escopo honesto e limitações

- **Entrego dado bruto estruturado.** Não faço scoring proprietário, análise de viabilidade nem geração de proposta. Junto e organizo a evidência, e a decisão segue humana. A IA para de adivinhar e passa a responder com fonte oficial, ela não substitui seu julgamento sobre o certame.
- **Come disco.** O dump da Receita são ~7,5 GB por mês de referência. As fontes pesadas são opt-in e indexadas sob demanda, então quem só quer legislação não paga esse custo. Mas se você ligar tudo, separe espaço.
- **DataJud ficou de fora.** A API pública do CNJ omite o campo `partes` por LGPD, então buscar processo por nome/CNPJ de parte é impossível em qualquer fonte pública do DataJud. Preferi não fingir que cobria isso.
- **12 fontes até agora.** Tem muita base pública boa de fora, cada estado com seu portal é um universo.

---

## Feedback que eu quero

A pergunta técnica honesta que me tira o sono: **download resumível por HTTP Range é frágil demais pra dump de vários GB?** Hoje eu confio no `206` pra anexar e caio pro download do zero no `200`, mas não valido checksum nem ETag do que já está em disco antes de continuar. Se a fonte trocar o arquivo no meio do caminho, eu colo bytes velhos com novos. Quem já fez harvest de dado gov em produção: vocês validam ETag/Content-Range a cada retomada, ou existe um caminho mais simples que eu não enxerguei?

Tem uma segunda em aberto: refresh de índice FTS5 grande sem travar a consulta. Hoje, quando a Receita troca o layout do CSV (já trocou mais de uma vez), eu invalido e reconstruo o índice inteiro, o que é caro e joga fora download. Delta table + merge? Rebuild num arquivo novo e swap atômico? Como vocês lidaram?

Repo (issues e PRs muito bem-vindos, principalmente novas fontes): https://github.com/Licitei/dados-publicos-mcp

Pra quem licita, escrevi a versão com foco em due diligence de fornecedor em vez do técnico: https://www.licitei.com.br/blog/due-diligence-fornecedores-dados-publicos-ia
