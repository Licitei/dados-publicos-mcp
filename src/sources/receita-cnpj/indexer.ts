import { Clock, Effect, Match } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
import { Db } from "../../kernel/db/client";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { dominio } from "../../kernel/db/schemas/dominio";
import { empresa } from "../../kernel/db/schemas/empresa";
import { estabelecimento } from "../../kernel/db/schemas/estabelecimento";
import { simples } from "../../kernel/db/schemas/simples";
import { socio } from "../../kernel/db/schemas/socio";
import { Http, HttpError } from "../../kernel/http/client";
import { unzipEntries } from "../../kernel/zip/archive";
import {
  csvOptions,
  defaultParts,
  DOMINIO_COLUNAS,
  DOMINIO_FILES,
  EMPRESAS_COLUNAS,
  ESTABELECIMENTOS_COLUNAS,
  mapDominios,
  mapEmpresas,
  mapEstabelecimentos,
  mapSimplesRows,
  mapSocios,
  missingStatus,
  monthLookback,
  partFiles,
  ReceitaCnpjError,
  rfbAuthHeader,
  SENTINEL_FILE,
  SIMPLES_COLUNAS,
  SIMPLES_FILE,
  SOCIOS_COLUNAS,
  webdavFileUrl,
  yyyymm,
  type DominioTabela,
  type EmpresaFlat,
  type EstabelecimentoFlat,
  type SimplesFlat,
  type SocioFlat,
} from "./catalog";

const chunkSize = 2_000;

const concat = (a: Uint8Array, b: Uint8Array) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

const withHeader = (cols: readonly string[], bytes: Uint8Array) =>
  concat(new TextEncoder().encode(`${pipe(cols, Arr.join(";"))}\r\n`), bytes);

const insertEmpresas = (rows: readonly EmpresaFlat[]) =>
  Effect.forEach(
    pipe(rows, Arr.chunksOf(chunkSize)),
    (batch) => Effect.flatMap(Db, (db) => db.insert(empresa).values([...batch])),
    { concurrency: 1, discard: true }
  );

const insertEstabelecimentos = (rows: readonly EstabelecimentoFlat[]) =>
  Effect.forEach(
    pipe(rows, Arr.chunksOf(chunkSize)),
    (batch) =>
      Effect.flatMap(Db, (db) => db.insert(estabelecimento).values([...batch])),
    { concurrency: 1, discard: true }
  );

const insertSocios = (rows: readonly SocioFlat[]) =>
  Effect.forEach(
    pipe(rows, Arr.chunksOf(chunkSize)),
    (batch) => Effect.flatMap(Db, (db) => db.insert(socio).values([...batch])),
    { concurrency: 1, discard: true }
  );

const insertSimples = (rows: readonly SimplesFlat[]) =>
  Effect.forEach(
    pipe(rows, Arr.chunksOf(chunkSize)),
    (batch) => Effect.flatMap(Db, (db) => db.insert(simples).values([...batch])),
    { concurrency: 1, discard: true }
  );

type DominioFlat = ReturnType<typeof mapDominios>[number];

const insertDominios = (rows: readonly DominioFlat[]) =>
  Effect.forEach(
    pipe(rows, Arr.chunksOf(chunkSize)),
    (batch) => Effect.flatMap(Db, (db) => db.insert(dominio).values([...batch])),
    { concurrency: 1, discard: true }
  );

const downloadZip = (url: string) =>
  Effect.flatMap(Http, (http) =>
    http.bytes(url, {
      headers: { authorization: rfbAuthHeader, accept: "application/zip" },
    })
  );

const tolerateMissing = <R>(
  effect: Effect.Effect<Uint8Array, HttpError, R>
) =>
  effect.pipe(
    Effect.catchTag("HttpError", (error) =>
      Match.value(error).pipe(
        Match.when({ code: "http.STATUS" }, (status) =>
          Match.value(missingStatus.has(status.status ?? -1)).pipe(
            Match.when(true, () =>
              Effect.fail(
                ReceitaCnpjError.make({ code: "receita.SNAPSHOT_MISSING" })
              )
            ),
            Match.orElse(() => Effect.fail(error))
          )
        ),
        Match.orElse(() => Effect.fail(error))
      )
    )
  );

const probeMonth = (mes: string) =>
  tolerateMissing(downloadZip(webdavFileUrl(mes, SENTINEL_FILE))).pipe(
    Effect.as(mes)
  );

