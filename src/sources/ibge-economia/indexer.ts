import { Effect } from "effect";
import { Db } from "../../kernel/db/client";
import { municipioEconomia } from "../../kernel/db/schemas/municipio-economia";
import { getJson } from "../../kernel/http/client";
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

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

const chunks = <A>(items: readonly A[]) =>
  range(Math.ceil(items.length / chunkSize)).map((position) =>
    items.slice(position * chunkSize, position * chunkSize + chunkSize)
  );

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
  getJson(serieUrl(agregado, ano, variavel), AgregadoPayload).pipe(
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
