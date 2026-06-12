import { Effect, Match, Schema } from "effect";
import { normalize } from "../../kernel/text/normalize";

export const codigoIbgeLength = 7;

export const municipiosUrl =
  "https://servicodados.ibge.gov.br/api/v1/localidades/municipios";

const RegiaoRaw = Schema.Struct({
  id: Schema.Number,
  sigla: Schema.String,
  nome: Schema.String,
});

const UfRaw = Schema.Struct({
  id: Schema.Number,
  sigla: Schema.String,
  nome: Schema.String,
  regiao: RegiaoRaw,
});

const MicrorregiaoRaw = Schema.Struct({
  id: Schema.Number,
  nome: Schema.String,
  mesorregiao: Schema.Struct({
    id: Schema.Number,
    nome: Schema.String,
    UF: UfRaw,
  }),
});

const RegiaoImediataRaw = Schema.Struct({
  id: Schema.Number,
  nome: Schema.String,
  "regiao-intermediaria": Schema.Struct({
    id: Schema.Number,
    nome: Schema.String,
    UF: UfRaw,
  }),
});

export const MunicipioRaw = Schema.Struct({
  id: Schema.Number,
  nome: Schema.String,
  microrregiao: Schema.NullOr(MicrorregiaoRaw),
  "regiao-imediata": Schema.optional(RegiaoImediataRaw),
});
export type MunicipioRaw = (typeof MunicipioRaw)["Type"];

export const MunicipiosPayload = Schema.Array(MunicipioRaw);

export const MunicipioFlat = Schema.Struct({
  id: Schema.String,
  nome: Schema.String,
  nomeNormalizado: Schema.String,
  ufSigla: Schema.String,
  ufId: Schema.Number,
  ufNome: Schema.String,
  mesorregiaoId: Schema.NullOr(Schema.Number),
  mesorregiaoNome: Schema.NullOr(Schema.String),
  regiaoSigla: Schema.String,
});
export type MunicipioFlat = (typeof MunicipioFlat)["Type"];

export const ufs = [
  { sigla: "RO", id: 11, nome: "Rondonia" },
  { sigla: "AC", id: 12, nome: "Acre" },
  { sigla: "AM", id: 13, nome: "Amazonas" },
  { sigla: "RR", id: 14, nome: "Roraima" },
  { sigla: "PA", id: 15, nome: "Para" },
  { sigla: "AP", id: 16, nome: "Amapa" },
  { sigla: "TO", id: 17, nome: "Tocantins" },
  { sigla: "MA", id: 21, nome: "Maranhao" },
  { sigla: "PI", id: 22, nome: "Piaui" },
  { sigla: "CE", id: 23, nome: "Ceara" },
  { sigla: "RN", id: 24, nome: "Rio Grande do Norte" },
  { sigla: "PB", id: 25, nome: "Paraiba" },
  { sigla: "PE", id: 26, nome: "Pernambuco" },
  { sigla: "AL", id: 27, nome: "Alagoas" },
  { sigla: "SE", id: 28, nome: "Sergipe" },
  { sigla: "BA", id: 29, nome: "Bahia" },
  { sigla: "MG", id: 31, nome: "Minas Gerais" },
  { sigla: "ES", id: 32, nome: "Espirito Santo" },
  { sigla: "RJ", id: 33, nome: "Rio de Janeiro" },
  { sigla: "SP", id: 35, nome: "Sao Paulo" },
  { sigla: "PR", id: 41, nome: "Parana" },
  { sigla: "SC", id: 42, nome: "Santa Catarina" },
  { sigla: "RS", id: 43, nome: "Rio Grande do Sul" },
  { sigla: "MS", id: 50, nome: "Mato Grosso do Sul" },
  { sigla: "MT", id: 51, nome: "Mato Grosso" },
  { sigla: "GO", id: 52, nome: "Goias" },
  { sigla: "DF", id: 53, nome: "Distrito Federal" },
];
export type Uf = (typeof ufs)[number];

export const ufBySigla = new Map(ufs.map((uf) => [uf.sigla, uf] as const));

export const IbgeErrorCode = Schema.Literals([
  "ibge.MUNICIPIO_NOT_FOUND",
  "ibge.CODE_NOT_FOUND",
  "ibge.UF_INVALID",
  "ibge.PARSE",
]);
export type IbgeErrorCode = (typeof IbgeErrorCode)["Type"];

export class IbgeError extends Schema.TaggedErrorClass<IbgeError>()("IbgeError", {
  code: IbgeErrorCode,
  termo: Schema.optional(Schema.String),
  uf: Schema.optional(Schema.String),
  codigo: Schema.optional(Schema.String),
  normalizado: Schema.optional(Schema.String),
  municipio: Schema.optional(Schema.String),
}) {
  override get message() {
    switch (this.code) {
      case "ibge.MUNICIPIO_NOT_FOUND":
        return `Municipio nao encontrado: ${this.termo}${this.uf ? `/${this.uf}` : ""}`;
      case "ibge.CODE_NOT_FOUND":
        return `Codigo IBGE nao encontrado: ${this.codigo} (normalizado: ${this.normalizado}). O codigo de municipio tem ${codigoIbgeLength} digitos.`;
      case "ibge.UF_INVALID":
        return `UF invalida: ${this.uf}. Use uma sigla de 2 letras (ex SP, RJ, MG).`;
      case "ibge.PARSE":
        return `Falha ao interpretar o payload de municipios do IBGE: municipio ${this.municipio} sem microrregiao nem regiao-imediata.`;
    }
  }
}

const formatCodigoIbge = (id: number) =>
  String(id).padStart(codigoIbgeLength, "0");

const flattenMunicipio = (raw: MunicipioRaw) =>
  Match.value(raw.microrregiao).pipe(
    Match.when(Match.null, () =>
      Match.value(raw["regiao-imediata"]).pipe(
        Match.when(Match.undefined, () =>
          Effect.fail(
            new IbgeError({
              code: "ibge.PARSE",
              municipio: `${raw.id} (${raw.nome})`,
            })
          )
        ),
        Match.orElse((fallback) => {
          const uf = fallback["regiao-intermediaria"].UF;
          return Effect.succeed({
            id: formatCodigoIbge(raw.id),
            nome: raw.nome,
            nomeNormalizado: normalize(raw.nome),
            ufSigla: uf.sigla,
            ufId: uf.id,
            ufNome: uf.nome,
            mesorregiaoId: null,
            mesorregiaoNome: null,
            regiaoSigla: uf.regiao.sigla,
          } satisfies MunicipioFlat);
        })
      )
    ),
    Match.orElse((micro) => {
      const uf = micro.mesorregiao.UF;
      return Effect.succeed({
        id: formatCodigoIbge(raw.id),
        nome: raw.nome,
        nomeNormalizado: normalize(raw.nome),
        ufSigla: uf.sigla,
        ufId: uf.id,
        ufNome: uf.nome,
        mesorregiaoId: micro.mesorregiao.id,
        mesorregiaoNome: micro.mesorregiao.nome,
        regiaoSigla: uf.regiao.sigla,
      } satisfies MunicipioFlat);
    })
  );

export const flatten = (payload: readonly MunicipioRaw[]) =>
  Effect.forEach(payload, flattenMunicipio, { concurrency: 2 });
