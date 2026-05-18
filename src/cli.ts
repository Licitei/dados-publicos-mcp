#!/usr/bin/env bun

import { Result } from "better-result";
import { recriarIndiceLocal } from "./modules/legislacao/store";

const command = Bun.argv[2];

if (command === "index") {
  const result = await recriarIndiceLocal();

  if (Result.isOk(result)) {
    console.info(`Indice criado em ${result.value.caminho}`);
    console.info(`Normas indexadas: ${result.value.normasIndexadas.join(", ")}`);
    process.exit(0);
  }

  console.error(result.error.message);
  process.exit(1);
}

console.error("Comando invalido. Use: bun src/cli.ts index");
process.exit(1);
