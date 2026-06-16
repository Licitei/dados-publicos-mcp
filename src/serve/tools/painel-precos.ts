import { Effect, Schema } from "effect";
import { PainelPrecos } from "../../sources/painel-precos/store";
import { NonEmptyString, positiveIntMax, Uf } from "../checks";
import { defineTool } from "../tool";

const ItemInput = Schema.Struct({
  codigoItemCatalogo: NonEmptyString,
  uf: Schema.optional(Uf),
  limite: Schema.optional(positiveIntMax(500)),
});

const precoPraticadoItem = defineTool({
  name: "preco_praticado_item",
  description:
    "Lista amostras de precos praticados em compras federais (Painel de Precos) para um codigo CATMAT, com fornecedor, orgao, UF e data; opcionalmente filtra por UF.",
  input: ItemInput,
  run: (args) =>
    PainelPrecos.pipe(
      Effect.flatMap((service) =>
        service.precoPorItem(args.codigoItemCatalogo, {
          uf: args.uf,
          limit: args.limite,
        })
      )
    ),
});

const EstatisticaInput = Schema.Struct({
  codigoItemCatalogo: NonEmptyString,
  uf: Schema.optional(Uf),
});

const estatisticaPreco = defineTool({
  name: "estatistica_preco_item",
  description:
    "Retorna estatistica de preco (n, minimo, mediana, media, maximo) das compras federais para um codigo CATMAT - referencia preliminar para pesquisa de precos.",
  input: EstatisticaInput,
  run: (args) =>
    PainelPrecos.pipe(
      Effect.flatMap((service) =>
        service.estatisticaPreco(args.codigoItemCatalogo, { uf: args.uf })
      )
    ),
});

const BuscarInput = Schema.Struct({
  termo: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  limite: Schema.optional(positiveIntMax(200)),
});

const buscarPrecoPorDescricao = defineTool({
  name: "buscar_preco_por_descricao",
  description:
    "Busca precos praticados em compras federais por descricao do item (BM25), retornando amostras com preco unitario e fornecedor.",
  input: BuscarInput,
  run: (args) =>
    PainelPrecos.pipe(
      Effect.flatMap((service) =>
        service.buscarPrecoPorDescricao(args.termo, { limit: args.limite })
      )
    ),
});

export const painelPrecosTools = [
  precoPraticadoItem,
  estatisticaPreco,
  buscarPrecoPorDescricao,
] as const;
