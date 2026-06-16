import { Effect, Schema } from "effect";
import { defineTool } from "./tool";

const NoInput = Schema.Struct({});

const guiaUso = `# Guia de uso — dados-publicos-mcp (local-first, privacy-first)

Este MCP expoe ferramentas locais sobre dados publicos brasileiros indexados em um unico PGlite (BM25 ⊕ vetorial por RRF, pg_trgm fuzzy, ltree hierarquico). Nao ha API ao vivo nem nuvem: toda resposta vem de indices locais.

## Dois contratos inegociaveis
- Local-first: nada que o usuario pergunte (um CNPJ, um item de edital, uma consulta) sai da maquina. Indice vazio => responda "fonte ainda nao indexada; rode indexar_<fonte>", nunca um chute e nunca uma chamada remota.
- Privacy-first, evidence-first: estas ferramentas produzem inteligencia preliminar, explicavel e verificavel — nunca parecer juridico, relatorio formal ou veredito final. Toda resposta de inteligencia carrega:
  privacidade: { modo: "local", dadosEnviadosParaTerceiros: false }
  fontes: [...]      # quais tools/indices originaram a resposta
  limitacoes: [...]  # o que falta, esta defasado ou nao foi verificado
  confianca: "baixa" | "media" | "alta"
  confianca baixa = uma fonte ou match fuzzy; media = corroboracao em duas fontes; alta = join por chave exata (CNPJ, codigo IBGE, numero PNCP) em multiplas fontes.

## Resolva antes de buscar
Texto livre e ambiguo; codigos nao. Resolva nomes para chaves estaveis e busque por chave:
- municipio => resolver_municipio / resolver_codigo_ibge ; UF => validar_uf
- CNAE => resolver_cnae ; item de edital => resolver_catmat_catser / normalizar_item_edital
- ente federativo => resolver_ente_por_cnpj
Depois os buscar_* e os lookups por chave (consultar_cnpj, contratos_do_fornecedor, capag_ente, ...) casam limpo.

## Fluxos compostos (carregue o guia especifico antes de responder)
- guia_pesquisar_preco — pesquisa preliminar de precos de compras publicas.
- guia_triagem_fornecedor — due diligence de fornecedor por CNPJ (Receita ⊕ sancoes ⊕ SICAF ⊕ PNCP ⊕ socios).
- guia_mapear_mercado — visao de mercado por termo / categoria / UF / orgao / fornecedor.
- guia_due_diligence_eleitoral — candidato e rastreio de doadores (TSE).

## Em duvida, status primeiro
Chame status_indices para ver quais fontes estao indexadas e quao frescas antes de prometer uma resposta. Fonte vazia e uma limitacao, nao uma falha.`;

const guiaPesquisarPreco = `# Guia: pesquisar preco publico (lite)

Objetivo: uma faixa de referencia PRELIMINAR para um item, ancorada em contratacoes publicas reais indexadas localmente. Nunca a pesquisa de precos final.

## Receita
1. Normalize o item. resolver_catmat_catser (ou normalizar_item_edital) transforma o texto livre em codigo CATMAT/CATSER + descricao canonica. Se nada resolver, diga — item fuzzy derruba a confianca para baixa.
2. Recorte (opcional). resolver_municipio / validar_uf para limitar por localidade; capture ano/mes do periodo.
3. Ache compras similares. buscar_pncp_local com a descricao normalizada (+ filtros UF/municipio/periodo). Para fornecedor conhecido, tambem contratos_do_fornecedor.
4. Resuma como amostras, nao veredito. N itens similares, min / mediana / max do valor unitario, periodo e localidades cobertos, e um identificador (numero PNCP) por amostra.

## Formato de saida
amostras: [{ pncp, orgao, uf, item, valorUnitario, data }]
estatistica: { n, min, mediana, max }
fontes: ["catmat-catser", "pncp"]
limitacoes: ["amostra pequena", "periodo X-Y", "nao ajustado por inflacao/quantidade/marca"]
confianca: baixa | media | alta

- confianca baixa se n < 5 ou item resolvido so fuzzy.
- Sempre diga que preco varia por quantidade, marca, regiao e prazo — ponto de partida, nao a pesquisa em si.
- Nunca invente valor sem amostras: retorne n: 0 com limitacao e sugira indexar PNCP para o periodo/UF.`;

