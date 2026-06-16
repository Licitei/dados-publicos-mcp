import { Effect, Schema } from "effect";
import { CatmatCatser } from "../../sources/catmat-catser/store";
import { NonEmptyString, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const BuscarMaterialInput = Schema.Struct({
  termo: NonEmptyString,
  limite: Schema.optional(positiveIntMax(100)),
});

const buscarMaterial = defineTool({
  name: "buscar_material",
  description:
    "Busca materiais do CATMAT por nome/descricao (FTS local sobre descricaoItem).",
  input: BuscarMaterialInput,
  run: (args) =>
    CatmatCatser.pipe(
      Effect.flatMap((service) =>
        service.buscarMaterial(args.termo, { limit: args.limite })
      )
    ),
});

const BuscarServicoInput = Schema.Struct({
  termo: NonEmptyString,
  limite: Schema.optional(positiveIntMax(100)),
});

const buscarServico = defineTool({
  name: "buscar_servico",
  description: "Busca servicos do CATSER por nome (FTS local sobre nomeServico).",
  input: BuscarServicoInput,
  run: (args) =>
    CatmatCatser.pipe(
      Effect.flatMap((service) =>
        service.buscarServico(args.termo, { limit: args.limite })
      )
    ),
});

const ResolverInput = Schema.Struct({
  codigo: positiveIntMax(Number.MAX_SAFE_INTEGER),
  tipo: Schema.optional(Schema.Literals(["material", "servico"])),
});

const resolverCatmatCatser = defineTool({
  name: "resolver_catmat_catser",
  description:
    "Resolve um codigoItem (CATMAT) ou codigoServico (CATSER) para descricao e hierarquia.",
  input: ResolverInput,
  run: (args) =>
    CatmatCatser.pipe(
      Effect.flatMap((service) => service.resolver(args.codigo, args.tipo))
    ),
});

const NormalizarInput = Schema.Struct({
  descricao: NonEmptyString,
  limite: Schema.optional(positiveIntMax(100)),
});

const normalizarItemEdital = defineTool({
  name: "normalizar_item_edital",
  description:
    "Recebe uma descricao livre de item de edital e devolve os CATMAT/CATSER mais provaveis (FTS) para deduplicar e casar com PNCP.",
  input: NormalizarInput,
  run: (args) =>
    CatmatCatser.pipe(
      Effect.flatMap((service) =>
        service.normalizarItemEdital(args.descricao, { limit: args.limite })
      )
    ),
});

export const catmatCatserTools = [
  buscarMaterial,
  buscarServico,
  resolverCatmatCatser,
  normalizarItemEdital,
] as const;
