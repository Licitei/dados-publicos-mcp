import { Context, Effect, Layer, Option, pipe, Schema, Struct } from "effect";
import * as Arr from "effect/Array";
import * as Str from "effect/String";
import { Duck, idsParam } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { sancaoTable, SancaoFlat } from "./catalog";
import { indexSnapshots } from "./indexer";
import {
  castIds,
  clamp,
  countBy,
  lexicalOrFuzzy,
  scoredFrom,
  tipoDocumento as tipoDocumentoOf,
} from "../../kernel/duck/search";

const SancaoView = SancaoFlat.mapFields(Struct.omit(["busca"]));

const NameHit = Schema.Struct({ ...SancaoView.fields, id: Schema.Finite, score: Schema.Finite });

const VigenteHit = Schema.Struct({ ...SancaoView.fields, score: Schema.NullOr(Schema.String) });

const viewSelect = `lista, codigo, "tipoPessoa", documento, "docNormalizado", nome, "razaoSocial", categoria, "numeroProcesso", "valorMulta", "dataInicio", "dataFinal", "dataPublicacao", "orgaoSancionador", "ufOrgao", fundamentacao`;

const impeditivas = new Set(["ceis", "cnep", "cepim"]);

const makeSancoesCgu = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const verificar = (documentoInput: string) =>
    Effect.gen(function* () {
      const docNormalizado = onlyDigits(documentoInput);
      const tipoDocumento = tipoDocumentoOf(docNormalizado);
      const sancoes = yield* duck.query(
        SancaoView,
        `SELECT ${viewSelect} FROM sancao WHERE "docNormalizado" = ? ORDER BY "dataInicio" DESC NULLS LAST, id`,
        [docNormalizado]
      );
      const porLista = countBy(sancoes, (row) => row.lista);
      return {
        documento: documentoInput,
        docNormalizado,
        tipoDocumento,
        sancionado: sancoes.length > 0,
        inidoneoOuImpedido: pipe(
          sancoes,
          Arr.some((row) => impeditivas.has(row.lista))
        ),
        total: sancoes.length,
        porLista,
        sancoes,
      };
    });

  const buscarPorNome = (nome: string, options?: { readonly limit?: number }) =>
    Effect.gen(function* () {
      const q = normalize(nome);
      const limit = clamp(options?.limit, 50, 100);
      const rows = yield* Str.isNonEmpty(q)
        ? lexicalOrFuzzy(
            duck.query(
              NameHit,
              `SELECT id::DOUBLE AS id, ${viewSelect}, score ${scoredFrom(sancaoTable)} ORDER BY score DESC, id LIMIT ?`,
              [q, limit]
            ),
            fuzzy.match("sancao", q, { limit }),
            (ids) =>
              duck.query(
                NameHit,
                `SELECT id::DOUBLE AS id, ${viewSelect}, 0::DOUBLE AS score FROM sancao WHERE ${castIds}`,
                [idsParam(ids)]
              ),
            (row) => row.id
          )
        : Effect.succeed([]);
      return Arr.map(rows, Struct.omit(["id"]));
    });

  const vigentesNaData = (
    data: string,
    options?: { readonly lista?: string; readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const iso = Str.trim(data);
      const limit = clamp(options?.limit, 200, 500);
      const lista = Option.fromNullishOr(options?.lista);
      return yield* duck.query(
        VigenteHit,
        `SELECT ${viewSelect}, "dataInicio" AS score
         FROM sancao
         WHERE "dataInicio" IS NOT NULL
           AND "dataInicio" <= ?
           AND ("dataFinal" IS NULL OR "dataFinal" = '' OR "dataFinal" >= ?)
           ${Option.isSome(lista) ? "AND lista = ?" : ""}
         ORDER BY "dataInicio" DESC, id
         LIMIT ?`,
        [iso, iso, ...Option.match(lista, { onNone: () => [], onSome: (value) => [value] }), limit]
      );
    });

  const index = Effect.gen(function* () {
    yield* duck.create(sancaoTable);
    const inserted = yield* indexSnapshots;
    yield* duck.reindex(sancaoTable);
    const names = yield* duck.query(
      Schema.Struct({ id: Schema.Finite, busca: Schema.String }),
      `SELECT id::DOUBLE AS id, busca FROM sancao`
    );
    yield* fuzzy.write(
      "sancao",
      Arr.map(names, (row): readonly [number, string] => [row.id, row.busca])
    );
    return { inserted, total: yield* duck.count(sancaoTable) };
  });

  return { index, indexAll: index, verificar, buscarPorNome, vigentesNaData };
});

export class SancoesCgu extends Context.Service<
  SancoesCgu,
  Effect.Success<typeof makeSancoesCgu>
>()("dados-publicos-mcp/sources/sancoes-cgu/store/SancoesCgu") {}

export const SancoesCguLive = Layer.effect(SancoesCgu)(makeSancoesCgu);
