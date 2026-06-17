import { Effect, Schema } from "effect";
import { CmedAnvisa } from "../../sources/cmed-anvisa/store";
import { NonEmptyString, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const BuscarInput = Schema.Struct({
  termo: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  limite: Schema.optional(positiveIntMax(100)),
});

const buscarMedicamento = defineTool({
  name: "buscar_medicamento_cmed",
  description:
    "Busca medicamentos na tabela CMED/ANVISA por substancia, produto, apresentacao ou laboratorio (BM25 com fallback fuzzy pg_trgm) e retorna PF e PMVG sem impostos (preco de referencia para compra publica de saude).",
  input: BuscarInput,
  run: (args) =>
    CmedAnvisa.pipe(
      Effect.flatMap((service) =>
        service.buscarMedicamento(args.termo, { limit: args.limite })
      )
    ),
});

const EanInput = Schema.Struct({ ean: NonEmptyString });

const precoMedicamentoPorEan = defineTool({
  name: "preco_medicamento_por_ean",
  description:
    "Retorna o preco CMED (PF/PMVG) de um medicamento pelo codigo de barras EAN.",
  input: EanInput,
  run: (args) =>
    CmedAnvisa.pipe(Effect.flatMap((service) => service.precoPorEan(args.ean))),
});

const GgremInput = Schema.Struct({ ggrem: NonEmptyString });

const precoMedicamentoPorGgrem = defineTool({
  name: "preco_medicamento_por_ggrem",
  description:
    "Retorna o preco CMED (PF/PMVG) de um medicamento pelo codigo GGREM.",
  input: GgremInput,
  run: (args) =>
    CmedAnvisa.pipe(
      Effect.flatMap((service) => service.precoPorGgrem(args.ggrem))
    ),
});

export const cmedTools = [
  buscarMedicamento,
  precoMedicamentoPorEan,
  precoMedicamentoPorGgrem,
] as const;
