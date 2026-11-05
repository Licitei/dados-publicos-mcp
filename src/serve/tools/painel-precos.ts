import { Effect, Schema, Struct } from "effect";
import { PainelPrecos } from "../../sources/painel-precos/store";
import { NonEmptyString, positiveIntMax, Uf } from "../checks";
import { defineTool } from "../tool";

const ItemInput = Schema.Struct({
  codigoItemCatalogo: NonEmptyString,
  uf: Schema.optionalKey(Uf),
  limite: Schema.optionalKey(positiveIntMax(500)),
});

const precoPraticadoItem = defineTool({
  name: "preco_praticado_item",
  description:
    "Lista amostras de precos praticados em compras federais (Painel de Precos) para um codigo CATMAT, com fornecedor, orgao, UF e data; opcionalmente filtra por UF.",
  input: ItemInput,
  run: (args) =>
    PainelPrecos.pipe(
      Effect.flatMap((service) =>
        service.precoPorItem(args.codigoItemCatalogo, Struct.renameKeys(Struct.pick(args, ["uf", "limite"]), { limite: "limit" }))
      )
    ),
});

const EstatisticaInput = Schema.Struct({
  codigoItemCatalogo: NonEmptyString,
  uf: Schema.optionalKey(Uf),
});

const estatisticaPreco = defineTool({
  name: "estatistica_preco_item",
  description:
    "Retorna estatistica de preco (n, minimo, mediana, media, maximo) das compras federais para um codigo CATMAT - referencia preliminar para pesquisa de precos.",
  input: EstatisticaInput,
  run: (args) =>
    PainelPrecos.pipe(
      Effect.flatMap((service) =>
        service.estatisticaPreco(args.codigoItemCatalogo, Struct.pick(args, ["uf"]))
      )
    ),
});

const BuscarInput = Schema.Struct({
  termo: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  limite: Schema.optionalKey(positiveIntMax(200)),
});

const buscarPrecoPorDescricao = defineTool({
  name: "buscar_preco_por_descricao",
  description:
    "Busca precos praticados em compras federais por descricao do item (BM25), retornando amostras com preco unitario e fornecedor.",
  input: BuscarInput,
  run: (args) =>
    PainelPrecos.pipe(
      Effect.flatMap((service) =>
        service.buscarPrecoPorDescricao(args.termo, Struct.renameKeys(Struct.pick(args, ["limite"]), { limite: "limit" }))
      )
    ),
});

export const painelPrecosTools = [
  precoPraticadoItem,
  estatisticaPreco,
  buscarPrecoPorDescricao,
] as const;
