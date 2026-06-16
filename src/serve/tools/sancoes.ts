import { Effect, Schema } from "effect";
import { SancoesCgu } from "../../sources/sancoes-cgu/store";
import { NonEmptyString, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const VerificarInput = Schema.Struct({ documento: NonEmptyString });

const verificarSancoes = defineTool({
  name: "verificar_sancoes",
  description:
    "Verifica se um CNPJ ou CPF esta sancionado/inidoneo, cruzando CEIS+CNEP+CEPIM+CEAF+Leniencia numa unica consulta.",
  input: VerificarInput,
  run: (args) =>
    SancoesCgu.pipe(
      Effect.flatMap((service) => service.verificar(args.documento))
    ),
});

const BuscarNomeInput = Schema.Struct({
  nome: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  limite: Schema.optional(positiveIntMax(500)),
});

const buscarSancionadoPorNome = defineTool({
  name: "buscar_sancionado_por_nome",
  description:
    "Busca sancionados (empresa ou pessoa) por nome / razao social nas 5 listas, usando indice de texto (FTS).",
  input: BuscarNomeInput,
  run: (args) =>
    SancoesCgu.pipe(
      Effect.flatMap((service) =>
        service.buscarPorNome(args.nome, { limit: args.limite })
      )
    ),
});

const VigentesInput = Schema.Struct({
  data: Schema.String.pipe(
    Schema.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))
  ),
  lista: Schema.optional(
    Schema.Literals(["ceis", "cnep", "ceaf", "cepim", "acordos-leniencia"])
  ),
  limite: Schema.optional(positiveIntMax(500)),
});

const sancoesVigentesNaData = defineTool({
  name: "sancoes_vigentes_na_data",
  description:
    "Lista sancoes ativas numa data (intervalo data inicio/final) - due diligence na data do certame.",
  input: VigentesInput,
  run: (args) =>
    SancoesCgu.pipe(
      Effect.flatMap((service) =>
        service.vigentesNaData(args.data, {
          lista: args.lista,
          limit: args.limite,
        })
      )
    ),
});

export const sancoesTools = [
  verificarSancoes,
  buscarSancionadoPorNome,
  sancoesVigentesNaData,
] as const;
