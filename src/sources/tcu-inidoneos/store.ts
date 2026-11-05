import { Context, Effect, Layer, Schema, Struct } from "effect";
import * as Arr from "effect/Array";
import * as Str from "effect/String";
import { Duck, idsParam } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { tcuInidoneoTable, TcuInidoneoFlat } from "./catalog";
import { indexAll } from "./indexer";
import {
  castIds,
  clamp,
  countBy,
  lexicalOrFuzzy,
  scoredFrom,
  tipoDocumento as tipoDocumentoOf,
} from "../../kernel/duck/search";

const InidoneoView = TcuInidoneoFlat.mapFields(Struct.omit(["busca"]));

const NameHit = Schema.Struct({ ...InidoneoView.fields, id: Schema.Finite, score: Schema.Finite });

const viewSelect = `lista, nome, documento, "docNormalizado", processo, deliberacao, "dataTransitoJulgado", "dataFinal", "dataAcordao", uf, municipio`;

const makeTcuInidoneos = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const verificar = (documentoInput: string) =>
    Effect.gen(function* () {
      const docNormalizado = onlyDigits(documentoInput);
      const tipoDocumento = tipoDocumentoOf(docNormalizado);
      const registros = yield* duck.query(
        InidoneoView,
        `SELECT ${viewSelect} FROM tcu_inidoneo WHERE "docNormalizado" = ? ORDER BY "dataTransitoJulgado" DESC NULLS LAST, id`,
        [docNormalizado]
      );
      const porLista = countBy(registros, (row) => row.lista);
      return {
        documento: documentoInput,
        docNormalizado,
        tipoDocumento,
        inidoneo: registros.length > 0,
        total: registros.length,
        porLista,
        registros,
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
              `SELECT id::DOUBLE AS id, ${viewSelect}, score ${scoredFrom(tcuInidoneoTable)} ORDER BY score DESC, id LIMIT ?`,
              [q, limit]
            ),
            fuzzy.match("tcu_inidoneo", q, { limit }),
            (ids) =>
              duck.query(
                NameHit,
                `SELECT id::DOUBLE AS id, ${viewSelect}, 0::DOUBLE AS score FROM tcu_inidoneo WHERE ${castIds}`,
                [idsParam(ids)]
              ),
            (row) => row.id
          )
        : Effect.succeed([]);
      return Arr.map(rows, Struct.omit(["id"]));
    });

  const index = Effect.gen(function* () {
    yield* duck.create(tcuInidoneoTable);
    const inserted = yield* indexAll;
    yield* duck.reindex(tcuInidoneoTable);
    const names = yield* duck.query(
      Schema.Struct({ id: Schema.Finite, busca: Schema.String }),
      `SELECT id::DOUBLE AS id, busca FROM tcu_inidoneo`
    );
    yield* fuzzy.write(
      "tcu_inidoneo",
      Arr.map(names, (row): readonly [number, string] => [row.id, row.busca])
    );
    return { inserted, total: yield* duck.count(tcuInidoneoTable) };
  });

  return { index, indexAll: index, verificar, buscarPorNome };
});

export class TcuInidoneos extends Context.Service<
  TcuInidoneos,
  Effect.Success<typeof makeTcuInidoneos>
>()("dados-publicos-mcp/sources/tcu-inidoneos/store/TcuInidoneos") {}

export const TcuInidoneosLive = Layer.effect(TcuInidoneos)(makeTcuInidoneos);
