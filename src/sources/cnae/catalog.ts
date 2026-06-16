import { Match, Schema } from "effect";
import { normalize } from "../../kernel/text/normalize";

export const subclassesUrl =
  "https://servicodados.ibge.gov.br/api/v2/cnae/subclasses";

export const levelDigits = {
  divisao: 2,
  grupo: 3,
  classe: 5,
  subclasse: 7,
} as const;

export const levels = [
  { nivel: "secao", digits: null },
  { nivel: "divisao", digits: levelDigits.divisao },
  { nivel: "grupo", digits: levelDigits.grupo },
  { nivel: "classe", digits: levelDigits.classe },
  { nivel: "subclasse", digits: levelDigits.subclasse },
] as const;
export type CnaeNivel = (typeof levels)[number]["nivel"];

export const secaoNivel = levels[0].nivel;

export const levelByDigits = new Map<number, CnaeNivel>(
  levels.flatMap((level) =>
    level.digits === null ? [] : [[level.digits, level.nivel] as const]
  )
);

const optionalTextList = Schema.optional(
  Schema.NullOr(Schema.Array(Schema.String))
);

const SecaoRaw = Schema.Struct({
  id: Schema.String,
  descricao: Schema.String,
});

const DivisaoRaw = Schema.Struct({
  id: Schema.String,
  descricao: Schema.String,
  secao: SecaoRaw,
});

const GrupoRaw = Schema.Struct({
  id: Schema.String,
  descricao: Schema.String,
  divisao: DivisaoRaw,
});

const ClasseRaw = Schema.Struct({
  id: Schema.String,
  descricao: Schema.String,
  grupo: GrupoRaw,
});

export const SubclasseRaw = Schema.Struct({
  id: Schema.String,
  descricao: Schema.String,
  atividades: optionalTextList,
  classe: ClasseRaw,
});
export type SubclasseRaw = (typeof SubclasseRaw)["Type"];

export const SubclassesPayload = Schema.Array(SubclasseRaw);

export const SubclasseFlat = Schema.Struct({
  id: Schema.String,
  descricao: Schema.String,
  classeId: Schema.String,
  classeDescricao: Schema.String,
  grupoId: Schema.String,
  grupoDescricao: Schema.String,
  divisaoId: Schema.String,
  divisaoDescricao: Schema.String,
  secaoId: Schema.String,
  secaoDescricao: Schema.String,
  busca: Schema.String,
});
export type SubclasseFlat = (typeof SubclasseFlat)["Type"];

export const CnaeErrorCode = Schema.Literals([
  "cnae.NOT_FOUND",
  "cnae.LEVEL_UNRECOGNIZED",
]);
export type CnaeErrorCode = (typeof CnaeErrorCode)["Type"];

export class CnaeError extends Schema.TaggedErrorClass<CnaeError>()(
  "CnaeError",
  {
    code: CnaeErrorCode,
    codigo: Schema.optional(Schema.String),
    normalizado: Schema.optional(Schema.String),
  }
) {
  override get message() {
    switch (this.code) {
      case "cnae.NOT_FOUND":
        return `Subclasse CNAE nao encontrada: ${this.codigo} (normalizado: ${this.normalizado}). A subclasse tem ${levelDigits.subclasse} digitos.`;
      case "cnae.LEVEL_UNRECOGNIZED":
        return `Codigo CNAE nao reconhecido: ${this.codigo}. Use uma letra (secao A-U) ou 2/3/5/7 digitos (divisao/grupo/classe/subclasse).`;
    }
  }
}

const cleanText = (value: string) => value.replace(/\s+/g, " ").trim();

const listText = (value: readonly string[] | null | undefined) =>
  Match.value(value).pipe(
    Match.when(Match.null, () => ""),
    Match.when(Match.undefined, () => ""),
    Match.orElse((items) => items.join(" "))
  );

const flattenSubclasse = (raw: SubclasseRaw) => {
  const classe = raw.classe;
  const grupo = classe.grupo;
  const divisao = grupo.divisao;
  const secao = divisao.secao;
  const descricao = cleanText(raw.descricao);
  const classeDescricao = cleanText(classe.descricao);
  const grupoDescricao = cleanText(grupo.descricao);
  const divisaoDescricao = cleanText(divisao.descricao);
  const secaoDescricao = cleanText(secao.descricao);
  return {
    id: raw.id,
    descricao,
    classeId: classe.id,
    classeDescricao,
    grupoId: grupo.id,
    grupoDescricao,
    divisaoId: divisao.id,
    divisaoDescricao,
    secaoId: secao.id,
    secaoDescricao,
    busca: normalize(
      [
        descricao,
        listText(raw.atividades),
        classeDescricao,
        grupoDescricao,
        divisaoDescricao,
        secaoDescricao,
      ].join(" ")
    ),
  } satisfies SubclasseFlat;
};

export const flatten = (payload: readonly SubclasseRaw[]) =>
  payload.map(flattenSubclasse);

export const subclassePassage = (row: SubclasseFlat) =>
  cleanText(
    [
      row.descricao,
      row.classeDescricao,
      row.grupoDescricao,
      row.divisaoDescricao,
      row.secaoDescricao,
    ].join(" ")
  );
