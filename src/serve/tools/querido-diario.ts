import { Effect, Schema } from "effect";
import { QueridoDiario } from "../../sources/querido-diario/store";
import { NonEmptyString, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const BuscarDiariosInput = Schema.Struct({
  termo: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  territoryId: Schema.optional(NonEmptyString),
  limite: Schema.optional(positiveIntMax(50)),
});

const buscarDiarios = defineTool({
  name: "buscar_diarios",
  description:
    "Busca full-text no texto extraido dos diarios oficiais municipais (Querido Diario). Filtros opcionais: territoryId (IBGE).",
  input: BuscarDiariosInput,
  run: (args) =>
    QueridoDiario.pipe(
      Effect.flatMap((service) =>
        service.buscarDiarios(args.termo, {
          territoryId: args.territoryId,
          limit: args.limite,
        })
      )
    ),
});

const BuscarCnpjInput = Schema.Struct({
  cnpj: Schema.String.pipe(Schema.check(Schema.isMinLength(11))),
  limite: Schema.optional(positiveIntMax(50)),
});

const buscarCnpjEmDiario = defineTool({
  name: "buscar_cnpj_em_diario",
  description:
    "Busca diarios oficiais municipais que mencionam um CNPJ no corpo de editais e contratos.",
  input: BuscarCnpjInput,
  run: (args) =>
    QueridoDiario.pipe(
      Effect.flatMap((service) =>
        service.buscarCnpjEmDiario(args.cnpj, { limit: args.limite })
      )
    ),
});

const DiariosPorMunicipioInput = Schema.Struct({
  territoryId: NonEmptyString,
  limite: Schema.optional(positiveIntMax(50)),
});

const diariosPorMunicipio = defineTool({
  name: "diarios_por_municipio",
  description:
    "Lista diarios oficiais de um municipio pelo codigo IBGE (territory_id).",
  input: DiariosPorMunicipioInput,
  run: (args) =>
    QueridoDiario.pipe(
      Effect.flatMap((service) =>
        service.diariosPorMunicipio(args.territoryId, { limit: args.limite })
      )
    ),
});

export const queridoDiarioTools = [
  buscarDiarios,
  buscarCnpjEmDiario,
  diariosPorMunicipio,
] as const;
