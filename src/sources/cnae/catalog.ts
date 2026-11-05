import { Match, Schema } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
import { normalize } from "../../kernel/text/normalize";

export const subclassesUrl = "https://servicodados.ibge.gov.br/api/v2/cnae/subclasses";

const optionalTextList = Schema.optional(Schema.NullOr(Schema.Array(Schema.String)));

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

const SubclasseRaw = Schema.Struct({
  id: Schema.String,
  descricao: Schema.String,
  atividades: optionalTextList,
  classe: ClasseRaw,
});
type SubclasseRaw = (typeof SubclasseRaw)["Type"];

export const SubclassesPayload = Schema.Array(SubclasseRaw);

const SubclasseFlat = Schema.Struct({
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
type SubclasseFlat = (typeof SubclasseFlat)["Type"];

const cleanText = (value: string) => pipe(value, Str.replace(/\s+/g, " "), Str.trim);

const listText = (value: readonly string[] | null | undefined) =>
  Match.value(value).pipe(
    Match.when(Match.null, () => ""),
    Match.when(Match.undefined, () => ""),
    Match.orElse((items) => pipe(items, Arr.join(" ")))
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
      pipe(
        [
          descricao,
          listText(raw.atividades),
          classeDescricao,
          grupoDescricao,
          divisaoDescricao,
          secaoDescricao,
        ],
        Arr.join(" ")
      )
    ),
  } satisfies SubclasseFlat;
};

export const flatten = (payload: readonly SubclasseRaw[]) =>
  pipe(payload, Arr.map(flattenSubclasse));
