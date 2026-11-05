import { Option, Schema } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import * as Str from "effect/String";
import { normalize } from "../../kernel/text/normalize";

const agregadosBase = "https://servicodados.ibge.gov.br/api/v3/agregados";

export const populacaoAgregado = 6579;
export const populacaoVariavel = 9324;
export const pibAgregado = 5938;
export const pibVariavel = 37;

export const defaultAno = 2021;

export const serieUrl: {
  (ano: number, variavel: number): (agregado: number) => string;
  (agregado: number, ano: number, variavel: number): string;
} = dual(
  3,
  (agregado: number, ano: number, variavel: number) =>
    `${agregadosBase}/${agregado}/periodos/${ano}/variaveis/${variavel}?localidades=N6`
);

const LocalidadeRaw = Schema.Struct({
  id: Schema.String,
  nome: Schema.String,
});

const SerieRaw = Schema.Struct({
  localidade: LocalidadeRaw,
  serie: Schema.Record(Schema.String, Schema.NullOr(Schema.String)),
});

const ResultadoRaw = Schema.Struct({
  series: Schema.Array(SerieRaw),
});

const VariavelRaw = Schema.Struct({
  resultados: Schema.Array(ResultadoRaw),
});

export const AgregadoPayload = Schema.Array(VariavelRaw);
export type AgregadoPayload = (typeof AgregadoPayload)["Type"];

const ValorMunicipio = Schema.Struct({
  codIbge: Schema.String,
  nome: Schema.String,
  uf: Schema.NullOr(Schema.String),
  valor: Schema.NullOr(Schema.Finite),
});
type ValorMunicipio = (typeof ValorMunicipio)["Type"];

const ufFromNome = (nome: string) =>
  pipe(
    nome,
    Str.match(/\(([A-Za-z]{2})\)\s*$/),
    Option.flatMap(Arr.get(1)),
    Option.flatMap(Option.fromNullishOr),
    Option.match({
      onNone: () => null,
      onSome: Str.toUpperCase,
    })
  );

const numeroOrNull = (value: string | null) => {
  const parsed = Number(value);
  return value === null || pipe(value, Str.trim) === "" || !Number.isFinite(parsed) ? null : parsed;
};

const valoresForImpl = (payload: AgregadoPayload, ano: number): readonly ValorMunicipio[] =>
  pipe(
    payload,
    Arr.flatMap((variavel) =>
      pipe(
        variavel.resultados,
        Arr.flatMap((resultado) => resultado.series)
      )
    ),
    Arr.map((entry) => ({
      codIbge: entry.localidade.id,
      nome: entry.localidade.nome,
      uf: ufFromNome(entry.localidade.nome),
      valor: numeroOrNull(entry.serie[String(ano)] ?? null),
    }))
  );

export const valoresFor: {
  (ano: number): (payload: AgregadoPayload) => readonly ValorMunicipio[];
  (payload: AgregadoPayload, ano: number): readonly ValorMunicipio[];
} = dual(2, valoresForImpl);

export const MunicipioEconomiaFlat = Schema.Struct({
  codIbge: Schema.String,
  nome: Schema.NullOr(Schema.String),
  uf: Schema.NullOr(Schema.String),
  ano: Schema.Int,
  populacao: Schema.NullOr(Schema.Finite),
  pibMilReais: Schema.NullOr(Schema.Finite),
  busca: Schema.String,
});
export type MunicipioEconomiaFlat = (typeof MunicipioEconomiaFlat)["Type"];

const nomeSemUf = (nome: string) => pipe(nome, Str.replace(/\s*\([A-Za-z]{2}\)\s*$/, ""));

const mergeEconomiaImpl = (
  ano: number,
  populacoes: readonly ValorMunicipio[],
  pibs: readonly ValorMunicipio[]
): readonly MunicipioEconomiaFlat[] => {
  const pibByCod = new Map(
    pipe(
      pibs,
      Arr.map((row) => [row.codIbge, row.valor] as const)
    )
  );
  return pipe(
    populacoes,
    Arr.map((row) => ({
      codIbge: row.codIbge,
      nome: nomeSemUf(row.nome),
      uf: row.uf,
      ano,
      populacao: row.valor,
      pibMilReais: pibByCod.get(row.codIbge) ?? null,
      busca: normalize(nomeSemUf(row.nome)),
    }))
  );
};

export const mergeEconomia: {
  (
    populacoes: readonly ValorMunicipio[],
    pibs: readonly ValorMunicipio[]
  ): (ano: number) => readonly MunicipioEconomiaFlat[];
  (
    ano: number,
    populacoes: readonly ValorMunicipio[],
    pibs: readonly ValorMunicipio[]
  ): readonly MunicipioEconomiaFlat[];
} = dual(3, mergeEconomiaImpl);
