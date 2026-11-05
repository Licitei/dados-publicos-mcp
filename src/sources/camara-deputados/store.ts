import { Clock, Context, DateTime, Effect, Layer, Match, Option, Schema, Struct } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Rec from "effect/Record";
import * as Str from "effect/String";
import { bm25, Duck, type DuckTable, idsParam, inIds } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { ehDocumento, normalize, onlyDigits } from "../../kernel/text/normalize";
import {
  CamaraError,
  CEAP_ANO_MAX,
  CotaFlat,
  DeputadoFlat,
  ProposicaoAutorFlat,
  ProposicaoFlat,
} from "./catalog";
import { loadCotas, loadDeputados, loadProposicaoAutores, loadProposicoes } from "./indexer";
import { appendWithIds } from "../../kernel/duck/append";
import { clamp, clause, conditions } from "../../kernel/duck/search";

export const deputadoTable: DuckTable = {
  name: "deputado",
  key: "id",
  columns: {
    id: "VARCHAR",
    uri: "VARCHAR",
    nome: "VARCHAR",
    nomeCivil: "VARCHAR",
    nomeNorm: "VARCHAR",
    siglaSexo: "VARCHAR",
    dataNascimento: "VARCHAR",
    dataFalecimento: "VARCHAR",
    ufNascimento: "VARCHAR",
    municipioNascimento: "VARCHAR",
    idLegislaturaInicial: "INTEGER",
    idLegislaturaFinal: "INTEGER",
  },
  search: ["nomeNorm"],
};

