import * as Arr from "effect/Array";
import { Context, Effect, Layer, Schema, Struct } from "effect";
import { Duck } from "../../kernel/duck/duck";
import { onlyDigits } from "../../kernel/text/normalize";
import { convenioTable, ConvenioFlat } from "./catalog";
import { indexAll } from "./indexer";
import { clamp } from "../../kernel/duck/search";

const ConvenioView = ConvenioFlat.mapFields(Struct.omit(["busca"]));

const ConvenioHit = Schema.Struct({ ...ConvenioView.fields, score: Schema.Finite });

const viewSelect = `"nrConvenio", "idProposta", situacao, "dataPublicacao", "vigenciaInicio", "vigenciaFim", "valorGlobal", "valorRepasse", "cnpjProponente", "docNormalizado", "nomeProponente", uf, municipio, "codMunicipioIbge", "orgaoSuperior", orgao, objeto, modalidade`;

const makeTransferegov = Effect.gen(function* () {
  const duck = yield* Duck;

  const conveniosDoProponente = (documentoInput: string) =>
    Effect.gen(function* () {
      const docNormalizado = onlyDigits(documentoInput);
      const convenios = yield* duck.query(
        ConvenioView,
        `SELECT ${viewSelect} FROM convenio WHERE "docNormalizado" = ? ORDER BY "dataPublicacao" DESC NULLS LAST, id LIMIT 200`,
        [docNormalizado]
      );
      const total = Arr.reduce(convenios, 0, (sum, row) => sum + (row.valorRepasse ?? 0));
      return {
        documento: documentoInput,
        docNormalizado,
        count: convenios.length,
        totalRepasse: total,
        convenios,
      };
    });

  const conveniosDoMunicipio = (codIbge: string, limit: number) =>
    duck.query(
      ConvenioView,
      `SELECT ${viewSelect} FROM convenio WHERE "codMunicipioIbge" = ?
       ORDER BY "valorGlobal" DESC NULLS LAST, "nrConvenio" LIMIT ?`,
      [onlyDigits(codIbge), limit]
    );

  const buscarConvenio = (
    termo: string,
    options?: { readonly uf?: string; readonly limit?: number }
  ) =>
    duck.ranked(ConvenioHit, convenioTable, {
      select: viewSelect,
      tie: "id",
      termo,
      uf: options?.uf,
      limit: clamp(options?.limit, 50, 200),
    });

  const index = Effect.gen(function* () {
    yield* duck.create(convenioTable);
    const inserted = yield* indexAll;
    yield* duck.reindex(convenioTable);
    return { inserted, total: yield* duck.count(convenioTable) };
  });

  return {
    index,
    indexAll: index,
    conveniosDoProponente,
    conveniosDoMunicipio,
    buscarConvenio,
  };
});

export class Transferegov extends Context.Service<
  Transferegov,
  Effect.Success<typeof makeTransferegov>
>()("dados-publicos-mcp/sources/transferegov/store/Transferegov") {}

export const TransferegovLive = Layer.effect(Transferegov)(makeTransferegov);
