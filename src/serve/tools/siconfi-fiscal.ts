import { Effect, Schema } from "effect";
import { SiconfiFiscal } from "../../sources/siconfi-fiscal/store";
import { intYear, NonEmptyString, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const FiscalInput = Schema.Struct({
  idEnte: NonEmptyString,
  demonstrativo: Schema.optional(Schema.Literals(["DCA", "RREO", "RGF"])),
  exercicio: Schema.optional(intYear),
  limite: Schema.optional(positiveIntMax(1000)),
});

const fiscalEnte = defineTool({
  name: "fiscal_ente_siconfi",
  description:
    "Lista as linhas dos demonstrativos fiscais SICONFI (DCA/RREO/RGF) de um ente pelo codigo IBGE (id_ente), opcionalmente filtrando demonstrativo e exercicio.",
  input: FiscalInput,
  run: (args) =>
    SiconfiFiscal.pipe(
      Effect.flatMap((service) =>
        service.fiscalPorEnte(args.idEnte, {
          demonstrativo: args.demonstrativo,
          exercicio: args.exercicio,
          limit: args.limite,
        })
      )
    ),
});

const BuscarContaInput = Schema.Struct({
  termo: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  limite: Schema.optional(positiveIntMax(200)),
});

const buscarConta = defineTool({
  name: "buscar_conta_siconfi",
  description:
    "Busca linhas de contas fiscais SICONFI por texto (ex: 'despesa com pessoal', 'receita corrente liquida') usando BM25 com fallback fuzzy pg_trgm.",
  input: BuscarContaInput,
  run: (args) =>
    SiconfiFiscal.pipe(
      Effect.flatMap((service) =>
        service.buscarConta(args.termo, { limit: args.limite })
      )
    ),
});

export const siconfiFiscalTools = [fiscalEnte, buscarConta] as const;
