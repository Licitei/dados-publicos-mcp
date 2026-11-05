import { Clock, DateTime, Effect, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Str from "effect/String";
import { Http } from "../../kernel/http/client";
import { normalize } from "../../kernel/text/normalize";
import { IndiceRow, IndicesError, series, SgsPayload, SidraPayload } from "./catalog";

const month = Schema.String.pipe(Schema.check(Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])$/)));
const parseValue = (value: unknown) =>
  Schema.decodeUnknownEffect(
    Schema.String.pipe(Schema.check(Schema.isPattern(/^[+-]?\d+(?:[.,]\d+)?$/)))
  )(value).pipe(Effect.map((text) => Number(Str.replace(",", ".")(text))));
const decodeRow = Schema.decodeUnknownEffect(IndiceRow);
const sidraUrl = "https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/2266/p/last120";

export const loadIndices = Effect.gen(function* () {
  const http = yield* Http;
  const millis = yield* Clock.currentTimeMillis;
  const year = DateTime.getPartUtc(DateTime.makeUnsafe(millis), "year");
  const start = `01/01/${year - 5}`;
  const end = `31/12/${year}`;
  const sgs = yield* Effect.forEach(
    series,
    ({ codigo, serie }) =>
      Effect.gen(function* () {
        const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados?formato=json&dataInicial=${start}&dataFinal=${end}`;
        const rows = yield* http
          .json(url, SgsPayload)
          .pipe(
            Effect.mapError((cause) =>
              IndicesError.make({ code: "indices.DOWNLOAD", cause: cause.message })
            )
          );
        return yield* Effect.forEach(rows, (row) =>
          Effect.gen(function* () {
            const parts = Str.split(row.data, "/");
            const mes = yield* Schema.decodeEffect(month)(
              `${Arr.get(parts, 2).pipe(Option.getOrElse(() => ""))}-${Arr.get(parts, 1).pipe(Option.getOrElse(() => ""))}`
            );
            const valor = yield* parseValue(row.valor);
            return yield* decodeRow({
              id: `sgs-${codigo}-${mes}`,
              serie,
              codigo: String(codigo),
              mes,
              valor,
              tipo: "taxa_mensal",
              fonte: url,
              busca: normalize(serie),
            });
          })
        );
      }),
    { concurrency: 2 }
  );
  const sidra = yield* http
    .json(sidraUrl, SidraPayload)
    .pipe(
      Effect.mapError((cause) =>
        IndicesError.make({ code: "indices.DOWNLOAD", cause: cause.message })
      )
    );
  const numberIndex = yield* Effect.forEach(Arr.drop(sidra, 1), (row) =>
    Effect.gen(function* () {
      const period = yield* Schema.decodeEffect(
        Schema.String.pipe(Schema.check(Schema.isPattern(/^\d{4}(0[1-9]|1[0-2])$/)))
      )(row.D3C);
      const mes = `${Str.slice(0, 4)(period)}-${Str.slice(4, 6)(period)}`;
      const valor = yield* parseValue(row.V);
      return yield* decodeRow({
        id: `sidra-1737-2266-${mes}`,
        serie: "IPCA número-índice",
        codigo: "1737/2266",
        mes,
        valor,
        tipo: "numero_indice",
        fonte: sidraUrl,
        busca: "ipca numero indice",
      });
    })
  );
  return [...Arr.flatten(sgs), ...numberIndex];
}).pipe(
  Effect.mapError((cause) =>
    Schema.is(IndicesError)(cause)
      ? cause
      : IndicesError.make({ code: "indices.PARSE", cause: String(cause) })
  )
);
