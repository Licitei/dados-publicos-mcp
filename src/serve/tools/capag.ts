import { Effect, Schema } from "effect";
import { Capag } from "../../sources/capag/store";
import { NonEmptyString, intYear, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const Ibge = Schema.String.pipe(Schema.check(Schema.isMinLength(6)));

const requireEnteIdentifier = Schema.makeFilter(
  (value: {
    readonly cod_ibge?: string;
    readonly nome?: string;
    readonly uf?: string;
  }) =>
    value.cod_ibge !== undefined ||
    value.nome !== undefined ||
    value.uf !== undefined
      ? undefined
      : "Informe cod_ibge, nome ou uf."
);

const CapagEnteInput = Schema.Struct({
  cod_ibge: Schema.optional(Ibge),
  nome: Schema.optional(NonEmptyString),
  uf: Schema.optional(NonEmptyString),
  ano: Schema.optional(intYear),
}).pipe(Schema.check(requireEnteIdentifier));

const capagEnte = defineTool({
  name: "capag_ente",
  description:
    "CAPAG de um ente: por codigo IBGE (7d) ou nome+UF (municipio) ou sigla UF (estado). Retorna nota CAPAG e os 3 indicadores.",
  input: CapagEnteInput,
  run: (args) =>
    Capag.pipe(
      Effect.flatMap((service) =>
        service.capagEnte({
          ibge: args.cod_ibge,
          nome: args.nome,
          uf: args.uf,
          ano: args.ano,
        })
      )
    ),
});

const EntesPorNotaInput = Schema.Struct({
  notas: Schema.Array(NonEmptyString).pipe(Schema.check(Schema.isMinLength(1))),
  uf: Schema.optional(Schema.String),
  regiao: Schema.optional(NonEmptyString),
  esfera: Schema.optional(NonEmptyString),
  limite: Schema.optional(positiveIntMax(2000)),
});

const entesPorNota = defineTool({
  name: "entes_por_nota",
  description:
    "Lista entes (estados e/ou municipios) com nota CAPAG informada (ex C/D = alto risco), filtrando por UF/regiao.",
  input: EntesPorNotaInput,
  run: (args) =>
    Capag.pipe(
      Effect.flatMap((service) =>
        service.entesPorNota({
          notas: args.notas,
          uf: args.uf,
          regiao: args.regiao,
          esfera: args.esfera,
          limit: args.limite,
        })
      )
    ),
});

const SerieInput = Schema.Struct({
  cod_ibge: Schema.optional(Ibge),
  nome: Schema.optional(NonEmptyString),
  uf: Schema.optional(Schema.String),
}).pipe(Schema.check(requireEnteIdentifier));

const capagSerieHistorica = defineTool({
  name: "capag_serie_historica",
  description: "Serie historica da nota CAPAG de um ente ao longo dos anos.",
  input: SerieInput,
  run: (args) =>
    Capag.pipe(
      Effect.flatMap((service) =>
        service.serieHistorica({
          ibge: args.cod_ibge,
          nome: args.nome,
          uf: args.uf,
        })
      )
    ),
});

const ResolverInput = Schema.Struct({
  cnpj: Schema.String.pipe(Schema.check(Schema.isMinLength(11))),
});

const resolverEntePorCnpj = defineTool({
  name: "resolver_ente_por_cnpj",
  description:
    "CNPJ do orgao contratante -> cod_ibge/municipio/UF via tabela /entes do SICONFI, anexando a CAPAG do ente.",
  input: ResolverInput,
  run: (args) =>
    Capag.pipe(
      Effect.flatMap((service) =>
        service.resolverEntePorCnpj(args.cnpj).pipe(
          Effect.flatMap((ente) =>
            service
              .capagEnte({ ibge: ente.codIbge })
              .pipe(
                Effect.map((capag) => ({ ...ente, capag })),
                Effect.catchTag("CapagError", () =>
                  Effect.succeed({ ...ente, capag: null })
                )
              )
          )
        )
      )
    ),
});

export const capagTools = [
  capagEnte,
  entesPorNota,
  capagSerieHistorica,
  resolverEntePorCnpj,
] as const;
