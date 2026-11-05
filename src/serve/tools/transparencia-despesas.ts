import { Effect, Schema, Struct } from "effect";
import { TransparenciaDespesas } from "../../sources/transparencia-despesas/store";
import { BuscarTermoUfInput, NonEmptyString, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const buscarDespesaFederal = defineTool({
  name: "buscar_despesa_federal",
  description:
    "Busca despesas da execucao orcamentaria federal (Portal da Transparencia) por acao/programa/elemento, opcionalmente filtrando por UF.",
  input: BuscarTermoUfInput,
  run: (args) =>
    TransparenciaDespesas.pipe(
      Effect.flatMap((service) =>
        service.buscarDespesa(
          args.termo,
          Struct.renameKeys(Struct.pick(args, ["uf", "limite"]), { limite: "limit" })
        )
      )
    ),
});

const OrgaoInput = Schema.Struct({
  codigoOrgaoSuperior: NonEmptyString,
  limite: Schema.optionalKey(positiveIntMax(200)),
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

export const transparenciaDespesasTools = [buscarDespesaFederal, despesasPorOrgao] as const;
