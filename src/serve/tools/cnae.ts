import { Effect, Schema } from "effect";
import { Cnae } from "../../sources/cnae/store";
import { NonEmptyString, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const ResolverInput = Schema.Struct({ codigo: NonEmptyString });

const resolverCnae = defineTool({
  name: "resolver_cnae",
  description:
    "Resolve um codigo de subclasse CNAE (7 digitos, com ou sem mascara, ex 4929-9/02) para a descricao oficial e a hierarquia completa.",
  input: ResolverInput,
  run: (args) =>
    Cnae.pipe(Effect.flatMap((service) => service.resolve(args.codigo))),
});

const BuscarInput = Schema.Struct({
  termo: NonEmptyString,
  limite: Schema.optional(positiveIntMax(50)),
});

const buscarCnae = defineTool({
  name: "buscar_cnae",
  description:
    "Busca subclasses CNAE por palavra-chave na descricao e nas atividades economicas.",
  input: BuscarInput,
  run: (args) =>
    Cnae.pipe(
      Effect.flatMap((service) =>
        service.search(args.termo, { limit: args.limite })
      )
    ),
});

const ListarInput = Schema.Struct({ codigo: NonEmptyString });

const listarCnaesPorNivel = defineTool({
  name: "listar_cnaes_por_nivel",
  description:
    "Lista as subclasses descendentes de um codigo de secao (A-U), divisao (2d), grupo (3d) ou classe (5d).",
  input: ListarInput,
  run: (args) =>
    Cnae.pipe(Effect.flatMap((service) => service.listByLevel(args.codigo))),
});

export const cnaeTools = [resolverCnae, buscarCnae, listarCnaesPorNivel] as const;