const guiaTriagemFornecedor = `# Guia: triagem de fornecedor (local)

Objetivo: triagem de risco rapida e local de uma empresa antes de analise mais profunda. Nunca decisao final de habilitacao/inabilitacao.

## Receita
1. Ancore no CNPJ. Se vier nome, buscar_empresa_por_nome (Receita) ou fornecedor_pncp_por_nome / buscar_fornecedor_sicaf para achar o CNPJ. CNPJ exato => confianca pode chegar a alta; so nome fica media no maximo.
2. Cadastro. consultar_cnpj — razao social, situacao cadastral, CNAE, porte, socios. Situacao != "ATIVA" e uma limitacao/risco de destaque.
3. Sancoes. verificar_sancoes (por CNPJ) e, para data de contrato especifica, sancoes_vigentes_na_data. Qualquer hit e o sinal mais importante — mostre primeiro.
4. Habilitacao. fornecedor_habilitado / buscar_fornecedor_sicaf (SICAF) — registrado e em quais linhas.
5. Historico publico. contratos_do_fornecedor (PNCP) — volume e contrapartes de contratos passados.
6. Rede societaria. socios_em_comum / buscar_socio_por_nome — socios compartilhados com outras firmas (pista de direcionamento/conluio a investigar, nao a concluir).

## Formato de saida
empresa: { cnpj, razaoSocial, situacao, cnaePrincipal, porte }
sancoes: [{ tipo, orgao, vigencia, fonte }]   # vazio = nada indexado, NAO "limpo"
sicaf: { habilitado, linhas }
historico: { contratosPNCP: n, orgaos: [...] }
socios: [...]
fontes: ["receita-cnpj", "sancoes-cgu", "sicaf-fornecedores", "pncp"]
limitacoes: ["fontes nao indexadas: ...", "sancao ausente != idoneidade comprovada"]
confianca: baixa | media | alta

- Resultado de sancoes vazio significa "nada indexado/encontrado", NAO "idoneo" — diga explicitamente. Nunca implique ficha limpa a partir de ausencia de dado.
- confianca alta so com CNPJ exato e >=2 fontes corroborando; senao media/baixa.
- E triagem para decidir onde olhar mais de perto, nao um parecer de habilitacao.`;

const guiaMapearMercado = `# Guia: mapear mercado publico (lite)

Objetivo: um retrato PRELIMINAR de quem compra, quem vende e quanto em torno de um termo/categoria/localidade.

## Receita
1. Fixe os eixos. Resolva o que o usuario nomeou:
   - categoria => resolver_catmat_catser (item) ou resolver_cnae (atividade)
   - localidade => resolver_municipio / validar_uf (codigo IBGE)
2. Demanda (compras). buscar_pncp_local filtrado por categoria + localidade + periodo => quais orgaos contrataram, volumes, faixas de valor.
3. Oferta (fornecedores). listar_fornecedores_uf_cnae (SICAF) e fornecedor_pncp_por_nome => quem esta registrado/ativo para fornecer naquela UF + CNAE.
4. Sinal de concentracao. Agregue contratos_do_fornecedor nos principais fornecedores para mostrar se o mercado e concentrado ou fragmentado (sinal a investigar, nao conclusao).

## Formato de saida
recorte: { categoria, uf, municipio, periodo }
demanda: { orgaos: [...], nContratacoes, faixaValor }
oferta: { fornecedoresAtivos: n, topFornecedores: [...] }
concentracao: { topNshare }   # share dos top fornecedores — descritivo
fontes: ["pncp", "ibge-localidades", "cnae", "sicaf-fornecedores"]
limitacoes: ["cobertura por fonte indexada", "periodo X-Y", "amostra parcial"]
confianca: baixa | media | alta

- Apresente como orientacao, nao estudo de mercado nem recomendacao de contratacao.
- confianca acompanha quantas fontes retornaram dado para o recorte; lacunas viram limitacoes.`;

