import { Effect, Stream } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import { Http } from "../../kernel/http/client";
import { offsetPage, type OffsetState } from "../../kernel/http/paging";
import { dcaUrl, mapFatos, rgfUrl, rreoUrl, SiconfiPayload, type Demonstrativo } from "./catalog";

const urlFor = {
  DCA: dcaUrl,
  RREO: rreoUrl,
  RGF: rgfUrl,
} satisfies Record<Demonstrativo, (idEnte: string, ano: number, offset: number) => string>;

const fetchPage =
  (idEnte: string, ano: number, demonstrativo: Demonstrativo) => (state: OffsetState) =>
    Effect.flatMap(Http, (http) =>
      http.json(urlFor[demonstrativo](idEnte, ano, state.offset), SiconfiPayload, {
        headers: { accept: "application/json" },
      })
    ).pipe(Effect.map((payload) => offsetPage(state, payload.items ?? [], payload.hasMore)));

const fetchDemonstrativo = (idEnte: string, ano: number, demonstrativo: Demonstrativo) =>
  Stream.paginate({ offset: 0, page: 1 }, fetchPage(idEnte, ano, demonstrativo)).pipe(
    Stream.runCollect,
    Effect.map((chunk) => Array.from(chunk)),
    Effect.map(mapFatos(idEnte, demonstrativo))
  );

const indexEnteImpl = (idEnte: string, ano: number) =>
  Effect.all(
    {
      dca: fetchDemonstrativo(idEnte, ano, "DCA"),
      rreo: fetchDemonstrativo(idEnte, ano, "RREO"),
      rgf: fetchDemonstrativo(idEnte, ano, "RGF"),
    },
    { concurrency: 2 }
  ).pipe(Effect.map(({ dca, rreo, rgf }) => pipe(dca, Arr.appendAll(rreo), Arr.appendAll(rgf))));

export const indexEnte: {
  (ano: number): (idEnte: string) => ReturnType<typeof indexEnteImpl>;
  (idEnte: string, ano: number): ReturnType<typeof indexEnteImpl>;
} = dual(2, indexEnteImpl);
