import { Context, Effect, Layer, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import { Duck } from "../../kernel/duck/duck";
import { indexReceitaCnpj } from "./indexer";

const CountsRow = Schema.Struct({
  empresas: Schema.Finite,
  estabelecimentos: Schema.Finite,
  socios: Schema.Finite,
  simples: Schema.Finite,
  dominios: Schema.Finite,
});

const makeReceitaCnpj = Effect.gen(function* () {
  const duck = yield* Duck;

  const index = indexReceitaCnpj().pipe(
    Effect.provideService(Duck, duck),
    Effect.andThen(
      duck.query(
        CountsRow,
        `select
          (select count(*) from empresa)::INTEGER as empresas,
          (select count(*) from estabelecimento)::INTEGER as estabelecimentos,
          (select count(*) from socio)::INTEGER as socios,
          (select count(*) from simples)::INTEGER as simples,
          (select count(*) from dominio)::INTEGER as dominios`
      )
    ),
    Effect.map((rows) =>
      Option.getOrElse(Arr.head(rows), () => ({
        empresas: 0,
        estabelecimentos: 0,
        socios: 0,
        simples: 0,
        dominios: 0,
      }))
    )
  );

  return { index };
});

export class ReceitaCnpj extends Context.Service<
  ReceitaCnpj,
  Effect.Success<typeof makeReceitaCnpj>
>()("dados-publicos-mcp/sources/receita-cnpj/store/ReceitaCnpj") {}

export const ReceitaCnpjLive = Layer.effect(ReceitaCnpj)(makeReceitaCnpj);