const guiaDueDiligenceEleitoral = `# Guia: due diligence eleitoral (local)

Objetivo: rastreio PRELIMINAR e ancorado em evidencia dos bens declarados e financas de campanha de um candidato, totalmente local (indices TSE). Nunca acusacao nem conclusao de irregularidade.

## Receita
1. Ancore o candidato. due_diligence_candidato => bens declarados, candidatura, perfil basico.
2. Dinheiro que entra. buscar_doacoes => quem doou e quanto.
3. Rastreie a origem real. rastrear_doador_originario => siga a doacao por intermediarios ate o doador originario (sinal anti-lavagem central).
4. Dinheiro que sai. buscar_fornecedor_campanha => fornecedores de campanha; cruze com triagem de fornecedor (consultar_cnpj, verificar_sancoes, socios_em_comum) para sinalizar fornecedor sancionado, com socio em comum ou que tambem tem contrato publico.

## Formato de saida
candidato: { nome, cargo, ano, bensDeclarados }
doacoes: { totalRecebido, principaisDoadores: [...] }
origem: [{ doadorDeclarado -> doadorOriginario, valor }]
fornecedores: [{ cnpj, valor, flags: ["sancionado","socio em comum","tem contrato publico"] }]
fontes: ["tse-eleitoral", "receita-cnpj", "sancoes-cgu", "pncp"]
limitacoes: ["apenas anos/UF indexados", "vinculo != irregularidade"]
confianca: baixa | media | alta

- Um vinculo (socio em comum, sancao, contrato publico) e uma pista a investigar, nunca prova — diga isso em limitacoes sempre.
- Mantenha descritivo e com fontes; e reconhecimento sobre dados publicos do TSE, nao uma denuncia.`;

const skill = (
  name: string,
  description: string,
  conteudo: string
) =>
  defineTool({
    name,
    description,
    input: NoInput,
    run: () => Effect.succeed(conteudo),
  });

export const skillTools = [
  skill(
    "guia_uso",
    "Carrega o guia geral do MCP (local-first, privacy-first, envelope de privacidade, resolva-antes-de-buscar). Chame ANTES de responder qualquer pergunta sobre compras publicas, fornecedores, CNPJ, sancoes, legislacao ou inteligencia de mercado, e siga o contrato.",
    guiaUso
  ),
  skill(
    "guia_pesquisar_preco",
    "Carrega o passo-a-passo de pesquisa preliminar de precos de compras publicas (CATMAT/CATSER + PNCP). Chame ANTES de responder sobre preco de referencia / quanto custa / se um preco esta caro.",
    guiaPesquisarPreco
  ),
  skill(
    "guia_triagem_fornecedor",
    "Carrega o passo-a-passo de due diligence de fornecedor por CNPJ ou nome (Receita + sancoes + SICAF + PNCP + socios). Chame ANTES de responder se um fornecedor e confiavel, se tem sancao, se esta habilitado ou quem sao os socios.",
    guiaTriagemFornecedor
  ),
  skill(
    "guia_mapear_mercado",
    "Carrega o passo-a-passo de visao de mercado publico por termo / categoria / UF / orgao / fornecedor (PNCP + IBGE + CNAE + SICAF). Chame ANTES de responder quem compra, quem vende ou quanto se gastou.",
    guiaMapearMercado
  ),
  skill(
    "guia_due_diligence_eleitoral",
    "Carrega o passo-a-passo de due diligence eleitoral de candidato e rastreio de doadores (TSE + Receita + sancoes + PNCP). Chame ANTES de responder sobre financiamento de campanha, origem de doacoes ou bens declarados.",
    guiaDueDiligenceEleitoral
  ),
];
