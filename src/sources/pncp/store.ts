import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Order from "effect/Order";
import * as Str from "effect/String";
import { Clock, Context, Effect, Layer, Match, Option, Schema } from "effect";
import {
  bm25,
  Duck,
  type DuckParam,
  type DuckTable,
  idsParam,
  inIds,
} from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import {
  ataTable,
  contratacaoTable,
  contratoFornecedorTable,
  contratoTable,
  defaultModalidades,
  defaultWindowStart,
  PncpError,
  ymd,
} from "./catalog";
import { indexAtas, indexContratacoes, indexContratos } from "./indexer";
import { clamp, preferExact } from "../../kernel/duck/search";

const NullableString = Schema.NullOr(Schema.String);
const NullableNumber = Schema.NullOr(Schema.Finite);

const ContratacaoRow = Schema.Struct({
  numeroControlePNCP: Schema.String,
  objetoCompra: NullableString,
  modalidadeId: NullableNumber,
  modalidadeNome: NullableString,
  situacaoCompraNome: NullableString,
  valorTotalEstimado: NullableNumber,
  dataPublicacaoPncp: NullableString,
  dataAberturaProposta: NullableString,
  dataEncerramentoProposta: NullableString,
  orgaoCnpj: NullableString,
  orgaoRazaoSocial: NullableString,
  ufSigla: NullableString,
  municipioNome: NullableString,
  codigoIbge: NullableString,
  srp: Schema.NullOr(Schema.Boolean),
});

const ContratacaoHit = Schema.Struct({
  ...ContratacaoRow.fields,
  anoCompra: NullableNumber,
  valorTotalHomologado: NullableNumber,
  score: Schema.Finite,
});

const ContratoRow = Schema.Struct({
  numeroControlePNCP: Schema.String,
  objetoContrato: NullableString,
  niFornecedor: NullableString,
  nomeRazaoSocialFornecedor: NullableString,
  valorInicial: NullableNumber,
  valorGlobal: NullableNumber,
  valorAcumulado: NullableNumber,
  dataAssinatura: NullableString,
  dataVigenciaInicio: NullableString,
  dataVigenciaFim: NullableString,
  orgaoCnpj: NullableString,
  orgaoRazaoSocial: NullableString,
  ufSigla: NullableString,
  tipoContrato: NullableString,
  anoContrato: NullableNumber,
});

const ContratoHit = Schema.Struct({
  ...ContratoRow.fields,
  tipoPessoa: NullableString,
  score: Schema.Finite,
});

const AtaHit = Schema.Struct({
  numeroControlePNCPAta: Schema.String,
  numeroControlePNCPCompra: NullableString,
  anoAta: NullableNumber,
  numeroAtaRegistroPreco: NullableString,
  objetoContratacao: NullableString,
  vigenciaInicio: NullableString,
  vigenciaFim: NullableString,
  cnpjOrgao: NullableString,
  nomeOrgao: NullableString,
  codigoUnidadeOrgao: NullableString,
  ufSigla: NullableString,
  score: Schema.Finite,
});

const FornecedorHit = Schema.Struct({
  numeroControlePNCP: Schema.String,
  niFornecedor: NullableString,
  nomeRazaoSocialFornecedor: NullableString,
  objetoContrato: NullableString,
  valorGlobal: NullableNumber,
  valorInicial: NullableNumber,
  ufSigla: NullableString,
  orgaoCnpj: NullableString,
  orgaoRazaoSocial: NullableString,
  score: Schema.Finite,
});

const FornecedorCorpus = Schema.Struct({
  numeroControlePNCP: Schema.String,
  buscaFornecedor: Schema.String,
});

const contratacaoColumns = Arr.join(
  [
    `"numeroControlePNCP"`,
    `"anoCompra"`,
    `"objetoCompra"`,
    `"modalidadeId"`,
    `"modalidadeNome"`,
    `"situacaoCompraNome"`,
    `"valorTotalEstimado"`,
    `"valorTotalHomologado"`,
    `"dataPublicacaoPncp"`,
    `"dataAberturaProposta"`,
    `"dataEncerramentoProposta"`,
    `"orgaoCnpj"`,
    `"orgaoRazaoSocial"`,
    `"codigoIbge"`,
    `"municipioNome"`,
    `"ufSigla"`,
    `srp`,
  ],
  ", "
);

