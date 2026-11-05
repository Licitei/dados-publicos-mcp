import { Context, Effect, Layer, Schema, Struct } from "effect";
import { Duck } from "../../kernel/duck/duck";
import { onlyDigits } from "../../kernel/text/normalize";
import { despesaFederalTable, toAnoMes, DespesaFederalFlat } from "./catalog";
import { defaultAnoMes, indexMes } from "./indexer";
import { clamp } from "../../kernel/duck/search";

const DespesaView = DespesaFederalFlat.mapFields(Struct.omit(["busca"]));

const DespesaHit = Schema.Struct({ ...DespesaView.fields, score: Schema.Finite });

const viewSelect = `"anoMes", "codOrgaoSuperior", "nomeOrgaoSuperior", "codOrgao", "nomeOrgao", "codFuncao", "nomeFuncao", "codPrograma", "nomePrograma", "codAcao", "nomeAcao", uf, municipio, "nomeElemento", "valorEmpenhado", "valorLiquidado", "valorPago"`;

const makeTransparenciaDespesas = Effect.gen(function* () {
  const duck = yield* Duck;

  const despesasPorOrgao = (codOrgaoSuperior: string, limit: number) =>
    duck.query(
      DespesaView,
      `SELECT ${viewSelect} FROM despesa_federal WHERE "codOrgaoSuperior" = ?
       ORDER BY "valorPago" DESC NULLS LAST, "codAcao", id LIMIT ?`,
      [onlyDigits(codOrgaoSuperior), limit]
    );

  const buscarDespesa = (
    termo: string,
    options?: { readonly uf?: string; readonly limit?: number }
  ) =>
    duck.ranked(DespesaHit, despesaFederalTable, {
      select: viewSelect,
      tie: "id",
      termo,
      uf: options?.uf,
      limit: clamp(options?.limit, 50, 200),
    });

  const indexMesParam = (anoMes: string) =>
    Effect.gen(function* () {
      yield* duck.create(despesaFederalTable);
      const inserted = yield* indexMes(anoMes);
      yield* duck.reindex(despesaFederalTable);
      return { anoMes, inserted, total: yield* duck.count(despesaFederalTable) };
    });

  const index = Effect.gen(function* () {
    const anoMes = yield* defaultAnoMes;
    return yield* indexMesParam(anoMes);
  });

  return {
    index,
    indexMes: (mes: string) => indexMesParam(toAnoMes(mes)),
    despesasPorOrgao,
    buscarDespesa,
  };
});

export class TransparenciaDespesas extends Context.Service<
  TransparenciaDespesas,
  Effect.Success<typeof makeTransparenciaDespesas>
>()("dados-publicos-mcp/sources/transparencia-despesas/store/TransparenciaDespesas") {}

export const TransparenciaDespesasLive =
  Layer.effect(TransparenciaDespesas)(makeTransparenciaDespesas);
