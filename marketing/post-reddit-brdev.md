**Subreddit:** r/brdev (alternativos: r/programacao — post original em PT, sem crosspost; r/brasil — só fim de semana, enquadramento cívico)

**Título:** Fiz um servidor MCP open-source pra consultar dados públicos do Brasil (legislação, PNCP, CNPJ, sanções CGU) sem API key e com busca offline

---

TL;DR: servidor MCP (stdio, roda no Claude/Cursor/Continue) que dá ao agente acesso a dados públicos brasileiros usados em licitação e due diligence. Sem API key, sem banco de terceiros, com busca full-text offline em SQLite+FTS5. AGPL-3.0, Bun + TypeScript. Repo: https://github.com/Licitei/dados-publicos-mcp

Disclosure primeiro: trabalho na Licitei e esse é um projeto open-source que a gente abriu. Não vendo nada aqui, não tem waitlist nem captação. Vim mostrar a engenharia e pedir crítica de quem entende.

## O problema

Consultar dado público do Brasil via agente é chato. Cada fonte tem um jeito, várias exigem o número exato (a consulta oficial de CNPJ não deixa você buscar empresa por nome), e quase tudo que escala vira scraping em tempo de resposta: lento, ruidoso e difícil de auditar. Web search no meio da resposta do modelo piora isso.

## O que o servidor faz

Expõe 78 ferramentas MCP sobre 12 fontes oficiais (Planalto, PNCP, Receita CNPJ, CGU, SICAF, CATMAT/CATSER, CAPAG do Tesouro, IBGE, CNAE, TSE, Câmara, Querido Diário). Separei tudo em 3 camadas pela taxa de mudança do dado:

- **Legislação do Planalto**: indexada uma vez em SQLite+FTS5, depois roda offline. Buscar artigo da 14.133 não depende de rede.
- **PNCP + CNPJ online**: editais, contratos, atas, e dados cadastrais de CNPJ via BrasilAPI/MinhaReceita, em tempo real.
- **Índices locais pesados**: reconstruídos na máquina de quem roda o MCP (a base CNPJ da Receita dá uns 7,5GB). Habilitam o que nenhuma API gratuita entrega em massa: empresa e sócio por nome, sócios em comum entre dois CNPJs, sanção vigente na data de um certame, nota CAPAG do órgão.

Tudo sem chave de API e sem banco proprietário no meio. Os índices vivem em `~/.local/share` (ou `%LOCALAPPDATA%` no Windows). Você baixa da fonte oficial e reconstrói local.

## Como rodar

Ainda não publiquei no npm, então por enquanto é clone + Bun. No config do seu cliente MCP:

```json
{
  "mcpServers": {
    "dados-publicos": {
      "command": "bun",
      "args": ["/caminho/para/dados-publicos-mcp/src/index.ts"]
    }
  }
}
```

A legislação você indexa com `bun run index` (ou pela tool `indexar_legislacao`). As fontes pesadas (CNPJ da Receita) ficam opcionais, você reconstrói só o que for usar.

## Decisões técnicas que valem comentar

- **Erro como valor**: nada de `throw` cruzando o boundary do MCP. Uso `better-result` e um catálogo declarativo de erros com `evlog` (`defineErrorCatalog`). Quando um índice não existe, a tool devolve `INDICE_AUSENTE` com `message`/`why`/`fix`, em vez de estourar uma exception que o cliente MCP não sabe ler.
- **`console.log` é proibido no servidor**: em MCP stdio, o stdout é o canal JSON-RPC. Um `console.log` solto corrompe o protocolo. Todo log vai pro stderr.
- **Download resumível** das bases grandes: HTTP Range com 206. Append só quando o servidor responde 206; se vier 200 eu recomeço do zero. `retryableStatusCodes` é o conjunto 408/413/429/500/502/503/504, unzip via `node:zlib`.
- **Busca por nome** sai de uma tabela FTS5 real, `socios_fts(cnpj_basico, nome_socio)`, via `bun:sqlite`. É o que destrava o `socios_em_comum`: passa dois CNPJs e ele cruza o quadro societário, sinal útil pra detectar laranja ou conluio entre fornecedores.

## Escopo honesto

Entrego dado bruto estruturado pro agente raciocinar. Não faço scoring de fornecedor, análise de viabilidade nem geração de proposta. A decisão segue humana. DataJud ficou de fora de propósito: a API pública do CNJ omite o campo `partes` por LGPD, então não dava pra fazer o cruzamento que eu queria sem inventar dado.

## Onde quero crítica

A divisão em 3 camadas por taxa de mudança do dado me convenceu na prática, mas tenho dúvida sobre a fronteira entre "online em tempo real" e "índice local": pra PNCP eu mantenho os dois (online e um índice offline reconstruível). Vocês manteriam, ou escolheriam um só pra reduzir superfície de bug? E sobre o `socios_em_comum` cru: vale a pena o servidor já entregar o grafo de relações montado, ou isso é responsabilidade do agente que consome? Quem já fez servidor MCP de verdade, o que dói depois que não dói no começo?

Quem licita e quer o ângulo de due diligence, escrevi sobre isso aqui: https://www.licitei.com.br/blog/due-diligence-fornecedores-dados-publicos-ia

Repo de novo pra facilitar: https://github.com/Licitei/dados-publicos-mcp
