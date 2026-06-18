import { Clock, Context, Effect, Layer, Match } from "effect";
import { sql } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { capagEstado } from "../../kernel/db/schemas/capag-estado";
import { capagMunicipio } from "../../kernel/db/schemas/capag-municipio";
import { siconfiEnte } from "../../kernel/db/schemas/siconfi-ente";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { CapagError, codigoIbgeLength } from "./catalog";
import { fetchSnapshot } from "./indexer";

type EstadoRow = typeof capagEstado.$inferInsert;
type MunicipioRow = typeof capagMunicipio.$inferInsert;
type EnteRow = typeof siconfiEnte.$inferInsert;

const clamp = (value: number | undefined, fallback: number, max: number) =>
  value === undefined || value < 1
    ? fallback
    : Math.min(Math.trunc(value), max);

const insertChunkSize = 2_000;

const chunks = <A>(items: readonly A[]) =>
  Array.from(
    { length: Math.ceil(items.length / insertChunkSize) },
    (_, position) =>
      items.slice(position * insertChunkSize, (position + 1) * insertChunkSize)
  );

const padIbge = (codigo: string) =>
  onlyDigits(codigo).padStart(codigoIbgeLength, "0");

type ScoredMunicipio = MunicipioRow & { readonly score: number };

type EnteResult = {
  readonly tipo: "estado" | "municipio";
  readonly codIbge: string | null;
  readonly nome: string;
  readonly uf: string;
  readonly ano: number;
  readonly posicao: string | null;
  readonly capag: string | null;
  readonly indicador1: number | null;
  readonly nota1: string | null;
  readonly indicador2: number | null;
  readonly nota2: string | null;
  readonly indicador3: number | null;
  readonly nota3: string | null;
  readonly score: number | null;
};

const estadoToEnte = (row: EstadoRow): EnteResult => ({
  tipo: "estado",
  codIbge: null,
  nome: row.uf,
  uf: row.uf,
  ano: row.ano,
  posicao: null,
  capag: row.capag ?? null,
  indicador1: row.indicador1 ?? null,
  nota1: row.nota1 ?? null,
  indicador2: row.indicador2 ?? null,
  nota2: row.nota2 ?? null,
  indicador3: row.indicador3 ?? null,
  nota3: row.nota3 ?? null,
  score: null,
});

const municipioToEnte = (
  row: MunicipioRow,
  score: number | null
): EnteResult => ({
  tipo: "municipio",
  codIbge: row.codIbge,
  nome: row.nome,
  uf: row.uf,
  ano: row.anoBase,
  posicao: row.posicao ?? null,
  capag: row.capag ?? null,
  indicador1: row.indicador1 ?? null,
  nota1: row.nota1 ?? null,
  indicador2: row.indicador2 ?? null,
  nota2: row.nota2 ?? null,
  indicador3: row.indicador3 ?? null,
  nota3: row.nota3 ?? null,
  score,
});

