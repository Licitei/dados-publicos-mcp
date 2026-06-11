import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerDadosPublicosPrompts(server: McpServer) {
  server.registerPrompt(
    "analyze_edital",
    {
      title: "Analisar edital",
      description: "Roteiro para analisar viabilidade de uma licitacao PNCP.",
      argsSchema: {
        numeroControlePNCP: z.string().optional(),
        orgaoCnpj: z.string().optional(),
        ano: z.string().optional(),
        sequencial: z.string().optional(),
      },
    },
    (args) =>
      promptResult("Analisar edital", [
        "Use get_licitacao para obter os dados principais.",
        "Use list_licitacao_itens para mapear lotes, quantidades e valores.",
        "Use list_licitacao_arquivos para localizar edital, termo de referencia e anexos.",
        "Se houver resultado, use list_licitacao_resultados.",
        "Entregue resumo objetivo, riscos, documentos necessarios e checklist de viabilidade.",
        `Identificador informado: ${JSON.stringify(args)}`,
      ]),
  );

  server.registerPrompt(
    "analyze_orgao",
    {
      title: "Analisar orgao",
      description: "Roteiro para montar perfil 360 de um orgao publico.",
      argsSchema: { cnpj: z.string() },
    },
    (args) =>
      promptResult("Analisar orgao", [
        "Use get_orgao para o perfil cadastral.",
        "Use search_licitacoes com cnpjOrgao para compras recentes.",
        "Use search_contratos com cnpjOrgao para contratos recentes.",
        "Use search_pca para sinais de compras futuras.",
        "Sintetize padrao de compra, temas recorrentes, modalidades e possiveis oportunidades.",
        `CNPJ: ${args.cnpj}`,
      ]),
  );

  server.registerPrompt(
    "find_arp_opportunities",
    {
      title: "Encontrar oportunidades em atas RP",
      description: "Roteiro para buscar atas vigentes com potencial de uso.",
      argsSchema: {
        palavraChave: z.string(),
        cnpjOrgao: z.string().optional(),
      },
    },
    (args) =>
      promptResult("Encontrar atas RP", [
        "Use search_atas_rp com somenteVigentes=true.",
        "Refine por cnpjOrgao quando o usuario indicar um orgao.",
        "Para atas promissoras, use get_ata_rp com incluirItens=true e incluirArquivos=true.",
        "Mostre vigencia, orgao, objeto, possiveis saldos e ressalvas sobre filtro local por pagina.",
        `Criterios: ${JSON.stringify(args)}`,
      ]),
  );

  server.registerPrompt(
    "check_supplier",
    {
      title: "Checar fornecedor",
      description:
        "Roteiro para verificacao publica basica de fornecedor por CNPJ.",
      argsSchema: { cnpj: z.string() },
    },
    (args) =>
      promptResult("Checar fornecedor", [
        "Use get_cnpj_data para cadastro, situacao, CNAE e quadro societario.",
        "Use get_fornecedor_contratos para historico de contratos publicos.",
        "Aponte sinais publicos relevantes, sem concluir risco juridico sozinho.",
        `CNPJ: ${args.cnpj}`,
      ]),
  );
}

function promptResult(title: string, lines: string[]) {
  return {
    description: title,
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: lines.join("\n"),
        },
      },
    ],
  };
}
