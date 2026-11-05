import { Context, Effect, Layer, Match, Option, pipe, Schema, Struct } from "effect";
import * as Arr from "effect/Array";
import * as Str from "effect/String";
import { Duck, idsParam, type DuckParam } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { fornecedorTable, FornecedorFlat } from "./catalog";
import { indexFornecedores } from "./indexer";
import { castIds, clamp, lexicalOrFuzzy, scoredFrom } from "../../kernel/duck/search";

const FornecedorView = FornecedorFlat.mapFields(Struct.omit(["busca", "nomeMunicipioNormalizado"]));

const FornecedorHit = Schema.Struct({
  ...FornecedorView.fields,
  id: Schema.Finite,
  score: Schema.Finite,
});

const viewSelect = `cnpj, cpf, "nomeRazaoSocial", ativo, "habilitadoLicitar", "ufSigla", "nomeMunicipio", "codigoCnae"::INTEGER AS "codigoCnae", "nomeCnae", "naturezaJuridicaNome", "porteEmpresaNome"`;

type Filter = readonly [clause: string, params: ReadonlyArray<DuckParam>];

const makeSicaf = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const buscar = (options: {
    readonly nome: string;
    readonly apenasAtivos?: boolean;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const q = normalize(options.nome);
      const limit = clamp(options.limit, 20, 100);
      const ativoAnd = options.apenasAtivos === true ? "AND ativo" : "";
      const rows = yield* Str.isNonEmpty(q)
        ? lexicalOrFuzzy(
            duck.query(
              FornecedorHit,
              `SELECT id::DOUBLE AS id, ${viewSelect}, score ${scoredFrom(fornecedorTable)} ${ativoAnd}
               ORDER BY score DESC, cnpj LIMIT ?`,
              [q, limit]
            ),
            fuzzy.match("fornecedor", q, { limit }),
            (ids) =>
              duck.query(
                FornecedorHit,
                `SELECT id::DOUBLE AS id, ${viewSelect}, 0::DOUBLE AS score FROM fornecedor WHERE ${castIds} ${ativoAnd}`,
                [idsParam(ids)]
              ),
            (row) => row.id
          )
        : Effect.succeed([]);
      return Arr.map(rows, Struct.omit(["id"]));
    });

  const habilitado = (cnpjInput: string) =>
    Effect.gen(function* () {
      const cnpj = onlyDigits(cnpjInput);
      const rows = yield* duck.query(
        FornecedorView,
        `SELECT ${viewSelect} FROM fornecedor WHERE cnpj = ? LIMIT 1`,
        [cnpj]
      );
      return Option.match(Arr.head(rows), {
        onNone: () => ({
          cnpj,
          encontrado: false,
          ativo: false,
          habilitadoLicitar: false,
          fornecedor: null,
        }),
        onSome: (found) => ({
          cnpj,
          encontrado: true,
          ativo: found.ativo,
          habilitadoLicitar: found.habilitadoLicitar,
          fornecedor: found,
        }),
      });
    });

  const listar = (options: {
    readonly uf?: string;
    readonly municipio?: string;
    readonly cnae?: number;
    readonly apenasAtivos?: boolean;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const limit = clamp(options.limit, 50, 500);
      const filters: ReadonlyArray<Filter> = [
        ...Match.value(options.uf).pipe(
          Match.when(Match.string, (uf): ReadonlyArray<Filter> => [
            [`"ufSigla" = ?`, [pipe(uf, Str.trim, Str.toUpperCase)]],
          ]),
          Match.orElse(() => [])
        ),
        ...Match.value(options.cnae).pipe(
          Match.when(Match.number, (cnae): ReadonlyArray<Filter> => [[`"codigoCnae" = ?`, [cnae]]]),
          Match.orElse(() => [])
        ),
        ...Match.value(options.municipio).pipe(
          Match.when(Match.string, (municipio): ReadonlyArray<Filter> => [
            [`"nomeMunicipioNormalizado" LIKE ?`, [`%${normalize(municipio)}%`]],
          ]),
          Match.orElse(() => [])
        ),
        ...Match.value(options.apenasAtivos).pipe(
          Match.when(true, (): ReadonlyArray<Filter> => [[`ativo`, []]]),
          Match.orElse(() => [])
        ),
      ];
      const where = Arr.isReadonlyArrayNonEmpty(filters)
        ? `WHERE ${pipe(
            filters,
            Arr.map(([clause]) => clause),
            Arr.join(" AND ")
          )}`
        : "";
      const params = Arr.flatMap(filters, ([, values]) => values);
      return yield* duck.query(
        FornecedorView,
        `SELECT ${viewSelect} FROM fornecedor ${where} ORDER BY "nomeRazaoSocial" NULLS FIRST, cnpj LIMIT ?`,
        [...params, limit]
      );
    });

  const index = Effect.gen(function* () {
    yield* duck.create(fornecedorTable);
    yield* indexFornecedores;
    yield* duck.reindex(fornecedorTable);
    const names = yield* duck.query(
      Schema.Struct({ id: Schema.Finite, busca: Schema.String }),
      `SELECT id::DOUBLE AS id, busca FROM fornecedor`
    );
    yield* fuzzy.write(
      "fornecedor",
      Arr.map(names, (row): readonly [number, string] => [row.id, row.busca])
    );
    return yield* duck.count(fornecedorTable);
  });

  return { index, indexAll: index, buscar, habilitado, listar };
});

export class Sicaf extends Context.Service<Sicaf, Effect.Success<typeof makeSicaf>>()(
  "dados-publicos-mcp/sources/sicaf-fornecedores/store/Sicaf"
) {}

export const SicafLive = Layer.effect(Sicaf)(makeSicaf);
