import { Effect, Schema } from "effect";
import { TransparenciaDespesas } from "../../sources/transparencia-despesas/store";
import { NonEmptyString, positiveIntMax, Uf } from "../checks";
import { defineTool } from "../tool";

const BuscarInput = Schema.Struct({
  termo: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  uf: Schema.optional(Uf),
  limite: Schema.optional(positiveIntMax(200)),
});

const buscarDespesaFederal = defineTool({
  name: "buscar_despesa_federal",
  description:
    "Busca despesas da execucao orcamentaria federal (Portal da Transparencia) por acao/programa/elemento usando BM25, opcionalmente filtrando por UF.",
  input: BuscarInput,
  run: (args) =>
    TransparenciaDespesas.pipe(
      Effect.flatMap((service) =>
        service.buscarDespesa(args.termo, { uf: args.uf, limit: args.limite })
      )
    ),
});

const OrgaoInput = Schema.Struct({
  codigoOrgaoSuperior: NonEmptyString,
  limite: Schema.optional(positiveIntMax(200)),
});

const despesasPorOrgao = defineTool({
  name: "despesas_por_orgao",
  description:
    "Lista as despesas federais de um orgao superior (pelo codigo) ordenadas por valor pago.",
  input: OrgaoInput,
  run: (args) =>
    TransparenciaDespesas.pipe(
      Effect.flatMap((service) =>
        service.despesasPorOrgao(args.codigoOrgaoSuperior, args.limite ?? 100)
      )
    ),
});

export const transparenciaDespesasTools = [
  buscarDespesaFederal,
  despesasPorOrgao,
] as const;
