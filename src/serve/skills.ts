import { Effect, Schema } from "effect";
import { defineTool } from "./tool";

const recipes = {
  uso: `# Uso geral
Comece por fontes: descubra tabelas, colunas, campos de busca, volumes e acervos disponíveis. Use buscar para resolver nomes; confirme chaves exatas com consultar_sql. Use indexar apenas para fontes leves; para pesadas, indique a CLI e o escopo necessário. Consultas SQL são locais, somente leitura, com prazo de 5 segundos e limite padrão de 200 linhas (máximo 1000). Use agregações para não confundir resultados truncados com totais.
Nada que o usuário pergunte é enviado a terceiros. A indexação baixa conjuntos oficiais públicos; não envia o objeto da pesquisa. Toda análise deve informar privacidade: { modo: "local", dadosEnviadosParaTerceiros: false }, fontes: [tabela ou caminho, data e recorte], limitacoes: [ausências, defasagens, cobertura e truncamento], confianca: "baixa" | "media" | "alta". Match aproximado indica confiança baixa; cruzamentos por chaves exatas sustentam confiança maior, mas não provam ausência de irregularidades. Não apresente uma conclusão preliminar como parecer final.
Exemplo: consultar_sql({ sql: 'SELECT "ufSigla", count(*) AS municipios FROM municipio GROUP BY "ufSigla" ORDER BY "ufSigla"' }).`,
  juridico: `# Jurídico lite e checklist de edital
Use acervo_buscar({ acervo: "leis", termos: ["14.133"] }) e acervo_localizar para encontrar a norma. Leia os arquivos com acervo_ler antes de citar artigos. Busque o objeto e as exigências no acervo precedentes, restringindo dentro: "tribunais/TCU/" quando pertinente. Cite caminho e trecho de cada evidência. Para checklist, relacione exigência, artigo, precedente, aplicabilidade e pendência de confirmação. Preserve variantes e cancelamentos; não infira vigência pela presença do arquivo. Informe fontes, limitacoes e confianca.`,
  pesquisa_preco: `# Pesquisa de preço lite
No espírito da IN SEGES 65/2021, resolva o item e sua unidade em buscar, conferindo CATMAT/CATSER. Descubra em fontes as amostras disponíveis em PNCP, Compras.gov.br, Painel de Preços e fontes setoriais SINAPI/CMED. Uma fonte ausente é limitação explícita. Restrinja período, unidade, especificação e localidade antes de comparar. Preserve fonte, identificador, data, quantidade e valor de cada amostra. Evite duplicar o mesmo registro entre bases.
Exemplo de preço homologado no Compras.gov.br: SELECT "niFornecedor", "valorUnitarioHomologado", "dataResultadoPncp", "numeroControlePNCPCompra" FROM compras_resultado WHERE "valorUnitarioHomologado" > 0. Os valores de pncp_item são estimados; não os misture com homologados sem rotular essa diferença.
Exemplo real no Painel: SELECT "codigoItemCatalogo", "unidadeFornecimento", count(*) AS n, median("precoUnitario") AS mediana, quantile_cont("precoUnitario", 0.25) AS q1, quantile_cont("precoUnitario", 0.75) AS q3 FROM preco_praticado WHERE "precoUnitario" > 0 GROUP BY "codigoItemCatalogo", "unidadeFornecimento".
Examine outliers pelo intervalo interquartil (q1 − 1,5 × IQR; q3 + 1,5 × IQR), registrando justificativa e resultados antes/depois da exclusão. Corrija valores para a mesma data usando série oficial e fórmula adequada ao contrato; não misture variação percentual e número-índice. Não apresente a amostra local como pesquisa formal completa. Retorne fontes, limitacoes e confianca.`,
  score_orgao: `# Score do órgão lite
Resolva o ente em buscar e confirme CNPJ/código IBGE. Cruze CAPAG e SICONFI com volume, recorrência e execução de compras no PNCP/Compras.gov.br e ocorrências TCE disponíveis. Descubra cobertura em fontes. Declare pesos, denominadores, período e dados ausentes; não atribua zero a fonte não indexada. Não transforme CAPAG em diagnóstico de integridade.
Exemplo: SELECT e.ente, e.cnpj, c.capag, c."anoBase" FROM siconfi_ente e LEFT JOIN capag_municipio c ON c."codIbge" = e."codIbge" WHERE e.uf = 'RS'.
Exemplo de volume: SELECT "orgaoCnpj", count(*) AS contratos, sum("valorGlobal") AS valor FROM contrato GROUP BY "orgaoCnpj". Prazo entre homologação e contrato só pode ser calculado com datas correspondentes e vínculo confirmado, nunca por aproximação. Retorne fontes, limitacoes e confianca.`,
  analise_cnpj: `# Análise de CNPJ lite
Comece por fontes e descubra o esquema. Confirme CNPJ completo, matriz/filial, razão social e sócios na Receita. Cruze sanções CGU, TCU, SICAF, PGFN, Lista Suja, IBAMA e CVM; confira situação, cancelamento e datas. No IBAMA, confira também desembargado e dataDesembargo antes de tratar um termo como impedimento atual. Compare sócios com PEP e doações TSE apenas quando as chaves e a identificação permitirem. CPFs mascarados e homônimos não autorizam associação inequívoca. Na CVM, companhias e fundos têm CNPJ; processos e acusados do ZIP sancionador se vinculam por NUP e não publicam CNPJ de acusados. Um nome semelhante entre cadastro e processo não prova identidade. Examine contratos PNCP/Compras.gov.br e sócios em comum sem inferir culpa de uma relação societária.
Exemplo: SELECT lista, nome, categoria, "dataInicio", "dataFinal" FROM sancao WHERE "docNormalizado" = '00000000000191'.
Exemplo: SELECT "niFornecedor", "nomeRazaoSocialFornecedor", "orgaoCnpj", "valorGlobal", "dataAssinatura" FROM contrato WHERE "niFornecedor" = '00000000000191'.
Ausência de registro não é certidão negativa. Registre separadamente fonte ausente, match aproximado e registro exato. Informe fontes, limitacoes e confianca.`,
  mapa_mercado: `# Mapa de mercado lite
Resolva item/CNAE com buscar, confirme unidade e recorte em consultar_sql, e cruze compradores/fornecedores de PNCP, Compras.gov.br, Painel e Receita disponíveis. Separe volume contratado, preço unitário e quantidade. Evite dupla contagem entre bases. Calcule participação e HHI por segmento e período, explicitando a cobertura local.
Exemplo: WITH vendas AS (SELECT "niFornecedor", sum("valorGlobal") AS valor FROM contrato WHERE "valorGlobal" > 0 GROUP BY "niFornecedor"), parcelas AS (SELECT *, valor / sum(valor) OVER () AS participacao FROM vendas) SELECT sum(participacao * participacao) * 10000 AS hhi FROM parcelas.
Esse exemplo mede apenas os contratos locais: acrescente o recorte do segmento antes de usá-lo. Retorne fontes, limitacoes e confianca.`,
  reajuste_contrato: `# Reajuste de contrato lite
Leia a cláusula de reajuste e confirme índice, data-base, período e regra de aniversário; não presuma autorização jurídica. Descubra em fontes a série oficial disponível: SGS 433 IPCA, 188 INPC, 189 IGP-M, 190 IGP-DI, 192 INCC-M, 7478 IPCA-15 ou SIDRA t1737 v2266 para número-índice IPCA. Fonte não indexada impede cálculo verificável.
Para taxas mensais, fator = produto(1 + taxa/100); para números-índice, fator = índice final / índice da data-base. Valor reajustado = valor-base × fator. Confira lacunas, periodicidade, publicação e revisões; não invente observações. Retorne a série, meses, fórmula, arredondamento e fontes, limitacoes e confianca.
Exemplo com a série local: SELECT serie, min(mes) AS inicio, max(mes) AS fim, count(*) AS meses, product(1 + valor/100) AS fator FROM indice_reajuste WHERE codigo = '433' AND tipo = 'taxa_mensal' AND mes BETWEEN '2025-01' AND '2025-12' GROUP BY serie. Confirme doze observações antes de usar esse intervalo anual.`,
};

export const guia = defineTool({
  name: "guia",
  description:
    "Receitas de composição com fontes, buscar, consultar_sql e acervos: uso, jurídico, preço, órgão, CNPJ, mercado e reajuste. Análises preliminares com fontes, limitações e confiança explícitas.",
  input: Schema.Struct({
    tema: Schema.Literals([
      "uso",
      "juridico",
      "pesquisa_preco",
      "score_orgao",
      "analise_cnpj",
      "mapa_mercado",
      "reajuste_contrato",
    ]),
  }),
  run: (args) => Effect.succeed(recipes[args.tema]),
});
