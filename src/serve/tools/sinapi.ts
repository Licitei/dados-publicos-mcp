import { Effect, Schema } from "effect";
import { Sinapi } from "../../sources/sinapi/store";
import { NonEmptyString, positiveIntMax, Uf } from "../checks";
import { defineTool } from "../tool";

const BuscarInput = Schema.Struct({
  termo: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  uf: Schema.optional(Uf),
  limite: Schema.optional(positiveIntMax(200)),
});

const buscarInsumoSinapi = defineTool({
  name: "buscar_insumo_sinapi",
  description:
    "Busca insumos de construcao na tabela SINAPI (Caixa) por descricao usando BM25 e retorna o preco mediano por UF (referencia para obras), opcionalmente filtrando por UF.",
  input: BuscarInput,
  run: (args) =>
    Sinapi.pipe(
      Effect.flatMap((service) =>
        service.buscarInsumo(args.termo, { uf: args.uf, limit: args.limite })
      )
    ),
});

const CodigoInput = Schema.Struct({
  codigo: NonEmptyString,
  uf: Schema.optional(Uf),
});

const precoInsumoSinapi = defineTool({
  name: "preco_insumo_sinapi",
  description:
    "Retorna o preco mediano SINAPI de um insumo de construcao pelo codigo, por UF (referencia de preco para obras publicas).",
  input: CodigoInput,
  run: (args) =>
    Sinapi.pipe(
      Effect.flatMap((service) => service.precoPorCodigo(args.codigo, args.uf))
    ),
});

export const sinapiTools = [buscarInsumoSinapi, precoInsumoSinapi] as const;
