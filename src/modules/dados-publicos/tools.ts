import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Result } from "better-result";
import type { EvlogError } from "evlog";
import { z } from "zod";
import { dadosPublicosErrors } from "./errors";
import {
  aggregateLicitacoesPorPeriodo,
  comparePeriodos,
  getAtaRp,
  getCnpjData,
  getContrato,
  getFornecedorContratos,
  getLicitacao,
  getOrgao,
  listContratoInstrumentos,
  listContratoTermos,
  listLicitacaoArquivos,
  listLicitacaoItens,
  listLicitacaoResultados,
  listPcaItens,
  searchAtasRp,
  searchContratos,
  searchLicitacoes,
  searchPca,
} from "./service";

const pncpIdSchema = z
  .object({
    numeroControlePNCP: z.string().trim().min(1).optional(),
    orgaoCnpj: z.string().trim().min(1).optional(),
    ano: z.number().int().positive().optional(),
    sequencial: z.number().int().positive().optional(),
  })
  .strict();

const paginationSchema = {
  pagina: z.number().int().positive().optional(),
  tamanhoPagina: z.number().int().min(10).max(50).optional(),
};

const searchLicitacoesInputSchema = z
  .object({
    dataInicial: z.string().trim().optional(),
    dataFinal: z.string().trim().optional(),
    modalidades: z.array(z.number().int().positive()).optional(),
    uf: z.string().trim().length(2).optional(),
    codigoMunicipioIbge: z.string().trim().optional(),
    cnpjOrgao: z.string().trim().optional(),
    palavraChave: z.string().trim().min(2).optional(),
    valorMinimo: z.number().nonnegative().optional(),
    valorMaximo: z.number().nonnegative().optional(),
    ...paginationSchema,
  })
  .strict();

const searchContratosInputSchema = z
  .object({
    dataInicial: z.string().trim().optional(),
    dataFinal: z.string().trim().optional(),
    cnpjOrgao: z.string().trim().optional(),
    cnpjFornecedor: z.string().trim().optional(),
    palavraChave: z.string().trim().min(2).optional(),
    ...paginationSchema,
  })
  .strict();

const searchAtasInputSchema = z
  .object({
    dataInicial: z.string().trim().optional(),
    dataFinal: z.string().trim().optional(),
    cnpjOrgao: z.string().trim().optional(),
    palavraChave: z.string().trim().min(2).optional(),
    somenteVigentes: z.boolean().optional(),
    ...paginationSchema,
  })
  .strict();

const licitacaoResultadosInputSchema = pncpIdSchema.extend({
  numeroItem: z.number().int().positive(),
});

const ataInputSchema = pncpIdSchema.extend({
  sequencialAta: z.number().int().positive(),
  incluirItens: z.boolean().optional(),
  incluirArquivos: z.boolean().optional(),
});

const cnpjInputSchema = z
  .object({
    cnpj: z.string().trim().min(1),
    provider: z.enum(["brasilapi", "minhareceita"]).optional(),
  })
  .strict();

const pcaSearchInputSchema = z
  .object({
    dataInicio: z.string().trim().optional(),
    dataFim: z.string().trim().optional(),
    codigoClassificacaoSuperior: z.string().trim().optional(),
    palavraChave: z.string().trim().min(2).optional(),
    ...paginationSchema,
  })
  .strict();

const pcaItensInputSchema = z
  .object({
    orgaoCnpj: z.string().trim().min(1),
    anoPca: z.number().int().positive(),
    sequencialPca: z.number().int().positive(),
  })
  .strict();

const aggregateInputSchema = z
  .object({
    dataInicial: z.string().trim().min(8),
    dataFinal: z.string().trim().min(8),
    granularidade: z.enum(["dia", "semana", "mes", "ano"]),
    modalidades: z.array(z.number().int().positive()).optional(),
    uf: z.string().trim().length(2).optional(),
    cnpjOrgao: z.string().trim().optional(),
    tamanhoPagina: z.number().int().min(10).max(50).optional(),
    incluirValor: z.boolean().optional(),
  })
  .strict();

const compareInputSchema = z
  .object({
    periodoA: aggregateInputSchema,
    periodoB: aggregateInputSchema,
  })
  .strict();

