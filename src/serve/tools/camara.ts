import { Effect, Match, Schema, Struct } from "effect";
import { CamaraDeputados } from "../../sources/camara-deputados/store";
import { NonEmptyString, Uf, ceapYear, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const FornecedorCotaInput = Schema.Struct({
  cnpjCpf: NonEmptyString,
  ano: Schema.optionalKey(ceapYear),
  limite: Schema.optionalKey(positiveIntMax(500)),
});

const fornecedorCotaParlamentar = defineTool({
  name: "fornecedor_cota_parlamentar",
  description:
    "Reverse-lookup: dado um CNPJ/CPF de fornecedor, lista todos os deputados que lhe pagaram via cota parlamentar (CEAP) e a soma de vlrLiquido.",
  input: FornecedorCotaInput,
  run: (args) =>
    CamaraDeputados.pipe(
      Effect.flatMap((service) =>
        service.fornecedorCotaParlamentar(Struct.renameKeys(Struct.pick(args, ["cnpjCpf", "ano", "limite"]), { limite: "limit" }))
      )
    ),
});

const GastosInput = Schema.Struct({
  fornecedor: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isMinLength(2)))),
  cnpjCpf: Schema.optionalKey(NonEmptyString),
  ano: Schema.optionalKey(ceapYear),
  categoria: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isMinLength(2)))),
  limite: Schema.optionalKey(positiveIntMax(500)),
});

const gastosPorFornecedor = defineTool({
  name: "gastos_por_fornecedor",
  description:
    "Agrega gastos de cota parlamentar (CEAP) por fornecedor, com filtros opcionais por nome (FTS), CNPJ/CPF, ano e categoria.",
  input: GastosInput,
  run: (args) =>
    CamaraDeputados.pipe(
      Effect.flatMap((service) =>
        service.gastosPorFornecedor(Struct.renameKeys(Struct.pick(args, ["fornecedor", "cnpjCpf", "ano", "categoria", "limite"]), { limite: "limit" }))
      )
    ),
});

const BuscarDeputadoInput = Schema.Struct({
  nome: Schema.optionalKey(NonEmptyString),
  id: Schema.optionalKey(positiveIntMax(Number.MAX_SAFE_INTEGER)),
  uf: Schema.optionalKey(Uf),
  limite: Schema.optionalKey(positiveIntMax(200)),
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
          ...Struct.renameKeys(Struct.pick(args, ["nome", "uf", "limite"]), {
            limite: "limit",
          }),
          ...Match.value(args.id).pipe(
            Match.when(Match.number, (value) => ({ id: String(value) })),
            Match.orElse(() => ({}))
          ),
        })
      )
    ),
});

const BuscarProposicaoInput = Schema.Struct({
  termo: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  ano: Schema.optionalKey(ceapYear),
  tipo: Schema.optionalKey(NonEmptyString),
  incluirAutores: Schema.optionalKey(Schema.Boolean),
  limite: Schema.optionalKey(positiveIntMax(200)),
});

const buscarProposicao = defineTool({
  name: "buscar_proposicao",
  description:
    "Busca proposicoes por palavra-chave em ementa, ementa detalhada e keywords (FTS), com filtros opcionais por ano e tipo. Pode incluir autores.",
  input: BuscarProposicaoInput,
  run: (args) =>
    CamaraDeputados.pipe(
      Effect.flatMap((service) =>
        service.buscarProposicao(Struct.renameKeys(Struct.pick(args, ["termo", "ano", "tipo", "incluirAutores", "limite"]), { limite: "limit" }))
      )
    ),
});

export const camaraTools = [
  fornecedorCotaParlamentar,
  gastosPorFornecedor,
  buscarDeputado,
  buscarProposicao,
] as const;
