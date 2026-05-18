#!/usr/bin/env bun

import { Result } from "better-result";
import { errorMessage } from "./modules/legislacao/errors";
import { indexarLegislacao } from "./modules/legislacao/indexer";

const command = Bun.argv[2];

if (command === "index") {
  const result = await indexarLegislacao();

  if (Result.isOk(result)) {
    console.info(`Indice criado em ${result.value.caminho}`);
    console.info(`Normas indexadas: ${result.value.normasIndexadas.join(", ")}`);
    process.exit(0);
  }

  console.error(errorMessage(result.error));
  process.exit(1);
}

console.error("Comando invalido. Use: bun src/cli.ts index");
process.exit(1);
