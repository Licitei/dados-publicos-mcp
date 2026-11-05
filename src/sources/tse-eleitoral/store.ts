import { Clock, Context, DateTime, Effect, Layer, Match, Option, pipe, Schema } from "effect";
import * as Arr from "effect/Array";
import { bm25, Duck, type DuckTable, idsParam, inIds } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { ehDocumento, normalize, onlyDigits } from "../../kernel/text/normalize";
import { TseError } from "./catalog";
import { indexBens, indexCandidatos, indexPrestacao } from "./indexer";
import { clamp, clause, conditions } from "../../kernel/duck/search";

export const candidatoTable: DuckTable = {
  name: "candidato",
  key: "id",
  columns: {
    id: "VARCHAR",
    sqCandidato: "VARCHAR",
    cpf: "VARCHAR",
    nome: "VARCHAR",
    nomeUrna: "VARCHAR",
    anoEleicao: "INTEGER",
    ufSigla: "VARCHAR",
    ueSigla: "VARCHAR",
    cargoCodigo: "VARCHAR",
    cargoDescricao: "VARCHAR",
    partidoNumero: "VARCHAR",
    partidoSigla: "VARCHAR",
    situacaoTurno: "VARCHAR",
    dataNascimento: "VARCHAR",
    ocupacao: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

export const bemTable: DuckTable = {
  name: "bem",
  key: "id",
  columns: {
    id: "VARCHAR",
    sqCandidato: "VARCHAR",
    anoEleicao: "INTEGER",
    ufSigla: "VARCHAR",
    ordem: "VARCHAR",
    tipoCodigo: "VARCHAR",
    tipoDescricao: "VARCHAR",
    descricao: "VARCHAR",
    valor: "DOUBLE",
  },
};

export const receitaTable: DuckTable = {
  name: "receita",
  key: "id",
  columns: {
    id: "VARCHAR",
    sqReceita: "VARCHAR",
    sqCandidato: "VARCHAR",
    cpfCandidato: "VARCHAR",
    anoEleicao: "INTEGER",
    cpfCnpjDoador: "VARCHAR",
    nomeDoador: "VARCHAR",
    nomeDoadorRfb: "VARCHAR",
    cnaeCodigo: "VARCHAR",
    cnaeDescricao: "VARCHAR",
    ufDoador: "VARCHAR",
    valor: "DOUBLE",
    data: "VARCHAR",
    origem: "VARCHAR",
    natureza: "VARCHAR",
    recibo: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

export const despesaTable: DuckTable = {
  name: "despesa",
  key: "id",
  columns: {
    id: "VARCHAR",
    sqDespesa: "VARCHAR",
    sqCandidato: "VARCHAR",
    cpfCandidato: "VARCHAR",
    anoEleicao: "INTEGER",
    cpfCnpjForn: "VARCHAR",
    nomeForn: "VARCHAR",
    nomeFornRfb: "VARCHAR",
    cnaeCodigo: "VARCHAR",
    cnaeDescricao: "VARCHAR",
    ufForn: "VARCHAR",
    valor: "DOUBLE",
    data: "VARCHAR",
    descricao: "VARCHAR",
    documento: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

export const receitaOriginarioTable: DuckTable = {
  name: "receita_originario",
  key: "id",
  columns: {
    id: "VARCHAR",
    sqReceita: "VARCHAR",
    anoEleicao: "INTEGER",
    cpfCnpjOrig: "VARCHAR",
    nomeOrig: "VARCHAR",
    nomeOrigRfb: "VARCHAR",
    tipoOrig: "VARCHAR",
    cnaeCodigo: "VARCHAR",
    valor: "DOUBLE",
    data: "VARCHAR",
  },
};

const CandidatoBase = Schema.Struct({
  sqCandidato: Schema.String,
  cpf: Schema.String,
  nome: Schema.String,
  nomeUrna: Schema.String,
  anoEleicao: Schema.NullOr(Schema.Finite),
  ufSigla: Schema.String,
  cargoDescricao: Schema.String,
  partidoSigla: Schema.String,
  situacaoTurno: Schema.String,
});

const CandidatoHit = Schema.Struct({ ...CandidatoBase.fields, score: Schema.Finite });

const Candidatura = Schema.Struct({
  ...CandidatoBase.fields,
  dataNascimento: Schema.String,
  ocupacao: Schema.String,
});

const Bem = Schema.Struct({
  sqCandidato: Schema.String,
  anoEleicao: Schema.NullOr(Schema.Finite),
  tipoDescricao: Schema.String,
  descricao: Schema.String,
  valor: Schema.NullOr(Schema.Finite),
});

const CandidatoResumo = Schema.Struct({
  sqCandidato: Schema.String,
  nome: Schema.String,
  cargoDescricao: Schema.String,
  ufSigla: Schema.String,
  partidoSigla: Schema.String,
});

const DoacaoRow = Schema.Struct({
  cpfCnpjDoador: Schema.String,
  nomeDoador: Schema.String,
  anoEleicao: Schema.NullOr(Schema.Finite),
  sqCandidato: Schema.String,
  valor: Schema.NullOr(Schema.Finite),
  data: Schema.String,
  natureza: Schema.String,
  score: Schema.Finite,
});

const DespesaRow = Schema.Struct({
  cpfCnpjForn: Schema.String,
  nomeForn: Schema.String,
  anoEleicao: Schema.NullOr(Schema.Finite),
  sqCandidato: Schema.String,
  valor: Schema.NullOr(Schema.Finite),
  data: Schema.String,
  descricao: Schema.String,
  score: Schema.Finite,
});

const Rastro = Schema.Struct({
  cpfCnpjOrig: Schema.String,
  nomeOrig: Schema.String,
  tipoOrig: Schema.String,
  anoEleicao: Schema.NullOr(Schema.Finite),
  valorOriginario: Schema.NullOr(Schema.Finite),
  data: Schema.String,
  repassadorCpfCnpj: Schema.NullOr(Schema.String),
  repassadorNome: Schema.NullOr(Schema.String),
  sqCandidato: Schema.NullOr(Schema.String),
  valorRecebidoCandidato: Schema.NullOr(Schema.Finite),
  nomeCandidato: Schema.NullOr(Schema.String),
  cargoCandidato: Schema.NullOr(Schema.String),
  ufCandidato: Schema.NullOr(Schema.String),
  partidoCandidato: Schema.NullOr(Schema.String),
});

const candidatoColumns = `"sqCandidato", cpf, nome, "nomeUrna", "anoEleicao"::INTEGER AS "anoEleicao", "ufSigla",
  "cargoDescricao", "partidoSigla", "situacaoTurno"`;

const doacaoColumns = `"cpfCnpjDoador", "nomeDoador", "anoEleicao"::INTEGER AS "anoEleicao", "sqCandidato",
  valor::DOUBLE AS valor, data, natureza`;

const despesaColumns = `"cpfCnpjForn", "nomeForn", "anoEleicao"::INTEGER AS "anoEleicao", "sqCandidato",
  valor::DOUBLE AS valor, data, descricao`;

const anoClause = (ano: number | undefined) =>
  clause(`"anoEleicao" = ?`, Option.fromNullishOr(ano));

const makeTse = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const ranked = <S extends Schema.Top & { readonly DecodingServices: never }>(spec: {
    readonly schema: S;
    readonly table: DuckTable;
    readonly columns: string;
    readonly fuzzyName: string;
    readonly fuzzyColumn: string;
    readonly tie: string;
    readonly termo: string;
    readonly ano: number | undefined;
    readonly limit: number;
  }) =>
    Effect.gen(function* () {
      const query = normalize(spec.termo);
      const filter = conditions([anoClause(spec.ano)]);
      const exact = yield* duck.query(
        spec.schema,
        `SELECT ${spec.columns}, score
         FROM (SELECT *, ${bm25(spec.table)} AS score FROM ${spec.table.name})
         WHERE score IS NOT NULL${filter.sql} ORDER BY score DESC, ${spec.tie} LIMIT ?`,
        [query, ...filter.params, spec.limit]
      );
      const ids = Arr.isReadonlyArrayNonEmpty(exact)
        ? []
        : yield* fuzzy.match(spec.fuzzyName, query, { limit: spec.limit });
      const approximate = Arr.isReadonlyArrayNonEmpty(ids)
        ? yield* duck.query(
            spec.schema,
            `SELECT ${spec.columns}, 0::DOUBLE AS score FROM ${spec.table.name}
             WHERE ${inIds(spec.fuzzyColumn)}${filter.sql} ORDER BY ${spec.tie} LIMIT ?`,
            [idsParam(ids), ...filter.params, spec.limit]
          )
        : [];
      return Arr.isReadonlyArrayNonEmpty(exact) ? exact : approximate;
    });

  const buscarCandidato = (
    termo: string,
    options?: { readonly ano?: number; readonly limit?: number }
  ) =>
    ranked({
      schema: CandidatoHit,
      table: candidatoTable,
      columns: candidatoColumns,
      fuzzyName: "tse-candidato",
      fuzzyColumn: "id",
      tie: `"sqCandidato"`,
      termo,
      ano: options?.ano,
      limit: clamp(options?.limit, 20, 100),
    });

  const dueDiligenceCandidato = (input: {
    readonly cpf?: string;
    readonly sqCandidato?: string;
    readonly ano?: number;
  }) =>
    Effect.gen(function* () {
      const sq = Option.filter(Option.fromNullishOr(input.sqCandidato), (value) => value !== "");
      const cpf = Option.filter(Option.fromNullishOr(input.cpf), (value) => value !== "");
      yield* Match.value(Option.isSome(sq) || Option.isSome(cpf)).pipe(
        Match.when(false, () => Effect.fail(TseError.make({ code: "tse.MISSING_IDENTIFIER" }))),
        Match.orElse(() => Effect.void)
      );
      const filter = conditions([
        clause(`"sqCandidato" = ?`, sq),
        clause(
          `cpf = ?`,
          Option.map(
            Option.filter(cpf, () => Option.isNone(sq)),
            onlyDigits
          )
        ),
        anoClause(input.ano),
      ]);
      const candidaturas = yield* duck.query(
        Candidatura,
        `SELECT "sqCandidato", cpf, nome, "nomeUrna", "anoEleicao"::INTEGER AS "anoEleicao", "ufSigla",
           "cargoDescricao", "partidoSigla", "situacaoTurno", "dataNascimento", ocupacao
         FROM candidato WHERE true${filter.sql} ORDER BY "anoEleicao" DESC, "sqCandidato"`,
        filter.params
      );
      const sqs = pipe(
        candidaturas,
        Arr.map((c) => c.sqCandidato),
        Arr.filter((value) => value !== "")
      );
      const bens = Arr.isReadonlyArrayNonEmpty(sqs)
        ? yield* duck.query(
            Bem,
            `SELECT "sqCandidato", "anoEleicao"::INTEGER AS "anoEleicao", "tipoDescricao", descricao,
               valor::DOUBLE AS valor
             FROM bem WHERE ${inIds("sqCandidato")} ORDER BY valor DESC NULLS LAST, id`,
            [idsParam(sqs)]
          )
        : [];
      const totalBensDeclarado = Arr.reduce(bens, 0, (acc, item) => acc + (item.valor ?? 0));
      return { candidaturas, bens, totalBensDeclarado };
    });

  const enrichCandidato = <A extends { readonly sqCandidato: string }>(rows: readonly A[]) =>
    Effect.gen(function* () {
      const sqs = pipe(
        rows,
        Arr.map((row) => row.sqCandidato),
        Arr.filter((value) => value !== "")
      );
      const cands = Arr.isReadonlyArrayNonEmpty(sqs)
        ? yield* duck.query(
            CandidatoResumo,
            `SELECT "sqCandidato", nome, "cargoDescricao", "ufSigla", "partidoSigla"
             FROM candidato WHERE ${inIds("sqCandidato")}`,
            [idsParam(sqs)]
          )
        : [];
      return Arr.map(rows, (row) => {
        const found = Arr.findFirst(cands, (c) => c.sqCandidato === row.sqCandidato);
        return {
          ...row,
          nomeCandidato: Option.match(found, { onNone: () => null, onSome: (c) => c.nome }),
          cargoCandidato: Option.match(found, {
            onNone: () => null,
            onSome: (c) => c.cargoDescricao,
          }),
          ufCandidato: Option.match(found, { onNone: () => null, onSome: (c) => c.ufSigla }),
          partidoCandidato: Option.match(found, {
            onNone: () => null,
            onSome: (c) => c.partidoSigla,
          }),
        };
      });
    });

  const porDocumentoOuNome = <
    S extends Schema.Top & {
      readonly DecodingServices: never;
      readonly Type: { readonly sqCandidato: string };
    },
  >(spec: {
    readonly schema: S;
    readonly table: DuckTable;
    readonly columns: string;
    readonly docColumn: string;
    readonly fuzzyName: string;
    readonly termo: string;
    readonly ano: number | undefined;
    readonly limit: number;
  }) =>
    Effect.flatMap(
      Match.value(ehDocumento(spec.termo)).pipe(
        Match.when(true, () => {
          const filter = conditions([anoClause(spec.ano)]);
          return duck.query(
            spec.schema,
            `SELECT ${spec.columns}, coalesce(valor, 0)::DOUBLE AS score FROM ${spec.table.name}
           WHERE ${spec.docColumn} = ?${filter.sql} ORDER BY valor DESC NULLS LAST, id LIMIT ?`,
            [onlyDigits(spec.termo), ...filter.params, spec.limit]
          );
        }),
        Match.orElse(() =>
          ranked({ ...spec, fuzzyColumn: "busca", tie: `valor DESC NULLS LAST, id` })
        )
      ),
      enrichCandidato
    );

  const buscarDoacoes = (
    termo: string,
    options?: { readonly ano?: number; readonly limit?: number }
  ) =>
    porDocumentoOuNome({
      schema: DoacaoRow,
      table: receitaTable,
      columns: doacaoColumns,
      docColumn: `"cpfCnpjDoador"`,
      fuzzyName: "tse-receita",
      termo,
      ano: options?.ano,
      limit: clamp(options?.limit, 20, 100),
    });

  const buscarFornecedorCampanha = (
    termo: string,
    options?: { readonly ano?: number; readonly limit?: number }
  ) =>
    porDocumentoOuNome({
      schema: DespesaRow,
      table: despesaTable,
      columns: despesaColumns,
      docColumn: `"cpfCnpjForn"`,
      fuzzyName: "tse-despesa",
      termo,
      ano: options?.ano,
      limit: clamp(options?.limit, 20, 100),
    });

  const rastrearDoadorOriginario = (
    cpfCnpj: string,
    options?: { readonly ano?: number; readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const limit = clamp(options?.limit, 20, 100);
      const filter = conditions([clause(`o."anoEleicao" = ?`, Option.fromNullishOr(options?.ano))]);
      return yield* duck.query(
        Rastro,
        `SELECT
           o."cpfCnpjOrig", o."nomeOrig", o."tipoOrig", o."anoEleicao"::INTEGER AS "anoEleicao",
           o.valor::DOUBLE AS "valorOriginario", o.data,
           r."cpfCnpjDoador" AS "repassadorCpfCnpj", r."nomeDoador" AS "repassadorNome",
           r."sqCandidato", r.valor::DOUBLE AS "valorRecebidoCandidato",
           c.nome AS "nomeCandidato", c."cargoDescricao" AS "cargoCandidato",
           c."ufSigla" AS "ufCandidato", c."partidoSigla" AS "partidoCandidato"
         FROM receita_originario o
         LEFT JOIN receita r ON r."sqReceita" = o."sqReceita"
         LEFT JOIN candidato c ON c."sqCandidato" = r."sqCandidato"
         WHERE o."cpfCnpjOrig" = ?${filter.sql}
         ORDER BY o.valor DESC NULLS LAST LIMIT ?`,
        [onlyDigits(cpfCnpj), ...filter.params, limit]
      );
    });

  const writeBuscaFuzzy = (table: DuckTable, name: string) =>
    Effect.gen(function* () {
      const rows = yield* duck.query(
        Schema.Struct({ busca: Schema.String }),
        `SELECT DISTINCT busca FROM ${table.name} WHERE busca <> ''`
      );
      yield* fuzzy.write(
        name,
        Arr.map(rows, (row): readonly [string, string] => [row.busca, row.busca])
      );
    });

  const indexAnos = (anos: readonly number[]) =>
    Effect.gen(function* () {
      yield* Effect.forEach(
        [candidatoTable, bemTable, receitaTable, despesaTable, receitaOriginarioTable],
        (table) => duck.create(table),
        { concurrency: 1, discard: true }
      );
      yield* Effect.forEach(
        anos,
        (ano) =>
          Effect.gen(function* () {
            yield* indexCandidatos({ table: candidatoTable, ano });
            yield* indexBens({ table: bemTable, ano });
            yield* indexPrestacao({
              tables: {
                receita: receitaTable,
                despesa: despesaTable,
                originario: receitaOriginarioTable,
              },
              ano,
            });
          }),
        { concurrency: 1, discard: true }
      );
      yield* Effect.forEach(
        [candidatoTable, receitaTable, despesaTable],
        (table) => duck.reindex(table),
        { concurrency: 1, discard: true }
      );
      const candidatoRows = yield* duck.query(
        Schema.Struct({ id: Schema.String, busca: Schema.String }),
        `SELECT id, busca FROM candidato`
      );
      yield* fuzzy.write(
        "tse-candidato",
        Arr.map(candidatoRows, (row): readonly [string, string] => [row.id, row.busca])
      );
      yield* writeBuscaFuzzy(receitaTable, "tse-receita");
      yield* writeBuscaFuzzy(despesaTable, "tse-despesa");
      return {
        candidatos: yield* duck.count(candidatoTable),
        bens: yield* duck.count(bemTable),
        receitas: yield* duck.count(receitaTable),
        despesas: yield* duck.count(despesaTable),
        originarios: yield* duck.count(receitaOriginarioTable),
      };
    });

  const index = Effect.flatMap(Clock.currentTimeMillis, (millis) =>
    indexAnos([pipe(DateTime.makeUnsafe(millis), DateTime.getPartUtc("year"))])
  );

  return {
    index,
    indexAll: index,
    indexAnos,
    buscarCandidato,
    dueDiligenceCandidato,
    buscarDoacoes,
    buscarFornecedorCampanha,
    rastrearDoadorOriginario,
  };
});

export class TseEleitoral extends Context.Service<TseEleitoral, Effect.Success<typeof makeTse>>()(
  "dados-publicos-mcp/sources/tse-eleitoral/store/TseEleitoral"
) {}

export const TseEleitoralLive = Layer.effect(TseEleitoral)(makeTse);