const toolDefinitions = {
  search_licitacoes: {
    description:
      "Busca licitacoes/editais no PNCP por periodo, modalidade, UF, orgao, valor e palavra-chave.",
    schema: searchLicitacoesInputSchema,
    handler: searchLicitacoes,
  },
  get_licitacao: {
    description:
      "Retorna detalhes de uma licitacao pelo numeroControlePNCP ou por orgaoCnpj/ano/sequencial.",
    schema: pncpIdSchema,
    handler: getLicitacao,
  },
  list_licitacao_itens: {
    description: "Lista itens/lotes de uma licitacao PNCP.",
    schema: pncpIdSchema,
    handler: listLicitacaoItens,
  },
  list_licitacao_resultados: {
    description: "Lista resultados/vencedores de um item de licitacao PNCP.",
    schema: licitacaoResultadosInputSchema,
    handler: listLicitacaoResultados,
  },
  list_licitacao_arquivos: {
    description: "Lista documentos e anexos de uma licitacao PNCP.",
    schema: pncpIdSchema,
    handler: listLicitacaoArquivos,
  },
  search_contratos: {
    description: "Busca contratos no PNCP por periodo, orgao ou fornecedor.",
    schema: searchContratosInputSchema,
    handler: searchContratos,
  },
  get_contrato: {
    description:
      "Retorna detalhes de um contrato PNCP pelo numeroControlePNCP ou por orgaoCnpj/ano/sequencial.",
    schema: pncpIdSchema,
    handler: getContrato,
  },
  list_contrato_termos: {
    description: "Lista termos aditivos de um contrato PNCP.",
    schema: pncpIdSchema,
    handler: listContratoTermos,
  },
  list_contrato_instrumentos: {
    description: "Lista instrumentos de cobranca de um contrato PNCP.",
    schema: pncpIdSchema,
    handler: listContratoInstrumentos,
  },
  search_atas_rp: {
    description:
      "Busca atas de registro de preco no PNCP, com filtro local de palavra-chave e vigencia.",
    schema: searchAtasInputSchema,
    handler: searchAtasRp,
  },
  get_ata_rp: {
    description:
      "Retorna uma ata de registro de preco e opcionalmente itens/arquivos.",
    schema: ataInputSchema,
    handler: getAtaRp,
  },
  get_orgao: {
    description: "Retorna perfil de orgao publico pelo CNPJ no PNCP.",
    schema: cnpjInputSchema.pick({ cnpj: true }),
    handler: getOrgao,
  },
  get_fornecedor_contratos: {
    description: "Busca contratos PNCP de um CNPJ como fornecedor.",
    schema: searchContratosInputSchema
      .omit({ cnpjFornecedor: true })
      .extend({ cnpj: z.string().trim().min(1) }),
    handler: getFornecedorContratos,
  },
  search_pca: {
    description: "Busca Planos de Contratacao Anual no PNCP.",
    schema: pcaSearchInputSchema,
    handler: searchPca,
  },
  list_pca_itens: {
    description: "Lista itens planejados de um PCA especifico.",
    schema: pcaItensInputSchema,
    handler: listPcaItens,
  },
  get_cnpj_data: {
    description:
      "Consulta dados cadastrais de CNPJ via BrasilAPI ou MinhaReceita, sem chave de API.",
    schema: cnpjInputSchema,
    handler: getCnpjData,
  },
  aggregate_licitacoes_por_periodo: {
    description:
      "Agrega licitacoes PNCP por dia, semana, mes ou ano em uma janela de datas.",
    schema: aggregateInputSchema,
    handler: aggregateLicitacoesPorPeriodo,
  },
  compare_periodos: {
    description:
      "Compara dois periodos de licitacoes PNCP e retorna delta absoluto e percentual.",
    schema: compareInputSchema,
    handler: comparePeriodos,
  },
} as const;

type DadosPublicosToolName = keyof typeof toolDefinitions;

export function registerDadosPublicosTools(server: McpServer) {
  for (const [name, definition] of Object.entries(toolDefinitions)) {
    server.registerTool(
      name,
      {
        description: definition.description,
        inputSchema: definition.schema,
      },
      async (args: unknown) =>
        toolContent(
          await callDadosPublicosTool(name as DadosPublicosToolName, args),
        ),
    );
  }
}

export async function callDadosPublicosTool(
  name: DadosPublicosToolName,
  args: unknown,
) {
  const definition = toolDefinitions[name];
  const input = parseToolInput(definition.schema, args);

  if (Result.isError(input)) return Result.serialize(input);

  return Result.serialize(await definition.handler(input.value as never));
}

function parseToolInput<TSchema extends z.ZodType>(
  schema: TSchema,
  args: unknown,
): Result<z.infer<TSchema>, EvlogError> {
  const parsed = schema.safeParse(args ?? {});

  if (parsed.success) return Result.ok(parsed.data);

  const issues = parsed.error.issues.map((issue) => issue.message);

  return Result.err(
    dadosPublicosErrors.ENTRADA_INVALIDA({
      detalhe: issues.join("; "),
      internal: { issues },
    }),
  );
}

function toolContent(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}