export const cotaTable: DuckTable = {
  name: "cota",
  key: "id",
  columns: {
    id: "VARCHAR",
    nuDeputadoId: "INTEGER",
    ideCadastro: "INTEGER",
    nomeParlamentar: "VARCHAR",
    cpfDeputado: "VARCHAR",
    sgUf: "VARCHAR",
    sgPartido: "VARCHAR",
    numSubCota: "INTEGER",
    txtDescricao: "VARCHAR",
    txtFornecedor: "VARCHAR",
    cnpjCpf: "VARCHAR",
    cnpjCpfNorm: "VARCHAR",
    datEmissao: "VARCHAR",
    vlrDocumento: "DOUBLE",
    vlrGlosa: "DOUBLE",
    vlrLiquido: "DOUBLE",
    numMes: "INTEGER",
    numAno: "INTEGER",
    ideDocumento: "VARCHAR",
    urlDocumento: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

export const proposicaoTable: DuckTable = {
  name: "proposicao",
  key: "id",
  columns: {
    id: "VARCHAR",
    uri: "VARCHAR",
    siglaTipo: "VARCHAR",
    numero: "INTEGER",
    ano: "INTEGER",
    ementa: "VARCHAR",
    ementaDetalhada: "VARCHAR",
    keywords: "VARCHAR",
    dataApresentacao: "VARCHAR",
    situacao: "VARCHAR",
    ultimoStatusData: "VARCHAR",
    ultimoStatusOrgao: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

export const proposicaoAutorTable: DuckTable = {
  name: "proposicao_autor",
  key: "id",
  columns: {
    id: "VARCHAR",
    idProposicao: "VARCHAR",
    idDeputadoAutor: "VARCHAR",
    uriAutor: "VARCHAR",
    nomeAutor: "VARCHAR",
    nomeAutorNorm: "VARCHAR",
    proponente: "INTEGER",
  },
};

const DeputadoRow = DeputadoFlat.mapFields((fields) => ({
  ...Struct.omit(fields, ["nomeNorm"]),
  score: Schema.Finite,
}));

const CotaRow = CotaFlat.mapFields((fields) => ({
  ...Struct.omit(fields, ["ideCadastro", "cpfDeputado", "numSubCota", "busca"]),
  nomeDeputado: Schema.NullOr(Schema.String),
  ufDeputado: Schema.NullOr(Schema.String),
  score: Schema.Finite,
}));

const ProposicaoRow = ProposicaoFlat.mapFields((fields) => ({
  ...Struct.omit(fields, ["busca"]),
  score: Schema.Finite,
}));

const AutorRow = ProposicaoAutorFlat.mapFields((fields) => ({
  ...Struct.omit(fields, ["uriAutor", "nomeAutorNorm"]),
}));

const ReverseRow = Schema.Struct({
  deputadoId: Schema.NullOr(Schema.Finite),
  nomeParlamentar: Schema.String,
  uf: Schema.String,
  partido: Schema.String,
  documentos: Schema.Finite,
  totalLiquido: Schema.NullOr(Schema.Finite),
});

const ReverseTotals = Schema.Struct({
  totalDocumentos: Schema.Finite,
  totalLiquido: Schema.Finite,
  fornecedor: Schema.NullOr(Schema.String),
});

const deputadoColumns = `id, uri, nome, "nomeCivil", "siglaSexo", "dataNascimento", "dataFalecimento",
  "ufNascimento", "municipioNascimento", "idLegislaturaInicial"::INTEGER AS "idLegislaturaInicial",
  "idLegislaturaFinal"::INTEGER AS "idLegislaturaFinal"`;

const cotaColumns = `c."nuDeputadoId"::INTEGER AS "nuDeputadoId", c."nomeParlamentar", c."sgUf", c."sgPartido",
  c."txtDescricao", c."txtFornecedor", c."cnpjCpf", c."cnpjCpfNorm", c."datEmissao",
  c."vlrDocumento"::DOUBLE AS "vlrDocumento", c."vlrGlosa"::DOUBLE AS "vlrGlosa",
  c."vlrLiquido"::DOUBLE AS "vlrLiquido", c."numMes"::INTEGER AS "numMes", c."numAno"::INTEGER AS "numAno",
  c."ideDocumento", c."urlDocumento", d.nome AS "nomeDeputado", d."ufNascimento" AS "ufDeputado"`;

const cotaJoin = `LEFT JOIN deputado d ON d.id = c."nuDeputadoId"::VARCHAR`;

const proposicaoColumns = `id, uri, "siglaTipo", numero::INTEGER AS numero, ano::INTEGER AS ano, ementa,
  "ementaDetalhada", keywords, "dataApresentacao", situacao, "ultimoStatusData", "ultimoStatusOrgao"`;

const makeCamara = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const buscarDeputado = (input: {
    readonly nome?: string;
    readonly id?: string;
    readonly uf?: string;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const limit = clamp(input.limit, 20, 200);
      const filter = conditions([
        clause(
          `id = ?`,
          Option.filter(Option.fromNullishOr(input.id), (value) => value !== "")
        ),
        clause(
          `"ufNascimento" = ?`,
          pipe(
            Option.fromNullishOr(input.uf),
            Option.filter((value) => value !== ""),
            Option.map((value) => pipe(value, Str.trim, Str.toUpperCase))
          )
        ),
      ]);
      const termo = Option.filter(Option.fromNullishOr(input.nome), (value) => value !== "");
      return yield* Option.match(termo, {
        onNone: () =>
          duck.query(
            DeputadoRow,
            `SELECT ${deputadoColumns}, 0::DOUBLE AS score FROM deputado
             WHERE true${filter.sql} ORDER BY nome LIMIT ?`,
            [...filter.params, limit]
          ),
        onSome: (nome) =>
          Effect.gen(function* () {
            const query = normalize(nome);
            const exact = yield* duck.query(
              DeputadoRow,
              `SELECT ${deputadoColumns}, score
               FROM (SELECT *, ${bm25(deputadoTable)} AS score FROM deputado)
               WHERE score IS NOT NULL${filter.sql} ORDER BY score DESC, nome LIMIT ?`,
              [query, ...filter.params, limit]
            );
            const ids = Arr.isReadonlyArrayNonEmpty(exact)
              ? []
              : yield* fuzzy.match("camara-deputado", query, { limit });
            const approximate = Arr.isReadonlyArrayNonEmpty(ids)
              ? yield* duck.query(
                  DeputadoRow,
                  `SELECT ${deputadoColumns}, 0::DOUBLE AS score FROM deputado
                   WHERE ${inIds("id")}${filter.sql} ORDER BY nome LIMIT ?`,
                  [idsParam(ids), ...filter.params, limit]
                )
              : [];
            return Arr.isReadonlyArrayNonEmpty(exact) ? exact : approximate;
          }),
      });
    });

  const gastosPorFornecedor = (input: {
    readonly fornecedor?: string;
    readonly cnpjCpf?: string;
    readonly ano?: number;
    readonly categoria?: string;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const limit = clamp(input.limit, 20, 100);
      const filter = conditions([
        clause(`c."numAno" = ?`, Option.fromNullishOr(input.ano)),
        clause(
          `c."txtDescricao" LIKE ?`,
          Option.map(Option.fromNullishOr(input.categoria), (categoria) => `%${categoria}%`)
        ),
      ]);
      const doc = pipe(
        Option.fromNullishOr(input.cnpjCpf),
        Option.orElse(() => Option.filter(Option.fromNullishOr(input.fornecedor), ehDocumento)),
        Option.map(onlyDigits)
      );
      const lookupFornecedor = (fornecedor: string) =>
        Effect.gen(function* () {
          const query = normalize(fornecedor);
          const lexical = yield* duck.query(
            CotaRow,
            `SELECT ${cotaColumns}, c.score
             FROM (SELECT *, ${bm25(cotaTable)} AS score FROM cota) c ${cotaJoin}
             WHERE c.score IS NOT NULL${filter.sql}
             ORDER BY c.score DESC, c."vlrLiquido" DESC NULLS LAST, c.id LIMIT ?`,
            [query, ...filter.params, limit]
          );
          const ids = Arr.isReadonlyArrayNonEmpty(lexical)
            ? []
            : yield* fuzzy.match("camara-cota", query, { limit });
          const approximate = Arr.isReadonlyArrayNonEmpty(ids)
            ? yield* duck.query(
                CotaRow,
                `SELECT ${cotaColumns}, 0::DOUBLE AS score FROM cota c ${cotaJoin}
                 WHERE ${inIds("busca")}${filter.sql}
                 ORDER BY c."vlrLiquido" DESC NULLS LAST, c.id LIMIT ?`,
                [idsParam(ids), ...filter.params, limit]
              )
            : [];
          return Arr.isReadonlyArrayNonEmpty(lexical) ? lexical : approximate;
        });
      return yield* Option.match(doc, {
        onSome: (value) =>
          duck.query(
            CotaRow,
            `SELECT ${cotaColumns}, coalesce(c."vlrLiquido", 0)::DOUBLE AS score
             FROM cota c ${cotaJoin}
             WHERE c."cnpjCpfNorm" = ?${filter.sql}
             ORDER BY c."vlrLiquido" DESC NULLS LAST, c.id LIMIT ?`,
            [value, ...filter.params, limit]
          ),
        onNone: () =>
          Option.match(Option.fromNullishOr(input.fornecedor), {
            onSome: lookupFornecedor,
            onNone: () => Effect.fail(CamaraError.make({ code: "camara.MISSING_FILTRO" })),
          }),
      });
    });

  const fornecedorCotaParlamentar = (input: {
    readonly cnpjCpf: string;
    readonly ano?: number;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const alvo = onlyDigits(input.cnpjCpf);
      const limit = clamp(input.limit, 50, 500);
      const filter = conditions([clause(`"numAno" = ?`, Option.fromNullishOr(input.ano))]);
      const deputados = yield* duck.query(
        ReverseRow,
        `SELECT
           "nuDeputadoId"::INTEGER AS "deputadoId",
           max("nomeParlamentar") AS "nomeParlamentar",
           max("sgUf") AS uf, max("sgPartido") AS partido,
           count(*)::INTEGER AS documentos,
           sum("vlrLiquido")::DOUBLE AS "totalLiquido"
         FROM cota
         WHERE "cnpjCpfNorm" = ?${filter.sql}
         GROUP BY "nuDeputadoId"
         ORDER BY "totalLiquido" DESC NULLS LAST, "deputadoId"
         LIMIT ?`,
        [alvo, ...filter.params, limit]
      );
      const totals = yield* duck.query(
        ReverseTotals,
        `SELECT
           count(*)::INTEGER AS "totalDocumentos",
           coalesce(sum("vlrLiquido"), 0)::DOUBLE AS "totalLiquido",
           max("txtFornecedor") AS fornecedor
         FROM cota
         WHERE "cnpjCpfNorm" = ?${filter.sql}`,
        [alvo, ...filter.params]
      );
      const summary = Option.getOrElse(Arr.head(totals), (): typeof ReverseTotals.Type => ({
        totalDocumentos: 0,
        totalLiquido: 0,
        fornecedor: null,
      }));
      return {
        cnpjCpf: alvo,
        fornecedor: summary.fornecedor,
        ano: input.ano ?? null,
        totalDocumentos: summary.totalDocumentos,
        totalLiquido: summary.totalLiquido,
        deputados,
      };
    });

  const enrichAutores = (rows: readonly (typeof ProposicaoRow.Type)[]) =>
    Effect.gen(function* () {
      const ids = Arr.map(rows, (row) => row.id);
      const autores = Arr.isReadonlyArrayNonEmpty(ids)
        ? yield* duck.query(
            AutorRow,
            `SELECT "idProposicao", "idDeputadoAutor", "nomeAutor", proponente::INTEGER AS proponente
             FROM proposicao_autor WHERE ${inIds("idProposicao")} ORDER BY id`,
            [idsParam(ids)]
          )
        : [];
      const byProp = Arr.groupBy(autores, (autor) => autor.idProposicao);
      return Arr.map(rows, (row) => ({
        ...row,
        autores: Option.getOrElse(
          Rec.get(byProp, row.id),
          (): readonly (typeof AutorRow.Type)[] => []
        ),
      }));
    });

  const buscarProposicao = (input: {
    readonly termo: string;
    readonly ano?: number;
    readonly tipo?: string;
    readonly incluirAutores?: boolean;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const limit = clamp(input.limit, 20, 200);
      const filter = conditions([
        clause(`ano = ?`, Option.fromNullishOr(input.ano)),
        clause(
          `"siglaTipo" = ?`,
          Option.map(Option.fromNullishOr(input.tipo), (tipo) =>
            pipe(tipo, Str.trim, Str.toUpperCase)
          )
        ),
      ]);
      const rows = yield* duck.query(
        ProposicaoRow,
        `SELECT ${proposicaoColumns}, score
         FROM (SELECT *, ${bm25(proposicaoTable)} AS score FROM proposicao)
         WHERE score IS NOT NULL${filter.sql} ORDER BY score DESC, id LIMIT ?`,
        [normalize(input.termo), ...filter.params, limit]
      );
      return yield* Match.value(Boolean(input.incluirAutores)).pipe(
        Match.when(true, () => enrichAutores(rows)),
        Match.orElse(() => Effect.succeed(rows))
      );
    });

  const indexAnos = (anos: readonly number[]) =>
    Effect.gen(function* () {
      const deputados = yield* loadDeputados;
      yield* duck.replace(deputadoTable, deputados);
      yield* fuzzy.write(
        "camara-deputado",
        Arr.map(deputados, (row): readonly [string, string] => [row.id, row.nomeNorm])
      );
      yield* Effect.forEach(
        [cotaTable, proposicaoTable, proposicaoAutorTable],
        (table) => duck.create(table),
        { concurrency: 1, discard: true }
      );
      yield* Effect.forEach(
        anos,
        (ano) =>
          Effect.gen(function* () {
            const cotas = yield* loadCotas(ano);
            yield* appendWithIds(cotaTable, `${ano}-`, cotas);
            const proposicoes = yield* loadProposicoes(ano);
            yield* duck.append(proposicaoTable, proposicoes);
            const autores = yield* loadProposicaoAutores(ano);
            yield* appendWithIds(proposicaoAutorTable, `${ano}-`, autores);
          }),
        { concurrency: 1, discard: true }
      );
      yield* duck.reindex(cotaTable);
      yield* duck.reindex(proposicaoTable);
      const fornecedores = yield* duck.query(
        Schema.Struct({ busca: Schema.String }),
        `SELECT DISTINCT busca FROM cota WHERE busca <> ''`
      );
      yield* fuzzy.write(
        "camara-cota",
        Arr.map(fornecedores, (row): readonly [string, string] => [row.busca, row.busca])
      );
      return {
        deputados: yield* duck.count(deputadoTable),
        cotas: yield* duck.count(cotaTable),
        proposicoes: yield* duck.count(proposicaoTable),
        proposicoesAutores: yield* duck.count(proposicaoAutorTable),
      };
    });

  const index = Effect.flatMap(Clock.currentTimeMillis, (millis) =>
    indexAnos([Math.min(DateTime.toPartsUtc(DateTime.makeUnsafe(millis)).year, CEAP_ANO_MAX)])
  );

  return {
    index,
    indexAll: index,
    indexAnos,
    buscarDeputado,
    gastosPorFornecedor,
    fornecedorCotaParlamentar,
    buscarProposicao,
  };
});

export class CamaraDeputados extends Context.Service<
  CamaraDeputados,
  Effect.Success<typeof makeCamara>
>()("dados-publicos-mcp/sources/camara-deputados/store/CamaraDeputados") {}

export const CamaraDeputadosLive = Layer.effect(CamaraDeputados)(makeCamara);
