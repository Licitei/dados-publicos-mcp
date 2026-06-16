import { Schema } from "effect";
import { normalize } from "../../kernel/text/normalize";

export const siconfiBase =
  "https://apidatalake.tesouro.gov.br/ords/siconfi/tt";

export const pageSize = 5_000;

export const defaultAno = 2022;

export const uniaoEnte = "1";

export type Demonstrativo = "DCA" | "RREO" | "RGF";

export const dcaUrl = (idEnte: string, ano: number, offset: number) =>
  `${siconfiBase}/dca?an_exercicio=${ano}&id_ente=${idEnte}&limit=${pageSize}&offset=${offset}`;

export const rreoUrl = (idEnte: string, ano: number, offset: number) =>
  `${siconfiBase}/rreo?an_exercicio=${ano}&nr_periodo=6&co_tipo_demonstrativo=RREO&id_ente=${idEnte}&limit=${pageSize}&offset=${offset}`;

export const rgfUrl = (idEnte: string, ano: number, offset: number) =>
  `${siconfiBase}/rgf?an_exercicio=${ano}&in_periodicidade=Q&nr_periodo=3&co_tipo_demonstrativo=RGF&co_poder=E&id_ente=${idEnte}&limit=${pageSize}&offset=${offset}`;

const FatoRaw = Schema.Struct({
  exercicio: Schema.optional(Schema.NullOr(Schema.Number)),
  instituicao: Schema.optional(Schema.NullOr(Schema.String)),
  cod_ibge: Schema.optional(Schema.NullOr(Schema.Number)),
  uf: Schema.optional(Schema.NullOr(Schema.String)),
  anexo: Schema.optional(Schema.NullOr(Schema.String)),
  rotulo: Schema.optional(Schema.NullOr(Schema.String)),
  coluna: Schema.optional(Schema.NullOr(Schema.String)),
  cod_conta: Schema.optional(Schema.NullOr(Schema.String)),
  conta: Schema.optional(Schema.NullOr(Schema.String)),
  valor: Schema.optional(Schema.NullOr(Schema.Number)),
});

export const SiconfiPayload = Schema.Struct({
  items: Schema.optional(Schema.NullOr(Schema.Array(FatoRaw))),
  hasMore: Schema.optional(Schema.NullOr(Schema.Boolean)),
});
export type SiconfiPayload = (typeof SiconfiPayload)["Type"];

export const SiconfiFatoFlat = Schema.Struct({
  idEnte: Schema.String,
  exercicio: Schema.NullOr(Schema.Number),
  demonstrativo: Schema.String,
  anexo: Schema.NullOr(Schema.String),
  rotulo: Schema.NullOr(Schema.String),
  coluna: Schema.NullOr(Schema.String),
  codConta: Schema.NullOr(Schema.String),
  conta: Schema.NullOr(Schema.String),
  valor: Schema.NullOr(Schema.Number),
  instituicao: Schema.NullOr(Schema.String),
  uf: Schema.NullOr(Schema.String),
  busca: Schema.String,
});
export type SiconfiFatoFlat = (typeof SiconfiFatoFlat)["Type"];

export const mapFatos = (
  idEnte: string,
  demonstrativo: Demonstrativo,
  items: readonly (typeof FatoRaw.Type)[]
): readonly SiconfiFatoFlat[] =>
  items.map((item) => ({
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
      [item.conta, item.rotulo, item.anexo, demonstrativo]
        .filter((part) => part !== null && part !== undefined)
        .join(" ")
    ),
  }));