const makeCapag = Effect.gen(function* () {
  const db = yield* Db;

  const replaceAll = (snapshot: {
    readonly estados: readonly EstadoRow[];
    readonly municipios: readonly MunicipioRow[];
    readonly entes: readonly EnteRow[];
  }) =>
    db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx.delete(capagEstado);
        yield* tx.delete(capagMunicipio);
        yield* tx.delete(siconfiEnte);
        yield* Effect.forEach(
          chunks(snapshot.estados),
          (batch) => tx.insert(capagEstado).values([...batch]),
          { concurrency: 1, discard: true }
        );
        yield* Effect.forEach(
          chunks(snapshot.municipios),
          (batch) => tx.insert(capagMunicipio).values([...batch]),
          { concurrency: 1, discard: true }
        );
        yield* Effect.forEach(
          chunks(snapshot.entes),
          (batch) => tx.insert(siconfiEnte).values([...batch]),
          { concurrency: 1, discard: true }
        );
      })
    );

  const municipioByCod = (codIbge: string, ano?: number) =>
    db.query.capagMunicipio.findFirst({
      where: {
        codIbge,
        ...Match.value(ano).pipe(
          Match.when(Match.number, (a) => ({ anoBase: a })),
          Match.orElse(() => ({}))
        ),
      },
      orderBy: (m, { desc }) => desc(m.anoBase),
    });

  const estadoByUf = (uf: string, ano?: number) =>
    db.query.capagEstado.findFirst({
      where: {
        uf,
        ...Match.value(ano).pipe(
          Match.when(Match.number, (a) => ({ ano: a })),
          Match.orElse(() => ({}))
        ),
      },
      orderBy: (e, { desc }) => desc(e.ano),
    });

  const bm25Municipios = (q: string, limit: number) =>
    db.execute(sql`
      select cod_ibge as "codIbge", -rk as score
      from (
        select cod_ibge, row_number() over () as rk
        from (
          select cod_ibge
          from ${capagMunicipio}
          order by busca <@> to_bm25query(${q})
          limit ${sql.raw(String(limit))}
        ) ranked
      ) scored
      order by rk
    `);

  const trgmMunicipios = (q: string, limit: number) =>
    db.execute(sql`
      select cod_ibge as "codIbge", word_similarity(${q}, busca) as score
      from ${capagMunicipio}
      where word_similarity(${q}, busca) >= 0.2
      order by score desc, cod_ibge
      limit ${sql.raw(String(limit))}
    `);

  const searchMunicipio = (
    nome: string,
    options?: { readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const q = normalize(nome);
      const limit = clamp(options?.limit, 10, 50);
      const lexical = yield* bm25Municipios(q, limit);
      const ranked = yield* Match.value(lexical.length).pipe(
        Match.when(0, () => trgmMunicipios(q, limit)),
        Match.orElse(() => Effect.succeed(lexical))
      );
      const codigos = ranked.map((row) => String(row.codIbge));
      return yield* Match.value(codigos.length).pipe(
        Match.when(0, () => Effect.succeed<readonly ScoredMunicipio[]>([])),
        Match.orElse(() =>
          db.query.capagMunicipio
            .findMany({ where: { codIbge: { in: codigos } } })
            .pipe(
              Effect.map((rows) => {
                const byCod = new Map(rows.map((row) => [row.codIbge, row]));
                return ranked.flatMap((scored) => {
                  const row = byCod.get(String(scored.codIbge));
                  return row === undefined
                    ? []
                    : [{ ...row, score: Number(scored.score) }];
                });
              })
            )
        )
      );
    });

  const capagEnte = (input: {
    readonly ibge?: string;
    readonly nome?: string;
    readonly uf?: string;
    readonly ano?: number;
  }) =>
    Match.value(input).pipe(
      Match.when({ ibge: Match.string }, ({ ibge, ano }) =>
        municipioByCod(padIbge(ibge), ano).pipe(
          Effect.flatMap((row) =>
            Match.value(row).pipe(
              Match.when(Match.undefined, () =>
                estadoByUf(ibge.trim().toUpperCase(), ano).pipe(
                  Effect.flatMap((estado) =>
                    Match.value(estado).pipe(
                      Match.when(Match.undefined, () =>
                        Effect.fail(
                          new CapagError({
                            code: "capag.ENTE_NOT_FOUND",
                            termo: ibge,
                          })
                        )
                      ),
                      Match.orElse((found) =>
                        Effect.succeed(estadoToEnte(found))
                      )
                    )
                  )
                )
              ),
              Match.orElse((found) =>
                Effect.succeed(municipioToEnte(found, null))
              )
            )
          )
        )
      ),
      Match.when({ nome: Match.string }, ({ nome, uf, ano }) =>
        searchMunicipio(nome).pipe(
          Effect.flatMap((rows) => {
            const filtered = Match.value(uf).pipe(
              Match.when(Match.string, (sigla) =>
                rows.filter(
                  (row) => row.uf === sigla.trim().toUpperCase()
                )
              ),
              Match.orElse(() => rows)
            );
            return Match.value(filtered[0]).pipe(
              Match.when(Match.undefined, () =>
                Effect.fail(
                  new CapagError({ code: "capag.ENTE_NOT_FOUND", termo: nome })
                )
              ),
              Match.orElse((best) =>
                municipioByCod(best.codIbge, ano).pipe(
                  Effect.map((row) =>
                    row === undefined
                      ? municipioToEnte(best, best.score)
                      : municipioToEnte(row, best.score)
                  )
                )
              )
            );
          })
        )
      ),
      Match.orElse(() =>
        Effect.fail(new CapagError({ code: "capag.MISSING_IDENTIFIER" }))
      )
    );

  const serieMunicipio = (codIbge: string) =>
    db.query.capagMunicipio.findMany({
      where: { codIbge },
      orderBy: (m, { asc }) => [asc(m.anoBase), asc(m.posicao)],
    });

  const serieHistorica = (input: {
    readonly ibge?: string;
    readonly nome?: string;
    readonly uf?: string;
  }) =>
    Match.value(input).pipe(
      Match.when({ ibge: Match.string }, ({ ibge }) =>
        serieMunicipio(padIbge(ibge)).pipe(
          Effect.map((serie) => ({ tipo: "municipio" as const, serie }))
        )
      ),
      Match.when({ nome: Match.string }, ({ nome, uf }) =>
        searchMunicipio(nome).pipe(
          Effect.flatMap((rows) => {
            const filtered = Match.value(uf).pipe(
              Match.when(Match.string, (sigla) =>
                rows.filter((row) => row.uf === sigla.trim().toUpperCase())
              ),
              Match.orElse(() => rows)
            );
            return Match.value(filtered[0]).pipe(
              Match.when(Match.undefined, () =>
                Effect.fail(
                  new CapagError({ code: "capag.ENTE_NOT_FOUND", termo: nome })
                )
              ),
              Match.orElse((best) =>
                serieMunicipio(best.codIbge).pipe(
                  Effect.map((serie) => ({ tipo: "municipio" as const, serie }))
                )
              )
            );
          })
        )
      ),
      Match.orElse(() =>
        Effect.fail(new CapagError({ code: "capag.MISSING_IDENTIFIER" }))
      )
    );

  const regiaoFilter = (regiao: string | undefined) =>
    Match.value(regiao).pipe(
      Match.when(Match.string, (value) => ({ regiao: value.trim().toUpperCase() })),
      Match.orElse(() => ({}))
    );

  const esferaFilter = (esfera: string | undefined) =>
    Match.value(esfera).pipe(
      Match.when(Match.string, (value) => ({ esfera: value.trim().toUpperCase() })),
      Match.orElse(() => ({}))
    );

  const entesPorNota = (options: {
    readonly notas: readonly string[];
    readonly regiao?: string;
    readonly uf?: string;
    readonly esfera?: string;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const notas = options.notas
        .map((nota) => nota.trim())
        .filter((nota) => nota !== "");
      const limit = clamp(options.limit, 50, 500);
      const ufFilter = Match.value(options.uf).pipe(
        Match.when(Match.string, (uf) => ({ uf: uf.trim().toUpperCase() })),
        Match.orElse(() => ({}))
      );
      const usaPonte =
        options.regiao !== undefined || options.esfera !== undefined;
      const estados = yield* db.query.capagEstado.findMany({
        where: { capag: { in: notas }, ...ufFilter },
        orderBy: (e, { asc }) => asc(e.uf),
      });
      const municipios = yield* db.query.capagMunicipio.findMany({
        where: { capag: { in: notas }, ...ufFilter },
        orderBy: (m, { asc }) => [asc(m.uf), asc(m.nome)],
      });
      const municipalBridge = yield* Match.value(
        usaPonte && municipios.length > 0
      ).pipe(
        Match.when(false, () => Effect.succeed<ReadonlySet<string>>(new Set())),
        Match.orElse(() =>
          db.query.siconfiEnte
            .findMany({
              where: {
                codIbge: { in: municipios.map((m) => m.codIbge) },
                ...regiaoFilter(options.regiao),
                ...esferaFilter(options.esfera),
              },
              columns: { codIbge: true },
            })
            .pipe(
              Effect.map(
                (rows): ReadonlySet<string> =>
                  new Set(rows.map((row) => row.codIbge))
              )
            )
        )
      );
      const stateBridge = yield* Match.value(
        usaPonte && estados.length > 0
      ).pipe(
        Match.when(false, () => Effect.succeed<ReadonlySet<string>>(new Set())),
        Match.orElse(() =>
          db.query.siconfiEnte
            .findMany({
              where: {
                uf: { in: estados.map((e) => e.uf) },
                esfera: "E",
                ...regiaoFilter(options.regiao),
              },
              columns: { uf: true },
            })
            .pipe(
              Effect.map(
                (rows): ReadonlySet<string> =>
                  new Set(
                    rows.flatMap((row) => (row.uf === null ? [] : [row.uf]))
                  )
              )
            )
        )
      );
      const municipiosFiltrados = Match.value(usaPonte).pipe(
        Match.when(false, () => municipios),
        Match.orElse(() => municipios.filter((m) => municipalBridge.has(m.codIbge)))
      );
      const estadosFiltrados = Match.value(usaPonte).pipe(
        Match.when(false, () => estados),
        Match.orElse(() =>
          Match.value(options.esfera).pipe(
            Match.when(Match.string, (esfera) =>
              esfera.trim().toUpperCase() === "E"
                ? estados.filter((e) => stateBridge.has(e.uf))
                : []
            ),
            Match.orElse(() => estados.filter((e) => stateBridge.has(e.uf)))
          )
        )
      );
      return {
        estados: estadosFiltrados.slice(0, limit),
        municipios: municipiosFiltrados.slice(0, limit),
      };
    });

  const bm25Entes = (q: string, limit: number) =>
    db.execute(sql`
      select cod_ibge as "codIbge", -rk as score
      from (
        select cod_ibge, row_number() over () as rk
        from (
          select cod_ibge
          from ${siconfiEnte}
          order by busca <@> to_bm25query(${q})
          limit ${sql.raw(String(limit))}
        ) ranked
      ) scored
      order by rk
    `);

  const trgmEntes = (q: string, limit: number) =>
    db.execute(sql`
      select cod_ibge as "codIbge", word_similarity(${q}, busca) as score
      from ${siconfiEnte}
      where word_similarity(${q}, busca) >= 0.2
      order by score desc, cod_ibge
      limit ${sql.raw(String(limit))}
    `);

  const buscarEntePorNome = (nome: string, options?: { readonly limit?: number }) =>
    Effect.gen(function* () {
      const q = normalize(nome);
      const limit = clamp(options?.limit, 10, 50);
      const lexical = yield* bm25Entes(q, limit);
      const ranked = yield* Match.value(lexical.length).pipe(
        Match.when(0, () => trgmEntes(q, limit)),
        Match.orElse(() => Effect.succeed(lexical))
      );
      const codigos = ranked.map((row) => String(row.codIbge));
      return yield* Match.value(codigos.length).pipe(
        Match.when(0, () =>
          Effect.succeed<readonly (EnteRow & { readonly score: number })[]>([])
        ),
        Match.orElse(() =>
          db.query.siconfiEnte
            .findMany({ where: { codIbge: { in: codigos } } })
            .pipe(
              Effect.map((rows) => {
                const byCod = new Map(rows.map((row) => [row.codIbge, row]));
                return ranked.flatMap((scored) => {
                  const row = byCod.get(String(scored.codIbge));
                  return row === undefined
                    ? []
                    : [{ ...row, score: Number(scored.score) }];
                });
              })
            )
        )
      );
    });

  const resolverEntePorCnpj = (cnpjInput: string) =>
    Effect.gen(function* () {
      const cnpj = onlyDigits(cnpjInput);
      const ente = yield* db.query.siconfiEnte.findFirst({
        where: { cnpj },
        columns: {
          codIbge: true,
          ente: true,
          uf: true,
          esfera: true,
          regiao: true,
        },
      });
      return yield* Match.value(ente).pipe(
        Match.when(Match.undefined, () =>
          Effect.fail(
            new CapagError({ code: "capag.CNPJ_NOT_FOUND", cnpj: cnpjInput })
          )
        ),
        Match.orElse((found) => Effect.succeed({ cnpj, ...found }))
      );
    });

  const indexAno = (ceilingYear: number) =>
    Effect.gen(function* () {
      const snapshot = yield* fetchSnapshot(ceilingYear);
      yield* replaceAll(snapshot);
      return {
        estados: snapshot.estados.length,
        municipios: snapshot.municipios.length,
        entes: snapshot.entes.length,
      };
    });

  const index = Effect.flatMap(Clock.currentTimeMillis, (millis) =>
    indexAno(new Date(millis).getUTCFullYear())
  );

  return {
    index,
    indexAll: index,
    indexAno,
    capagEnte,
    serieHistorica,
    entesPorNota,
    buscarEntePorNome,
    resolverEntePorCnpj,
  };
});

export class Capag extends Context.Service<
  Capag,
  Effect.Success<typeof makeCapag>
>()("dados-publicos-mcp/Capag") {}

export const CapagLive = Layer.effect(Capag)(makeCapag);
