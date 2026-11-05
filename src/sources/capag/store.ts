import { Context, DateTime, Effect, Layer, Match, Schema, Struct } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
import { Duck, type DuckParam, type DuckTable, idsParam, inIds } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import {
  CapagError,
  EnteFlat,
  EstadoFlat,
  Indicadores,
  MunicipioFlat,
  codigoIbgeLength,
} from "./catalog";
import { fetchSnapshot } from "./indexer";
import { clamp, lexicalOrFuzzy, scoredFrom } from "../../kernel/duck/search";

export const capagEstadoTable: DuckTable = {
  name: "capag_estado",
  key: "id",
  columns: {
    id: "VARCHAR",
    uf: "VARCHAR",
    ano: "INTEGER",
    indicador1: "DOUBLE",
    nota1: "VARCHAR",
    indicador2: "DOUBLE",
    nota2: "VARCHAR",
    indicador3: "DOUBLE",
    nota3: "VARCHAR",
    capag: "VARCHAR",
    qualidadeInfo: "VARCHAR",
    observacao: "VARCHAR",
  },
};

export const capagMunicipioTable: DuckTable = {
  name: "capag_municipio",
  key: "id",
  columns: {
    id: "VARCHAR",
    codIbge: "VARCHAR",
    nome: "VARCHAR",
    nomeNorm: "VARCHAR",
    uf: "VARCHAR",
    anoBase: "INTEGER",
    posicao: "VARCHAR",
    indicador1: "DOUBLE",
    nota1: "VARCHAR",
    indicador2: "DOUBLE",
    nota2: "VARCHAR",
    indicador3: "DOUBLE",
    nota3: "VARCHAR",
    capag: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

export const siconfiEnteTable: DuckTable = {
  name: "siconfi_ente",
  key: "codIbge",
  columns: {
    codIbge: "VARCHAR",
    ente: "VARCHAR",
    uf: "VARCHAR",
    esfera: "VARCHAR",
    regiao: "VARCHAR",
    populacao: "INTEGER",
    cnpj: "VARCHAR",
    exercicio: "INTEGER",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

const MunicipioScored = Schema.Struct({ ...MunicipioFlat.fields, score: Schema.Finite });
const EnteScored = Schema.Struct({ ...EnteFlat.fields, score: Schema.Finite });
const EnteBridge = EnteFlat.mapFields(Struct.pick(["codIbge", "ente", "uf", "esfera", "regiao"]));

const trimUpper = (value: string) => pipe(value, Str.trim, Str.toUpperCase);

const padIbge = (codigo: string) => pipe(onlyDigits(codigo), Str.padStart(codigoIbgeLength, "0"));

const EnteResult = Schema.Struct({
  tipo: Schema.Literals(["estado", "municipio"]),
  codIbge: Schema.NullOr(Schema.String),
  nome: Schema.String,
  uf: Schema.String,
  ano: Schema.Finite,
  posicao: Schema.NullOr(Schema.String),
  capag: Schema.NullOr(Schema.String),
  ...Indicadores.fields,
  score: Schema.NullOr(Schema.Finite),
});
type EnteResult = (typeof EnteResult)["Type"];

const estadoToEnte = (row: EstadoFlat): EnteResult => ({
  tipo: "estado",
  codIbge: null,
  nome: row.uf,
  uf: row.uf,
  ano: row.ano,
  posicao: null,
  capag: row.capag,
  indicador1: row.indicador1,
  nota1: row.nota1,
  indicador2: row.indicador2,
  nota2: row.nota2,
  indicador3: row.indicador3,
  nota3: row.nota3,
  score: null,
});

const municipioToEnte = (row: MunicipioFlat, score: number | null): EnteResult => ({
  tipo: "municipio",
  codIbge: row.codIbge,
  nome: row.nome,
  uf: row.uf,
  ano: row.anoBase,
  posicao: row.posicao,
  capag: row.capag,
  indicador1: row.indicador1,
  nota1: row.nota1,
  indicador2: row.indicador2,
  nota2: row.nota2,
  indicador3: row.indicador3,
  nota3: row.nota3,
  score,
});

const optionalFilter = (
  clause: string,
  value: string | number | undefined
): readonly [string, readonly DuckParam[]] => (value === undefined ? ["", []] : [clause, [value]]);

const makeCapag = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const municipioByCod = (codIbge: string, ano?: number) =>
    Effect.gen(function* () {
      const anoFilter = optionalFilter(`AND "anoBase" = ?`, ano);
      const rows = yield* duck.query(
        MunicipioFlat,
        `SELECT * EXCLUDE (id) FROM capag_municipio WHERE "codIbge" = ? ${anoFilter[0]} ORDER BY "anoBase" DESC LIMIT 1`,
        [codIbge, ...anoFilter[1]]
      );
      return Arr.head(rows);
    });

  const estadoByUf = (uf: string, ano?: number) =>
    Effect.gen(function* () {
      const anoFilter = optionalFilter(`AND ano = ?`, ano);
      const rows = yield* duck.query(
        EstadoFlat,
        `SELECT * EXCLUDE (id) FROM capag_estado WHERE uf = ? ${anoFilter[0]} ORDER BY ano DESC LIMIT 1`,
        [uf, ...anoFilter[1]]
      );
      return Arr.head(rows);
    });

  const searchMunicipio = (nome: string, options?: { readonly limit?: number }) =>
    Effect.gen(function* () {
      const q = normalize(nome);
      const limit = clamp(options?.limit, 10, 50);
      const ranked = yield* lexicalOrFuzzy(
        duck.query(
          MunicipioScored,
          `SELECT * EXCLUDE (id), score ${scoredFrom(capagMunicipioTable)} ORDER BY score DESC, "codIbge", "anoBase" DESC LIMIT ?`,
          [q, limit]
        ),
        fuzzy.match("capag_municipio", q, { limit }),
        (ids) =>
          duck.query(
            MunicipioScored,
            `SELECT * EXCLUDE (id), 0::DOUBLE AS score FROM capag_municipio WHERE ${inIds("codIbge")} ORDER BY "anoBase" DESC`,
            [idsParam(ids)]
          ),
        (row) => row.codIbge
      );
      return Arr.dedupeWith(ranked, (a, b) => a.codIbge === b.codIbge);
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
            Match.value(row._tag).pipe(
              Match.when("None", () =>
                estadoByUf(trimUpper(ibge), ano).pipe(
                  Effect.flatMap((estado) =>
                    Effect.fromOption(estado).pipe(
                      Effect.mapBoth({
                        onSuccess: estadoToEnte,
                        onFailure: () =>
                          CapagError.make({ code: "capag.ENTE_NOT_FOUND", termo: ibge }),
                      })
                    )
                  )
                )
              ),
              Match.orElse(() =>
                Effect.fromOption(row).pipe(
                  Effect.mapBoth({
                    onSuccess: (found) => municipioToEnte(found, null),
                    onFailure: () => CapagError.make({ code: "capag.ENTE_NOT_FOUND", termo: ibge }),
                  })
                )
              )
            )
          )
        )
      ),
      Match.when({ nome: Match.string }, ({ nome, uf, ano }) =>
        bestMunicipio(nome, uf).pipe(
          Effect.flatMap((best) =>
            municipioByCod(best.codIbge, ano).pipe(
              Effect.map((row) =>
                municipioToEnte(
                  pipe(row, (found) => (found._tag === "Some" ? found.value : best)),
                  best.score
                )
              )
            )
          )
        )
      ),
      Match.orElse(() => Effect.fail(CapagError.make({ code: "capag.MISSING_IDENTIFIER" })))
    );

  const serieMunicipio = (codIbge: string) =>
    duck.query(
      MunicipioFlat,
      `SELECT * EXCLUDE (id) FROM capag_municipio WHERE "codIbge" = ? ORDER BY "anoBase", posicao`,
      [codIbge]
    );

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
        bestMunicipio(nome, uf).pipe(
          Effect.flatMap((best) =>
            serieMunicipio(best.codIbge).pipe(
              Effect.map((serie) => ({ tipo: "municipio" as const, serie }))
            )
          )
        )
      ),
      Match.orElse(() => Effect.fail(CapagError.make({ code: "capag.MISSING_IDENTIFIER" })))
    );

  const entesPorNota = (options: {
    readonly notas: readonly string[];
    readonly regiao?: string;
    readonly uf?: string;
    readonly esfera?: string;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const notas = pipe(
        options.notas,
        Arr.map(Str.trim),
        Arr.filter((nota) => nota !== "")
      );
      const limit = clamp(options.limit, 50, 500);
      const ufFilter = optionalFilter(
        `AND uf = ?`,
        Match.value(options.uf).pipe(
          Match.when(Match.string, trimUpper),
          Match.orElse(() => undefined)
        )
      );
      const regiaoFilter = optionalFilter(
        `AND regiao = ?`,
        Match.value(options.regiao).pipe(
          Match.when(Match.string, trimUpper),
          Match.orElse(() => undefined)
        )
      );
      const esferaFilter = optionalFilter(
        `AND esfera = ?`,
        Match.value(options.esfera).pipe(
          Match.when(Match.string, trimUpper),
          Match.orElse(() => undefined)
        )
      );
      const usaPonte = options.regiao !== undefined || options.esfera !== undefined;
      const estadoBridge = usaPonte
        ? `AND uf IN (SELECT uf FROM siconfi_ente WHERE esfera = 'E' ${regiaoFilter[0]})`
        : "";
      const estadoBridgeParams = usaPonte ? regiaoFilter[1] : [];
      const estadosPermitidos =
        usaPonte && options.esfera !== undefined && trimUpper(options.esfera) !== "E"
          ? false
          : true;
      const municipioBridge = usaPonte
        ? `AND "codIbge" IN (SELECT "codIbge" FROM siconfi_ente WHERE true ${regiaoFilter[0]} ${esferaFilter[0]})`
        : "";
      const municipioBridgeParams = usaPonte ? [...regiaoFilter[1], ...esferaFilter[1]] : [];
      const estados = estadosPermitidos
        ? yield* duck.query(
            EstadoFlat,
            `SELECT * EXCLUDE (id) FROM capag_estado
             WHERE ${inIds("capag")} ${ufFilter[0]} ${estadoBridge} ORDER BY uf LIMIT ?`,
            [idsParam(notas), ...ufFilter[1], ...estadoBridgeParams, limit]
          )
        : [];
      const municipios = yield* duck.query(
        MunicipioFlat,
        `SELECT * EXCLUDE (id) FROM capag_municipio
         WHERE ${inIds("capag")} ${ufFilter[0]} ${municipioBridge} ORDER BY uf, nome LIMIT ?`,
        [idsParam(notas), ...ufFilter[1], ...municipioBridgeParams, limit]
      );
      return { estados, municipios };
    });

  const buscarEntePorNome = (nome: string, options?: { readonly limit?: number }) =>
    Effect.gen(function* () {
      const q = normalize(nome);
      const limit = clamp(options?.limit, 10, 50);
      return yield* lexicalOrFuzzy(
        duck.query(
          EnteScored,
          `SELECT *, score ${scoredFrom(siconfiEnteTable)} ORDER BY score DESC, "codIbge" LIMIT ?`,
          [q, limit]
        ),
        fuzzy.match("siconfi_ente", q, { limit }),
        (ids) =>
          duck.query(
            EnteScored,
            `SELECT *, 0::DOUBLE AS score FROM siconfi_ente WHERE ${inIds("codIbge")}`,
            [idsParam(ids)]
          ),
        (row) => row.codIbge
      );
    });

  const bestMunicipio = (nome: string, uf: string | undefined) =>
    searchMunicipio(nome).pipe(
      Effect.flatMap((rows) => {
        const filtered = Match.value(uf).pipe(
          Match.when(Match.string, (sigla) =>
            Arr.filter(rows, (row) => row.uf === trimUpper(sigla))
          ),
          Match.orElse(() => rows)
        );
        return Effect.fromOption(Arr.head(filtered)).pipe(
          Effect.mapError(() => CapagError.make({ code: "capag.ENTE_NOT_FOUND", termo: nome }))
        );
      })
    );

  const resolverEntePorCnpj = (cnpjInput: string) =>
    Effect.gen(function* () {
      const cnpj = onlyDigits(cnpjInput);
      const rows = yield* duck.query(
        EnteBridge,
        `SELECT "codIbge", ente, uf, esfera, regiao FROM siconfi_ente WHERE cnpj = ? LIMIT 1`,
        [cnpj]
      );
      const ente = yield* Effect.fromOption(Arr.head(rows)).pipe(
        Effect.mapError(() => CapagError.make({ code: "capag.CNPJ_NOT_FOUND", cnpj: cnpjInput }))
      );
      return { cnpj, ...ente };
    });

  const indexAno = (ceilingYear: number) =>
    Effect.gen(function* () {
      const snapshot = yield* fetchSnapshot(ceilingYear);
      const estados = Arr.map(snapshot.estados, (row) => ({ ...row, id: `${row.uf}:${row.ano}` }));
      const municipios = Arr.map(snapshot.municipios, (row) => ({
        ...row,
        id: `${row.codIbge}:${row.anoBase}`,
      }));
      yield* duck.transaction(
        duck
          .replace(capagEstadoTable, estados)
          .pipe(
            Effect.andThen(duck.replace(capagMunicipioTable, municipios)),
            Effect.andThen(duck.replace(siconfiEnteTable, snapshot.entes))
          )
      );
      yield* fuzzy.write(
        "capag_municipio",
        Arr.map(municipios, (row): readonly [string, string] => [row.codIbge, row.busca])
      );
      yield* fuzzy.write(
        "siconfi_ente",
        Arr.map(snapshot.entes, (row): readonly [string, string] => [row.codIbge, row.busca])
      );
      return {
        estados: snapshot.estados.length,
        municipios: snapshot.municipios.length,
        entes: snapshot.entes.length,
      };
    });

  const index = Effect.flatMap(DateTime.now, (now) => indexAno(DateTime.getPartUtc(now, "year")));

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

export class Capag extends Context.Service<Capag, Effect.Success<typeof makeCapag>>()(
  "dados-publicos-mcp/sources/capag/store/Capag"
) {}

export const CapagLive = Layer.effect(Capag)(makeCapag);
