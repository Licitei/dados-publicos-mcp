Seu agente de IA agora cruza sócios em comum entre fornecedores de uma mesma licitação e aponta sinal de laranja e conluio.

A consulta de CNPJ oficial te obriga a saber o número. E quando você só tem o nome de uma empresa suspeita? Quando precisa saber se dois fornecedores do mesmo pregão dividem sócio? Se o vencedor estava sancionado pela CGU na data exata do certame?

Nenhuma API gratuita responde isso. Por anos eu abria 5 abas da CGU, baixava planilha da Receita, cruzava na unha e rezava. Cansei. Então construí o dados-publicos-mcp, da Licitei.

MCP é o USB-C pra IA: um padrão que pluga ferramentas e dados direto no Claude, Cursor ou Continue.dev, sem cola manual.

Com ele conectado, seu agente passa a:

🔍 Achar empresa e sócio por NOME, não só por CNPJ.

🔗 Cruzar sócios em comum entre fornecedores do mesmo certame.

✅ Rodar due diligence em 5 listas da CGU (CEIS, CNEP, CEPIM, CEAF, Leniência) filtrando sanção vigente na data do pregão.

📊 Medir risco fiscal do órgão comprador pela nota CAPAG do Tesouro.

🔓 Buscar tudo offline. Zero API key, zero banco de terceiros. Os índices vivem na sua máquina, em ~/.local/share, com full-text via SQLite e FTS5 nativo.

Números: 78 ferramentas MCP, 12 fontes oficiais indexáveis, 43 normas no catálogo de legislação, 240 testes passando. Bun + TypeScript, 7 dependências de runtime.

Escopo honesto: ele entrega dado bruto estruturado. Não faz scoring, não avalia viabilidade, não escreve proposta. A decisão continua sua.

A versão pra quem licita, com foco em due diligence: licitei.com.br/blog/due-diligence-fornecedores-dados-publicos-ia

Pergunta pra quem já construiu MCP server: vocês expõem cada fonte como uma tool separada ou agrupam por domínio? Cheguei em 78 tools e começo a achar que o agente se perde no menu. Como vocês equilibram granularidade e ruído no catálogo?

#OpenSource #GovTech #DadosAbertos #DevBR #MCP
