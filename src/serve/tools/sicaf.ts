import { Effect, Schema } from "effect";
import { Sicaf } from "../../sources/sicaf-fornecedores/store";
import { NonEmptyString, Uf, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const BuscarInput = Schema.Struct({
  nome: NonEmptyString,
  apenasAtivos: Schema.optional(Schema.Boolean),
  limite: Schema.optional(positiveIntMax(100)),
});

const buscarFornecedorSicaf = defineTool({
  name: "buscar_fornecedor_sicaf",
  description: "Busca fornecedores do SICAF por nome / razao social (full-text).",
  input: BuscarInput,
  run: (args) =>
    Sicaf.pipe(
      Effect.flatMap((service) =>
        service.buscar({
          nome: args.nome,
          apenasAtivos: args.apenasAtivos,
          limit: args.limite,
        })
      )
    ),
});

const HabilitadoInput = Schema.Struct({ cnpj: NonEmptyString });

const fornecedorHabilitado = defineTool({
  name: "fornecedor_habilitado",
  description:
    "Verifica por CNPJ se um fornecedor esta ativo e habilitado a licitar no SICAF, offline.",
  input: HabilitadoInput,
  run: (args) =>
    Sicaf.pipe(Effect.flatMap((service) => service.habilitado(args.cnpj))),
});

const ListarInput = Schema.Struct({
  uf: Schema.optional(Uf),
  municipio: Schema.optional(NonEmptyString),
  cnae: Schema.optional(positiveIntMax(Number.MAX_SAFE_INTEGER)),
  apenasAtivos: Schema.optional(Schema.Boolean),
  limite: Schema.optional(positiveIntMax(500)),
}).pipe(
  Schema.check(
    Schema.makeFilter((value) =>
      value.uf !== undefined ||
      value.municipio !== undefined ||
      value.cnae !== undefined
        ? undefined
        : "Informe ao menos um filtro: uf, municipio ou cnae."
    )
  )
);

const listarFornecedoresUfCnae = defineTool({
  name: "listar_fornecedores_uf_cnae",
  description: "Lista/segmenta fornecedores do SICAF por UF, municipio e/ou CNAE.",
  input: ListarInput,
  run: (args) =>
    Sicaf.pipe(
      Effect.flatMap((service) =>
        service.listar({
          uf: args.uf,
          municipio: args.municipio,
          cnae: args.cnae,
          apenasAtivos: args.apenasAtivos,
          limit: args.limite,
        })
      )
    ),
});

export const sicafTools = [
  buscarFornecedorSicaf,
  fornecedorHabilitado,
  listarFornecedoresUfCnae,
] as const;
