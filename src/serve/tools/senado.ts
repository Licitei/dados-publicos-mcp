import { Effect, Schema } from "effect";
import { SenadoFederal } from "../../sources/senado/store";
import { NonEmptyString, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const BuscarSenadorInput = Schema.Struct({
  nome: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  limite: Schema.optional(positiveIntMax(100)),
});

const buscarSenador = defineTool({
  name: "buscar_senador",
  description:
    "Busca senadores em exercicio por nome (fuzzy pg_trgm), retornando partido, UF e contato.",
  input: BuscarSenadorInput,
  run: (args) =>
    SenadoFederal.pipe(
      Effect.flatMap((service) => service.buscarSenador(args.nome, args.limite))
    ),
});

const FornecedorInput = Schema.Struct({
  termo: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  limite: Schema.optional(positiveIntMax(200)),
});

const fornecedorCeapsSenado = defineTool({
  name: "fornecedor_ceaps_senado",
  description:
    "Busca despesas da cota parlamentar do Senado (CEAPS) por fornecedor/detalhamento usando BM25 com fallback fuzzy pg_trgm.",
  input: FornecedorInput,
  run: (args) =>
    SenadoFederal.pipe(
      Effect.flatMap((service) =>
        service.buscarFornecedorCeaps(args.termo, { limit: args.limite })
      )
    ),
});

const GastosInput = Schema.Struct({ documento: NonEmptyString });

const gastosSenadoPorFornecedor = defineTool({
  name: "gastos_senado_por_fornecedor",
  description:
    "Soma e lista as despesas CEAPS do Senado pagas a um CNPJ/CPF (due diligence de fornecedor de gabinete).",
  input: GastosInput,
  run: (args) =>
    SenadoFederal.pipe(
      Effect.flatMap((service) => service.gastosPorFornecedor(args.documento))
    ),
});

export const senadoTools = [
  buscarSenador,
  fornecedorCeapsSenado,
  gastosSenadoPorFornecedor,
] as const;