const contratoColumns = Arr.join(
  [
    `"numeroControlePNCP"`,
    `"anoContrato"`,
    `"objetoContrato"`,
    `"niFornecedor"`,
    `"tipoPessoa"`,
    `"nomeRazaoSocialFornecedor"`,
    `"valorInicial"`,
    `"valorGlobal"`,
    `"valorAcumulado"`,
    `"dataAssinatura"`,
    `"dataVigenciaInicio"`,
    `"dataVigenciaFim"`,
    `"orgaoCnpj"`,
    `"orgaoRazaoSocial"`,
    `"ufSigla"`,
    `"tipoContrato"`,
  ],
  ", "
);

const ataColumns = Arr.join(
  [
    `"numeroControlePNCPAta"`,
    `"numeroControlePNCPCompra"`,
    `"anoAta"`,
    `"numeroAtaRegistroPreco"`,
    `"objetoContratacao"`,
    `"vigenciaInicio"`,
    `"vigenciaFim"`,
    `"cnpjOrgao"`,
    `"nomeOrgao"`,
    `"codigoUnidadeOrgao"`,
    `"ufSigla"`,
  ],
  ", "
);

const fornecedorColumns = Arr.join(
  [
    `c."numeroControlePNCP"`,
    `c."niFornecedor"`,
    `c."nomeRazaoSocialFornecedor"`,
    `c."objetoContrato"`,
    `c."valorGlobal"`,
    `c."valorInicial"`,
    `c."ufSigla"`,
    `c."orgaoCnpj"`,
    `c."orgaoRazaoSocial"`,
  ],
  ", "
);

const TaggedHit = Schema.Union([
  Schema.Struct({ tipo: Schema.Literal("contratacao"), ...ContratacaoHit.fields }),
  Schema.Struct({ tipo: Schema.Literal("contrato"), ...ContratoHit.fields }),
  Schema.Struct({ tipo: Schema.Literal("ata"), ...AtaHit.fields }),
]);
type TaggedHit = (typeof TaggedHit)["Type"];

type Filter = readonly [clause: string, param: DuckParam];

const present = (value: string | undefined, normalizeValue: (raw: string) => string) =>
  pipe(Option.fromNullishOr(value), Option.map(normalizeValue), Option.filter(Str.isNonEmpty));

const filterOf = (column: string, value: Option.Option<DuckParam>) =>
  Option.map(value, (param): Filter => [`"${column}" = ?`, param]);

const ufFilter = (uf: string | undefined) =>
  filterOf(
    "ufSigla",
    present(uf, (raw) => pipe(raw, Str.trim, Str.toUpperCase))
  );

const orgaoFilter = (column: string, orgaoCnpj: string | undefined) =>
  filterOf(column, present(orgaoCnpj, onlyDigits));

const municipioFilter = (municipio: string | undefined) =>
  filterOf("codigoIbge", present(municipio, Str.trim));

const modalidadeFilter = (modalidade: number | undefined) =>
  filterOf("modalidadeId", Option.fromNullishOr(modalidade));

const clausesOf = (filters: readonly Option.Option<Filter>[]) => {
  const found = Arr.getSomes(filters);
  return {
    sql: pipe(
      found,
      Arr.map(([clause]) => ` AND ${clause}`),
      Arr.join("")
    ),
    params: Arr.map(found, ([, param]): DuckParam => param),
  };
};

