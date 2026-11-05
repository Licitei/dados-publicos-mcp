import { Effect, Schema, Struct } from "effect";
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
  limite: Schema.optionalKey(positiveIntMax(500)),
});

const buscarSancionadoPorNome = defineTool({
  name: "buscar_sancionado_por_nome",
  description:
    "Busca sancionados (empresa ou pessoa) por nome / razao social nas 5 listas, usando indice de texto (FTS).",
  input: BuscarNomeInput,
  run: (args) =>
    SancoesCgu.pipe(
      Effect.flatMap((service) =>
        service.buscarPorNome(args.nome, Struct.renameKeys(Struct.pick(args, ["limite"]), { limite: "limit" }))
      )
    ),
});

const VigentesInput = Schema.Struct({
  data: Schema.String.pipe(
    Schema.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))
  ),
  lista: Schema.optionalKey(
    Schema.Literals(["ceis", "cnep", "ceaf", "cepim", "acordos-leniencia"])
  ),
  limite: Schema.optionalKey(positiveIntMax(500)),
});

const sancoesVigentesNaData = defineTool({
  name: "sancoes_vigentes_na_data",
  description:
    "Lista sancoes ativas numa data (intervalo data inicio/final) - due diligence na data do certame.",
  input: VigentesInput,
  run: (args) =>
    SancoesCgu.pipe(
      Effect.flatMap((service) =>
        service.vigentesNaData(args.data, Struct.renameKeys(Struct.pick(args, ["lista", "limite"]), { limite: "limit" }))
      )
    ),
});

export const sancoesTools = [
  verificarSancoes,
  buscarSancionadoPorNome,
  sancoesVigentesNaData,
] as const;
