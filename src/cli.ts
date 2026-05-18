#!/usr/bin/env bun

import { indexarLegislacao } from "./indexer";

const command = Bun.argv[2];

if (command === "index") {
  const result = await indexarLegislacao();

  console.info(`Indice criado em ${result.caminho}`);
  console.info(`Normas indexadas: ${result.normasIndexadas.join(", ")}`);
  process.exit(0);
}

console.error("Comando invalido. Use: bun src/cli.ts index");
process.exit(1);
