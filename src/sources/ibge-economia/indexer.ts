import { Effect } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import { Db } from "../../kernel/db/client";
import { municipioEconomia } from "../../kernel/db/schemas/municipio-economia";
import { Http } from "../../kernel/http/client";
import {
  AgregadoPayload,
  mergeEconomia,
  pibAgregado,
  pibVariavel,
  populacaoAgregado,
  populacaoVariavel,
  serieUrl,
  valoresFor,
  type MunicipioEconomiaFlat,
} from "./catalog";

const chunkSize = 2_000;

const chunks = <A>(items: readonly A[]) =>
  pipe(items, Arr.chunksOf(chunkSize));

const insertRows = (rows: readonly MunicipioEconomiaFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) =>
      Effect.flatMap(Db, (db) =>
        db.insert(municipioEconomia).values([...batch])
      ),
    { concurrency: 1, discard: true }
  );

const fetchValores = (agregado: number, ano: number, variavel: number) =>
  Effect.flatMap(Http, (http) =>
    http.json(serieUrl(agregado, ano, variavel), AgregadoPayload)
  ).pipe(
    Effect.map((payload) => valoresFor(payload, ano))
  );

export const fetchAno = (ano: number) =>
  Effect.all({
    populacoes: fetchValores(populacaoAgregado, ano, populacaoVariavel),
    pibs: fetchValores(pibAgregado, ano, pibVariavel),
  }).pipe(
    Effect.map(({ populacoes, pibs }) => mergeEconomia(ano, populacoes, pibs))
  );

export const indexAno = (ano: number) =>
  fetchAno(ano).pipe(
    Effect.flatMap((rows) => insertRows(rows).pipe(Effect.as(rows.length)))
  );
