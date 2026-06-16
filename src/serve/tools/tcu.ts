import { Effect, Schema } from "effect";
import { TcuInidoneos } from "../../sources/tcu-inidoneos/store";
import { NonEmptyString, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const VerificarInput = Schema.Struct({ documento: NonEmptyString });

const verificarInidoneoTcu = defineTool({
  name: "verificar_inidoneo_tcu",
  description:
    "Verifica se um CNPJ ou CPF consta nas listas de inidoneos/inabilitados do TCU (licitantes inidoneos, contas julgadas irregulares, inabilitados para funcao publica).",
  input: VerificarInput,
  run: (args) =>
    TcuInidoneos.pipe(
      Effect.flatMap((service) => service.verificar(args.documento))
    ),
});

const BuscarNomeInput = Schema.Struct({
  nome: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  limite: Schema.optional(positiveIntMax(100)),
});

const buscarInidoneoTcu = defineTool({
  name: "buscar_inidoneo_tcu",
  description:
    "Busca inidoneos/inabilitados do TCU por nome (empresa ou pessoa) usando indice de texto BM25 com fallback fuzzy pg_trgm.",
  input: BuscarNomeInput,
  run: (args) =>
    TcuInidoneos.pipe(
      Effect.flatMap((service) =>
        service.buscarPorNome(args.nome, { limit: args.limite })
      )
    ),
});

export const tcuTools = [verificarInidoneoTcu, buscarInidoneoTcu] as const;
