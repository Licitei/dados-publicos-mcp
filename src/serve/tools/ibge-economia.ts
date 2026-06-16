import { Effect, Schema } from "effect";
import { IbgeEconomia } from "../../sources/ibge-economia/store";
import { intYear, NonEmptyString, positiveIntMax, Uf } from "../checks";
import { defineTool } from "../tool";

const CodigoInput = Schema.Struct({ codigo: NonEmptyString });

const economiaMunicipio = defineTool({
  name: "economia_municipio",
  description:
    "Retorna populacao estimada, PIB (mil reais) e PIB per capita de um municipio pelo codigo IBGE de 7 digitos (ultimo ano indexado).",
  input: CodigoInput,
  run: (args) =>
    IbgeEconomia.pipe(
      Effect.flatMap((service) => service.economiaPorCodigo(args.codigo))
    ),
});

const BuscarInput = Schema.Struct({
  nome: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  limite: Schema.optional(positiveIntMax(50)),
});

const buscarMunicipioEconomia = defineTool({
  name: "buscar_municipio_economia",
  description:
    "Busca municipios por nome (fuzzy pg_trgm) e retorna populacao, PIB e PIB per capita.",
  input: BuscarInput,
  run: (args) =>
    IbgeEconomia.pipe(
      Effect.flatMap((service) =>
        service.buscarMunicipio(args.nome, args.limite ?? 20)
      )
    ),
});

const RankingInput = Schema.Struct({
  uf: Schema.optional(Uf),
  ano: Schema.optional(intYear),
  limite: Schema.optional(positiveIntMax(100)),
});

const rankingMunicipiosPib = defineTool({
  name: "ranking_municipios_pib",
  description:
    "Lista os municipios com maior PIB, opcionalmente filtrando por UF e ano (tamanho de mercado).",
  input: RankingInput,
  run: (args) =>
    IbgeEconomia.pipe(
      Effect.flatMap((service) =>
        service.rankingPib({ uf: args.uf, ano: args.ano, limit: args.limite })
      )
    ),
});

export const ibgeEconomiaTools = [
  economiaMunicipio,
  buscarMunicipioEconomia,
  rankingMunicipiosPib,
] as const;
