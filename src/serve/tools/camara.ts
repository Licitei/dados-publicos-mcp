import { Effect, Match, Schema } from "effect";
import { CamaraDeputados } from "../../sources/camara-deputados/store";
import { NonEmptyString, Uf, ceapYear, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const FornecedorCotaInput = Schema.Struct({
  cnpjCpf: NonEmptyString,
  ano: Schema.optional(ceapYear),
  limite: Schema.optional(positiveIntMax(500)),
});

const fornecedorCotaParlamentar = defineTool({
  name: "fornecedor_cota_parlamentar",
  description:
    "Reverse-lookup: dado um CNPJ/CPF de fornecedor, lista todos os deputados que lhe pagaram via cota parlamentar (CEAP) e a soma de vlrLiquido.",
  input: FornecedorCotaInput,
  run: (args) =>
    CamaraDeputados.pipe(
      Effect.flatMap((service) =>
        service.fornecedorCotaParlamentar({
          cnpjCpf: args.cnpjCpf,
          ano: args.ano,
          limit: args.limite,
        })
      )
    ),
});

const GastosInput = Schema.Struct({
  fornecedor: Schema.optional(Schema.String.pipe(Schema.check(Schema.isMinLength(2)))),
  cnpjCpf: Schema.optional(NonEmptyString),
  ano: Schema.optional(ceapYear),
  categoria: Schema.optional(Schema.String.pipe(Schema.check(Schema.isMinLength(2)))),
  limite: Schema.optional(positiveIntMax(500)),
});

const gastosPorFornecedor = defineTool({
  name: "gastos_por_fornecedor",
  description:
    "Agrega gastos de cota parlamentar (CEAP) por fornecedor, com filtros opcionais por nome (FTS), CNPJ/CPF, ano e categoria.",
  input: GastosInput,
  run: (args) =>
    CamaraDeputados.pipe(
      Effect.flatMap((service) =>
        service.gastosPorFornecedor({
          fornecedor: args.fornecedor,
          cnpjCpf: args.cnpjCpf,
          ano: args.ano,
          categoria: args.categoria,
          limit: args.limite,
        })
      )
    ),
});

const BuscarDeputadoInput = Schema.Struct({
  nome: Schema.optional(NonEmptyString),
  id: Schema.optional(positiveIntMax(Number.MAX_SAFE_INTEGER)),
  uf: Schema.optional(Uf),
  limite: Schema.optional(positiveIntMax(200)),
});

const buscarDeputado = defineTool({
  name: "buscar_deputado",
  description:
    "Busca deputado por nome ou nome civil (normalizado, sem acento), por id ou por UF de nascimento.",
  input: BuscarDeputadoInput,
  run: (args) =>
    CamaraDeputados.pipe(
      Effect.flatMap((service) =>
        service.buscarDeputado({
          nome: args.nome,
          id: Match.value(args.id).pipe(
            Match.when(Match.number, (value) => String(value)),
            Match.orElse(() => undefined)
          ),
          uf: args.uf,
          limit: args.limite,
        })
      )
    ),
});

const BuscarProposicaoInput = Schema.Struct({
  termo: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  ano: Schema.optional(ceapYear),
  tipo: Schema.optional(NonEmptyString),
  incluirAutores: Schema.optional(Schema.Boolean),
  limite: Schema.optional(positiveIntMax(200)),
});

const buscarProposicao = defineTool({
  name: "buscar_proposicao",
  description:
    "Busca proposicoes por palavra-chave em ementa, ementa detalhada e keywords (FTS), com filtros opcionais por ano e tipo. Pode incluir autores.",
  input: BuscarProposicaoInput,
  run: (args) =>
    CamaraDeputados.pipe(
      Effect.flatMap((service) =>
        service.buscarProposicao({
          termo: args.termo,
          ano: args.ano,
          tipo: args.tipo,
          incluirAutores: args.incluirAutores,
          limit: args.limite,
        })
      )
    ),
});

export const camaraTools = [
  fornecedorCotaParlamentar,
  gastosPorFornecedor,
  buscarDeputado,
  buscarProposicao,
] as const;
