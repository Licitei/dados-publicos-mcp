import { Predicate, Schema } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import { normalize } from "../../kernel/text/normalize";

const siconfiBase = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt";

const pageSize = 5_000;

export const defaultAno = 2022;

export const uniaoEnte = "1";

export type Demonstrativo = "DCA" | "RREO" | "RGF";

const demonstrativoUrl = (path: string, query: string) =>
  dual<
    (ano: number, offset: number) => (idEnte: string) => string,
    (idEnte: string, ano: number, offset: number) => string
  >(
    3,
    (idEnte: string, ano: number, offset: number) =>
      `${siconfiBase}/${path}?an_exercicio=${ano}${query}&id_ente=${idEnte}&limit=${pageSize}&offset=${offset}`
  );

export const dcaUrl = demonstrativoUrl("dca", "");

export const rreoUrl = demonstrativoUrl("rreo", "&nr_periodo=6&co_tipo_demonstrativo=RREO");

export const rgfUrl = demonstrativoUrl(
  "rgf",
  "&in_periodicidade=Q&nr_periodo=3&co_tipo_demonstrativo=RGF&co_poder=E"
);

const FatoRaw = Schema.Struct({
  exercicio: Schema.optional(Schema.NullOr(Schema.Finite)),
  instituicao: Schema.optional(Schema.NullOr(Schema.String)),
  cod_ibge: Schema.optional(Schema.NullOr(Schema.Finite)),
  uf: Schema.optional(Schema.NullOr(Schema.String)),
  anexo: Schema.optional(Schema.NullOr(Schema.String)),
  rotulo: Schema.optional(Schema.NullOr(Schema.String)),
  coluna: Schema.optional(Schema.NullOr(Schema.String)),
  cod_conta: Schema.optional(Schema.NullOr(Schema.String)),
  conta: Schema.optional(Schema.NullOr(Schema.String)),
  valor: Schema.optional(Schema.NullOr(Schema.Finite)),
});

export const SiconfiPayload = Schema.Struct({
  items: Schema.optional(Schema.NullOr(Schema.Array(FatoRaw))),
  hasMore: Schema.optional(Schema.NullOr(Schema.Boolean)),
});
export type SiconfiPayload = (typeof SiconfiPayload)["Type"];

export const SiconfiFatoFlat = Schema.Struct({
  idEnte: Schema.String,
  exercicio: Schema.NullOr(Schema.Finite),
  demonstrativo: Schema.String,
  anexo: Schema.NullOr(Schema.String),
  rotulo: Schema.NullOr(Schema.String),
  coluna: Schema.NullOr(Schema.String),
  codConta: Schema.NullOr(Schema.String),
  conta: Schema.NullOr(Schema.String),
  valor: Schema.NullOr(Schema.Finite),
  instituicao: Schema.NullOr(Schema.String),
  uf: Schema.NullOr(Schema.String),
  busca: Schema.String,
});
export type SiconfiFatoFlat = (typeof SiconfiFatoFlat)["Type"];

type FatoItem = typeof FatoRaw.Type;

const mapFatosImpl = (
  items: readonly FatoItem[],
  idEnte: string,
  demonstrativo: Demonstrativo
): readonly SiconfiFatoFlat[] =>
  pipe(
    items,
    Arr.map((item) => ({
      idEnte,
      exercicio: item.exercicio ?? null,
      demonstrativo,
      anexo: item.anexo ?? null,
      rotulo: item.rotulo ?? null,
      coluna: item.coluna ?? null,
      codConta: item.cod_conta ?? null,
      conta: item.conta ?? null,
      valor: item.valor ?? null,
      instituicao: item.instituicao ?? null,
      uf: item.uf ?? null,
      busca: normalize(
        pipe(
          [item.conta, item.rotulo, item.anexo, demonstrativo],
          Arr.filter(Predicate.isNotNullish),
          Arr.join(" ")
        )
      ),
    }))
  );

export const mapFatos: {
  (
    idEnte: string,
    demonstrativo: Demonstrativo
  ): (items: readonly FatoItem[]) => readonly SiconfiFatoFlat[];
  (
    items: readonly FatoItem[],
    idEnte: string,
    demonstrativo: Demonstrativo
  ): readonly SiconfiFatoFlat[];
} = dual(3, mapFatosImpl);
