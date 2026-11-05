import { Effect, Schema, Struct } from "effect";
import { Sinapi } from "../../sources/sinapi/store";
import { BuscarTermoUfInput, NonEmptyString, Uf } from "../checks";
import { defineTool } from "../tool";

const buscarInsumoSinapi = defineTool({
  name: "buscar_insumo_sinapi",
  description:
    "Busca insumos de construcao na tabela SINAPI (Caixa) por descricao e retorna o preco mediano por UF (referencia para obras), opcionalmente filtrando por UF.",
  input: BuscarTermoUfInput,
  run: (args) =>
    Sinapi.pipe(
      Effect.flatMap((service) =>
        service.buscarInsumo(
          args.termo,
          Struct.renameKeys(Struct.pick(args, ["uf", "limite"]), { limite: "limit" })
        )
      )
    ),
});

const CodigoInput = Schema.Struct({
  codigo: NonEmptyString,
  uf: Schema.optionalKey(Uf),
});

const precoInsumoSinapi = defineTool({
  name: "preco_insumo_sinapi",
  description:
    "Retorna o preco mediano SINAPI de um insumo de construcao pelo codigo, por UF (referencia de preco para obras publicas).",
  input: CodigoInput,
  run: (args) =>
    Sinapi.pipe(Effect.flatMap((service) => service.precoPorCodigo(args.codigo, args.uf))),
});

export const sinapiTools = [buscarInsumoSinapi, precoInsumoSinapi] as const;