const makePncp = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const ranked = <S extends Schema.Top & { readonly DecodingServices: never }>(
    spec: {
      readonly table: DuckTable;
      readonly schema: S;
      readonly columns: string;
    },
    q: string,
    filters: readonly Option.Option<Filter>[],
    limit: number
  ) => {
    const clauses = clausesOf(filters);
    return Str.isEmpty(q)
      ? Effect.succeed([])
      : duck.query(
          spec.schema,
          `SELECT ${spec.columns}, score
           FROM (SELECT *, ${bm25(spec.table)} AS score FROM ${spec.table.name})
           WHERE score IS NOT NULL${clauses.sql}
           ORDER BY score DESC, "${spec.table.key}" LIMIT ?`,
          [q, ...clauses.params, limit]
        );
  };

  const buscarPncp = (input: {
    readonly termo: string;
    readonly tipo?: "contratacao" | "contrato" | "ata" | "todas";
    readonly uf?: string;
    readonly municipio?: string;
    readonly orgaoCnpj?: string;
    readonly modalidade?: number;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const q = normalize(input.termo);
      const limit = clamp(input.limit, 20, 100);

      const rrfContratacao = ranked(
        { table: contratacaoTable, schema: ContratacaoHit, columns: contratacaoColumns },
        q,
        [
          ufFilter(input.uf),
          orgaoFilter("orgaoCnpj", input.orgaoCnpj),
          municipioFilter(input.municipio),
          modalidadeFilter(input.modalidade),
        ],
        limit
      );

      const rrfContrato = ranked(
        { table: contratoTable, schema: ContratoHit, columns: contratoColumns },
        q,
        [
          ufFilter(input.uf),
          orgaoFilter("orgaoCnpj", input.orgaoCnpj),
          municipioFilter(input.municipio),
        ],
        limit
      );

      const rrfAta = ranked(
        { table: ataTable, schema: AtaHit, columns: ataColumns },
        q,
        [ufFilter(input.uf), orgaoFilter("cnpjOrgao", input.orgaoCnpj)],
        limit
      );

      const tagged =
        <T extends TaggedHit["tipo"]>(tipo: T) =>
        <A extends object>(rows: readonly A[]) =>
          Arr.map(rows, (row) => ({ ...row, tipo }));

      const contratacoes = Effect.map(rrfContratacao, tagged("contratacao"));
      const contratos = Effect.map(rrfContrato, tagged("contrato"));
      const atas = Effect.map(rrfAta, tagged("ata"));

      const todas = Effect.all([contratacoes, contratos, atas], { concurrency: 2 }).pipe(
        Effect.map(([a, b, c]) =>
          pipe(
            [...a, ...b, ...c],
            Arr.sort(Order.mapInput(Order.flip(Order.Number), (row: TaggedHit) => row.score)),
            Arr.take(limit)
          )
        )
      );

      return yield* Match.value(input.tipo).pipe(
        Match.when("contratacao", () => contratacoes),
        Match.when("contrato", () => contratos),
        Match.when("ata", () => atas),
        Match.orElse(() => todas)
      );
    });

  const fornecedoresPorBusca = (q: string, limit: number) =>
    Effect.gen(function* () {
      const exact = yield* duck.query(
        FornecedorHit,
        `SELECT ${fornecedorColumns}, h.score
         FROM (SELECT "numeroControlePNCP", ${bm25(contratoFornecedorTable)} AS score FROM contrato_fornecedor) h
         JOIN contrato c ON c."numeroControlePNCP" = h."numeroControlePNCP"
         WHERE h.score IS NOT NULL
         ORDER BY h.score DESC, c."numeroControlePNCP" LIMIT ?`,
        [q, limit]
      );
      const ids = Arr.isReadonlyArrayNonEmpty(exact)
        ? []
        : yield* fuzzy.match("pncp_fornecedor", q, { limit });
      const approximate = Arr.isReadonlyArrayNonEmpty(ids)
        ? yield* duck.query(
            FornecedorHit,
            `SELECT ${fornecedorColumns}, 0::DOUBLE AS score FROM contrato c WHERE ${inIds("numeroControlePNCP")}`,
            [idsParam(ids)]
          )
        : [];
      return preferExact(exact, ids, approximate, (row) => row.numeroControlePNCP);
    });

  const fornecedorPncpPorNome = (nome: string, options?: { readonly limit?: number }) =>
    Effect.gen(function* () {
      const q = normalize(nome);
      const limit = clamp(options?.limit, 20, 100);
      return yield* Match.value(q.length).pipe(
        Match.when(0, () => Effect.fail(PncpError.make({ code: "pncp.MISSING_FORNECEDOR" }))),
        Match.orElse(() => fornecedoresPorBusca(q, limit))
      );
    });

  const contratosDoFornecedor = (input: {
    readonly niFornecedor: string;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const alvo = onlyDigits(input.niFornecedor);
      const limit = clamp(input.limit, 50, 500);
      return yield* Match.value(alvo.length).pipe(
        Match.when(0, () => Effect.fail(PncpError.make({ code: "pncp.MISSING_NI" }))),
        Match.orElse(() =>
          duck.query(
            ContratoRow,
            `SELECT ${contratoColumns} FROM contrato WHERE "niFornecedor" = ?
             ORDER BY "valorGlobal" DESC NULLS LAST, "numeroControlePNCP" LIMIT ?`,
            [alvo, limit]
          )
        )
      );
    });

  const alertasPncp = (options?: {
    readonly uf?: string;
    readonly modalidade?: number;
    readonly dataInicial?: string;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const limit = clamp(options?.limit, 50, 500);
      const clauses = clausesOf([
        ufFilter(options?.uf),
        modalidadeFilter(options?.modalidade),
        Option.map(
          present(options?.dataInicial, (raw) => raw),
          (value): Filter => [`"dataPublicacaoPncp" >= ?`, value]
        ),
      ]);
      return yield* duck.query(
        ContratacaoRow,
        `SELECT ${contratacaoColumns} FROM contratacao WHERE true${clauses.sql}
         ORDER BY "dataPublicacaoPncp" DESC NULLS LAST, "numeroControlePNCP" LIMIT ?`,
        [...clauses.params, limit]
      );
    });

  const indexScope = (scope: {
    readonly dataInicial: string;
    readonly dataFinal: string;
    readonly modalidades: readonly number[];
  }) =>
    Effect.gen(function* () {
      yield* Effect.forEach(
        [contratacaoTable, contratoTable, contratoFornecedorTable, ataTable],
        (table) => duck.create(table),
        { concurrency: 1, discard: true }
      );
      yield* indexContratacoes(scope);
      yield* indexContratos({
        dataInicial: scope.dataInicial,
        dataFinal: scope.dataFinal,
      });
      yield* indexAtas({
        dataInicial: scope.dataInicial,
        dataFinal: scope.dataFinal,
      });
      yield* Effect.forEach(
        [contratacaoTable, contratoTable, contratoFornecedorTable, ataTable],
        (table) => duck.reindex(table),
        { concurrency: 1, discard: true }
      );
      const corpus = yield* duck.query(
        FornecedorCorpus,
        `SELECT "numeroControlePNCP", "buscaFornecedor" FROM contrato_fornecedor`
      );
      yield* fuzzy.write(
        "pncp_fornecedor",
        Arr.map(corpus, (row): readonly [string, string] => [
          row.numeroControlePNCP,
          row.buscaFornecedor,
        ])
      );
      return {
        contratacoes: yield* duck.count(contratacaoTable),
        contratos: yield* duck.count(contratoTable),
        atas: yield* duck.count(ataTable),
      };
    });

  const index = Effect.flatMap(Clock.currentTimeMillis, (millis) =>
    indexScope({
      dataInicial: defaultWindowStart(millis),
      dataFinal: ymd(millis),
      modalidades: [...defaultModalidades],
    })
  );

  return {
    index,
    indexAll: index,
    indexScope,
    buscarPncp,
    fornecedorPncpPorNome,
    contratosDoFornecedor,
    alertasPncp,
  };
});

export class Pncp extends Context.Service<Pncp, Effect.Success<typeof makePncp>>()(
  "dados-publicos-mcp/sources/pncp/store/Pncp"
) {}

export const PncpLive = Layer.effect(Pncp)(makePncp);
