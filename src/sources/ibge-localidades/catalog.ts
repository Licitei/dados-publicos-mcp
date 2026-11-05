import { Effect, Match, Schema } from "effect";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
import { normalize } from "../../kernel/text/normalize";

const codigoIbgeLength = 7;

export const municipiosUrl = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios";

const RegiaoRaw = Schema.Struct({
  id: Schema.Finite,
  sigla: Schema.String,
  nome: Schema.String,
});

const UfRaw = Schema.Struct({
  id: Schema.Finite,
  sigla: Schema.String,
  nome: Schema.String,
  regiao: RegiaoRaw,
});

const MicrorregiaoRaw = Schema.Struct({
  id: Schema.Finite,
  nome: Schema.String,
  mesorregiao: Schema.Struct({
    id: Schema.Finite,
    nome: Schema.String,
    UF: UfRaw,
  }),
});

const RegiaoImediataRaw = Schema.Struct({
  id: Schema.Finite,
  nome: Schema.String,
  "regiao-intermediaria": Schema.Struct({
    id: Schema.Finite,
    nome: Schema.String,
    UF: UfRaw,
  }),
});

const MunicipioRaw = Schema.Struct({
  id: Schema.Finite,
  nome: Schema.String,
  microrregiao: Schema.NullOr(MicrorregiaoRaw),
  "regiao-imediata": Schema.optional(RegiaoImediataRaw),
});
type MunicipioRaw = (typeof MunicipioRaw)["Type"];

export const MunicipiosPayload = Schema.Array(MunicipioRaw);

const MunicipioFlat = Schema.Struct({
  id: Schema.String,
  nome: Schema.String,
  nomeNormalizado: Schema.String,
  ufSigla: Schema.String,
  ufId: Schema.Finite,
  ufNome: Schema.String,
  mesorregiaoId: Schema.NullOr(Schema.Finite),
  mesorregiaoNome: Schema.NullOr(Schema.String),
  regiaoSigla: Schema.String,
});
type MunicipioFlat = (typeof MunicipioFlat)["Type"];

const IbgeErrorCode = Schema.Literals([
  "ibge.MUNICIPIO_NOT_FOUND",
  "ibge.CODE_NOT_FOUND",
  "ibge.UF_INVALID",
  "ibge.PARSE",
]);
type IbgeErrorCode = (typeof IbgeErrorCode)["Type"];

class IbgeError extends Schema.TaggedError<IbgeError, { readonly brand: unique symbol }>()(
  "IbgeError",
  {
    code: IbgeErrorCode,
    termo: Schema.optional(Schema.String),
    uf: Schema.optional(Schema.String),
    codigo: Schema.optional(Schema.String),
    normalizado: Schema.optional(Schema.String),
    municipio: Schema.optional(Schema.String),
  }
) {
  override get message() {
    switch (this.code) {
      case "ibge.MUNICIPIO_NOT_FOUND":
        return `Municipio nao encontrado: ${this.termo}${this.uf === undefined || this.uf === "" ? "" : `/${this.uf}`}`;
      case "ibge.CODE_NOT_FOUND":
        return `Codigo IBGE nao encontrado: ${this.codigo} (normalizado: ${this.normalizado}). O codigo de municipio tem ${codigoIbgeLength} digitos.`;
      case "ibge.UF_INVALID":
        return `UF invalida: ${this.uf}. Use uma sigla de 2 letras (ex SP, RJ, MG).`;
      case "ibge.PARSE":
        return `Falha ao interpretar o payload de municipios do IBGE: municipio ${this.municipio} sem microrregiao nem regiao-imediata.`;
    }
  }
}

const formatCodigoIbge = (id: number) => pipe(String(id), Str.padStart(codigoIbgeLength, "0"));

type UfRaw = NonNullable<MunicipioRaw["microrregiao"]>["mesorregiao"]["UF"];

const municipioFlat = (
  raw: MunicipioRaw,
  uf: UfRaw,
  mesorregiao: { readonly id: number; readonly nome: string } | null
) =>
  Effect.succeed({
    id: formatCodigoIbge(raw.id),
    nome: raw.nome,
    nomeNormalizado: normalize(raw.nome),
    ufSigla: uf.sigla,
    ufId: uf.id,
    ufNome: uf.nome,
    mesorregiaoId: mesorregiao?.id ?? null,
    mesorregiaoNome: mesorregiao?.nome ?? null,
    regiaoSigla: uf.regiao.sigla,
  } satisfies MunicipioFlat);

const flattenMunicipio = (raw: MunicipioRaw) =>
  Match.value(raw.microrregiao).pipe(
    Match.when(Match.null, () =>
      Match.value(raw["regiao-imediata"]).pipe(
        Match.when(Match.undefined, () =>
          Effect.fail(
            IbgeError.make({
              code: "ibge.PARSE",
              municipio: `${raw.id} (${raw.nome})`,
            })
          )
        ),
        Match.orElse((fallback) => municipioFlat(raw, fallback["regiao-intermediaria"].UF, null))
      )
    ),
    Match.orElse((micro) => municipioFlat(raw, micro.mesorregiao.UF, micro.mesorregiao))
  );

export const flatten = (payload: readonly MunicipioRaw[]) =>
  Effect.forEach(payload, flattenMunicipio, { concurrency: 2 });