const resolveMonth = (millis: number) =>
  Effect.firstSuccessOf(
    pipe(
      Arr.range(0, monthLookback - 1),
      Arr.map((back) => probeMonth(yyyymm(millis, back)))
    )
  );

const acceptCsv = (name: string) => !pipe(name, Str.endsWith("/"));

const parseEntries = (cols: readonly string[], bytes: Uint8Array) =>
  parseCsvRecords(withHeader(cols, bytes), csvOptions);

const downloadFile = (mes: string, file: string) =>
  downloadZip(webdavFileUrl(mes, file)).pipe(
    Effect.flatMap((bytes) => unzipEntries(bytes, acceptCsv)),
    Effect.catchCause(() => Effect.succeed([]))
  );

const indexEmpresas = (mes: string, parts: readonly number[]) =>
  Effect.forEach(
    pipe(
      partFiles("Empresas"),
      Arr.filter((_, i) => parts.includes(i))
    ),
    (file) =>
      Effect.map(downloadFile(mes, file), (entries) =>
        pipe(
          entries,
          Arr.flatMap((entry) =>
            mapEmpresas(parseEntries(EMPRESAS_COLUNAS, entry.data))
          )
        )
      ),
    { concurrency: 1 }
  ).pipe(
    Effect.map((batches) => Arr.flatten(batches)),
    Effect.tap((rows) => insertEmpresas(rows)),
    Effect.map((rows) =>
      pipe(
        rows,
        Arr.reduce(new Map<string, string>(), (acc, row) =>
          acc.set(row.cnpjBasico, row.porte)
        )
      )
    )
  );

const indexEstabelecimentos = (
  mes: string,
  parts: readonly number[],
  porteByBasico: ReadonlyMap<string, string>
) =>
  Effect.forEach(
    pipe(
      partFiles("Estabelecimentos"),
      Arr.filter((_, i) => parts.includes(i))
    ),
    (file) =>
      Effect.flatMap(downloadFile(mes, file), (entries) =>
        insertEstabelecimentos(
          pipe(
            entries,
            Arr.flatMap((entry) =>
              mapEstabelecimentos(
                parseEntries(ESTABELECIMENTOS_COLUNAS, entry.data)
              )
            ),
            Arr.map((row) => ({
              ...row,
              porte: porteByBasico.get(row.cnpjBasico) ?? null,
            }))
          )
        )
      ),
    { concurrency: 1, discard: true }
  );

const indexSocios = (mes: string, parts: readonly number[]) =>
  Effect.forEach(
    pipe(
      partFiles("Socios"),
      Arr.filter((_, i) => parts.includes(i))
    ),
    (file) =>
      Effect.flatMap(downloadFile(mes, file), (entries) =>
        insertSocios(
          pipe(
            entries,
            Arr.flatMap((entry) =>
              mapSocios(parseEntries(SOCIOS_COLUNAS, entry.data))
            )
          )
        )
      ),
    { concurrency: 1, discard: true }
  );

const indexSimples = (mes: string) =>
  Effect.flatMap(downloadFile(mes, SIMPLES_FILE), (entries) =>
    insertSimples(
      pipe(
        entries,
        Arr.flatMap((entry) =>
          mapSimplesRows(parseEntries(SIMPLES_COLUNAS, entry.data))
        )
      )
    )
  );

const indexDominio = (mes: string, tabela: DominioTabela, file: string) =>
  Effect.flatMap(downloadFile(mes, file), (entries) =>
    insertDominios(
      pipe(
        entries,
        Arr.flatMap((entry) =>
          mapDominios(parseEntries(DOMINIO_COLUNAS, entry.data), tabela)
        )
      )
    )
  );

const indexDominios = (mes: string) =>
  Effect.forEach(
    DOMINIO_FILES,
    (spec) => indexDominio(mes, spec.tabela, spec.file),
    { concurrency: 2, discard: true }
  );

export const indexReceitaCnpj = (parts: readonly number[] = defaultParts) =>
  Effect.flatMap(Clock.currentTimeMillis, (millis) =>
    Effect.flatMap(resolveMonth(millis), (mes) =>
      Effect.gen(function* () {
        yield* indexDominios(mes);
        const porteByBasico = yield* indexEmpresas(mes, parts);
        yield* indexEstabelecimentos(mes, parts, porteByBasico);
        yield* indexSocios(mes, parts);
        yield* indexSimples(mes);
      })
    )
  );
