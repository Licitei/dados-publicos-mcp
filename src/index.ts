#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Result } from "better-result";
import { cac } from "cac";
import type { BuildOptions } from "./core/adapter";
import { getAdapter, listAdapters } from "./core/registry";
import { registerStatusTool } from "./core/status";
import { registerCamaraDeputadosTools } from "./modules/camara-deputados/tools";
import { registerCapagTools } from "./modules/capag/tools";
import { registerCatmatCatserTools } from "./modules/catmat-catser/tools";
import { registerCnaeTools } from "./modules/cnae/tools";
import { registerDadosPublicosPrompts } from "./modules/dados-publicos/prompts";
import { registerPncpBulkTools } from "./modules/dados-publicos/pncp-tools";
import { registerDadosPublicosResources } from "./modules/dados-publicos/resources";
import { registerDadosPublicosTools } from "./modules/dados-publicos/tools";
import { registerIbgeLocalidadesTools } from "./modules/ibge-localidades/tools";
import { registerLegislacaoTools } from "./modules/legislacao/tools";
import { registerQueridoDiarioTools } from "./modules/querido-diario/tools";
import { registerReceitaCnpjTools } from "./modules/receita-cnpj/tools";
import { registerSancoesCguTools } from "./modules/sancoes-cgu/tools";
import { registerSicafFornecedoresTools } from "./modules/sicaf-fornecedores/tools";
import { registerTseEleitoralTools } from "./modules/tse-eleitoral/tools";

const cli = cac("dados-publicos-mcp");

cli
  .command("[serve]", "Inicia o servidor MCP via stdio")
  .action(async () => {
    await serve();
  });

cli
  .command(
    "index [fonte]",
    "Recria indice(s) local(is). Sem fonte: indexa todas as fontes leves."
  )
  .option("--all", "Indexa todas as fontes leves (requiresHeavyDownload=false)")
  .option(
    "--include-heavy",
    "Indexa todas as fontes, incluindo as que exigem download pesado"
  )
  .option("--ufs <ufs>", "Recorte de UFs (separadas por virgula). Ex: SP,RJ")
  .option("--anos <anos>", "Recorte de anos (separados por virgula). Ex: 2024,2025")
  .option("--mes <mes>", "Recorte de mes (YYYY-MM). Ex: 2026-01")
  .action(async (fonte: string | undefined, options: CliIndexOptions) => {
    await runIndex(fonte, options);
  });

cli.help();
cli.version("0.1.0");
cli.parse();

type CliIndexOptions = {
  all?: boolean;
  includeHeavy?: boolean;
  ufs?: string;
  anos?: string;
  mes?: string;
};

/**
 * Monta o BuildOptions.scope a partir das flags simples de escopo da CLI.
 * Cada adapter le apenas as chaves que conhece; chaves extras sao ignoradas.
 */
function buildScope(options: CliIndexOptions): Record<string, unknown> {
  const scope: Record<string, unknown> = {};

  if (options.ufs) {
    scope.ufs = options.ufs
      .split(",")
      .map((uf) => uf.trim().toUpperCase())
      .filter(Boolean);
  }

  if (options.anos) {
    scope.anos = options.anos
      .split(",")
      .map((ano) => Number(ano.trim()))
      .filter((ano) => Number.isFinite(ano));
  }

  if (options.mes) {
    scope.mes = options.mes.trim();
  }

  return scope;
}

async function buildAdapterKey(
  key: string,
  buildOptions: BuildOptions
): Promise<boolean> {
  const adapter = getAdapter(key);

  if (!adapter) {
    console.error(`Fonte desconhecida: ${key}`);
    const disponiveis = listAdapters()
      .map((a) => a.key)
      .join(", ");
    console.error(`Fontes disponiveis: ${disponiveis}`);
    return false;
  }

  console.info(`Indexando "${adapter.key}" (${adapter.titulo})...`);
  const result = await adapter.build(buildOptions);

  if (Result.isOk(result)) {
    console.info(
      `  ok: ${result.value.registros} registros em ${result.value.caminho}`
    );
    return true;
  }

  console.error(`  falha em "${adapter.key}": ${result.error.message}`);
  return false;
}

async function runIndex(
  fonte: string | undefined,
  options: CliIndexOptions
): Promise<void> {
  const scope = buildScope(options);
  const buildOptions: BuildOptions = {
    scope,
    includeHeavy: options.includeHeavy ?? false,
    onProgress: (msg) => console.info(`  ${msg}`),
  };

  // index <fonte>: recria apenas um dominio.
  if (fonte) {
    const ok = await buildAdapterKey(fonte, buildOptions);
    if (!ok) process.exitCode = 1;
    return;
  }

  // index (sem arg) / index --all / index --include-heavy: indexa em lote.
  // Por padrao indexa todas as fontes leves; --include-heavy adiciona as pesadas.
  const includeHeavy = options.includeHeavy ?? false;
  const alvos = listAdapters().filter(
    (adapter) => includeHeavy || !adapter.requiresHeavyDownload
  );

  if (alvos.length === 0) {
    console.error("Nenhuma fonte elegivel para indexacao.");
    process.exitCode = 1;
    return;
  }

  const pulados = listAdapters().filter(
    (adapter) => !includeHeavy && adapter.requiresHeavyDownload
  );
  if (pulados.length > 0) {
    console.info(
      `Pulando fontes pesadas (use --include-heavy): ${pulados
        .map((a) => a.key)
        .join(", ")}`
    );
  }

  let falhas = 0;
  for (const adapter of alvos) {
    const ok = await buildAdapterKey(adapter.key, buildOptions);
    if (!ok) falhas += 1;
  }

  if (falhas > 0) {
    console.error(`${falhas} fonte(s) falharam.`);
    process.exitCode = 1;
    return;
  }

  console.info(`${alvos.length} fonte(s) indexada(s) com sucesso.`);
}

async function serve() {
  const server = new McpServer({
    name: "dados-publicos-mcp",
    version: "0.1.0",
  });

  registerLegislacaoTools(server);
  registerDadosPublicosTools(server);
  registerDadosPublicosResources(server);
  registerDadosPublicosPrompts(server);

  // Fontes locais religadas na fase de integracao.
  registerIbgeLocalidadesTools(server);
  registerCnaeTools(server);
  registerSancoesCguTools(server);
  registerCatmatCatserTools(server);
  registerSicafFornecedoresTools(server);
  registerCapagTools(server);
  registerReceitaCnpjTools(server);
  registerTseEleitoralTools(server);
  registerCamaraDeputadosTools(server);
  registerQueridoDiarioTools(server);
  registerPncpBulkTools(server);

  // Tool agregada de status de todos os indices.
  registerStatusTool(server);

  await server.connect(new StdioServerTransport());
}
