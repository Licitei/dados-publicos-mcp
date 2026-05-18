import { appClient } from "../../client";
import type { ToolModule } from "../../mcp/registry";
import {
  buscarLegislacaoJsonSchema,
  emptyInputJsonSchema,
  obterArtigoJsonSchema,
} from "./schemas";

export const legislacaoModule: ToolModule = {
  name: "legislacao",
  tools: [
    {
      name: "listar_normas",
      description: "Lista as normas brasileiras disponiveis no catalogo.",
      inputSchema: {
        ...emptyInputJsonSchema,
      },
    },
    {
      name: "buscar_legislacao",
      description:
        "Busca um termo no indice local de legislacao brasileira.",
      inputSchema: {
        ...buscarLegislacaoJsonSchema,
      },
    },
    {
      name: "obter_artigo",
      description: "Retorna um artigo especifico de uma norma brasileira.",
      inputSchema: {
        ...obterArtigoJsonSchema,
      },
    },
    {
      name: "status_indice",
      description: "Mostra o status e o caminho do indice local.",
      inputSchema: {
        ...emptyInputJsonSchema,
      },
    },
    {
      name: "indexar_legislacao",
      description:
        "Baixa fontes oficiais do Planalto e recria o indice local neste computador.",
      inputSchema: {
        ...emptyInputJsonSchema,
      },
    },
  ],
  callTool(name, args) {
    if (name === "listar_normas") {
      return appClient.legislacao.listarNormas();
    }

    if (name === "buscar_legislacao") {
      return appClient.legislacao.buscar(args as never);
    }

    if (name === "obter_artigo") {
      return appClient.legislacao.obterArtigo(args as never);
    }

    if (name === "status_indice") {
      return appClient.legislacao.statusIndice();
    }

    if (name === "indexar_legislacao") {
      return appClient.legislacao.recriarIndice();
    }

    throw new Error(`Ferramenta de legislacao nao encontrada: ${name}`);
  },
};
