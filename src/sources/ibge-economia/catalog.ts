import { Schema } from "effect";
import { normalize } from "../../kernel/text/normalize";

export const agregadosBase =
  "https://servicodados.ibge.gov.br/api/v3/agregados";

export const populacaoAgregado = 6579;
export const populacaoVariavel = 9324;
export const pibAgregado = 5938;
export const pibVariavel = 37;

export const defaultAno = 2021;

export const serieUrl = (agregado: number, ano: number, variavel: number) =>
  `${agregadosBase}/${agregado}/periodos/${ano}/variaveis/${variavel}?localidades=N6`;

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

export type ValorMunicipio = {
  readonly codIbge: string;
  readonly nome: string;
  readonly uf: string | null;
  readonly valor: number | null;
};

const ufFromNome = (nome: string) => {
  const match = nome.match(/\(([A-Za-z]{2})\)\s*$/);
  return match ? match[1].toUpperCase() : null;
};

const numeroOrNull = (value: string | null) => {
  const parsed = Number(value);
  return value === null || value.trim() === "" || !Number.isFinite(parsed)
    ? null
    : parsed;
};

export const valoresFor = (
  payload: AgregadoPayload,
  ano: number
): readonly ValorMunicipio[] => {
  const series = payload.flatMap((variavel) =>
    variavel.resultados.flatMap((resultado) => resultado.series)
  );
  return series.map((entry) => ({
    codIbge: entry.localidade.id,
    nome: entry.localidade.nome,
    uf: ufFromNome(entry.localidade.nome),
    valor: numeroOrNull(entry.serie[String(ano)] ?? null),
  }));
};

export const MunicipioEconomiaFlat = Schema.Struct({
  codIbge: Schema.String,
  nome: Schema.NullOr(Schema.String),
  uf: Schema.NullOr(Schema.String),
  ano: Schema.Number,
  populacao: Schema.NullOr(Schema.Number),
  pibMilReais: Schema.NullOr(Schema.Number),
  busca: Schema.String,
});
export type MunicipioEconomiaFlat = (typeof MunicipioEconomiaFlat)["Type"];

const nomeSemUf = (nome: string) => nome.replace(/\s*\([A-Za-z]{2}\)\s*$/, "");

export const mergeEconomia = (
  ano: number,
  populacoes: readonly ValorMunicipio[],
  pibs: readonly ValorMunicipio[]
): readonly MunicipioEconomiaFlat[] => {
  const pibByCod = new Map(pibs.map((row) => [row.codIbge, row.valor]));
  return populacoes.map((row) => ({
    codIbge: row.codIbge,
    nome: nomeSemUf(row.nome),
    uf: row.uf,
    ano,
    populacao: row.valor,
    pibMilReais: pibByCod.get(row.codIbge) ?? null,
    busca: normalize(nomeSemUf(row.nome)),
  }));
};
