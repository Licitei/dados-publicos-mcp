import { Effect, Struct } from "effect";
import { TcuInidoneos } from "../../sources/tcu-inidoneos/store";
import { buscarNomeInput, VerificarDocumentoInput } from "../checks";
import { defineTool } from "../tool";

const verificarInidoneoTcu = defineTool({
  name: "verificar_inidoneo_tcu",
  description:
    "Verifica se um CNPJ ou CPF consta nas listas de inidoneos/inabilitados do TCU (licitantes inidoneos, contas julgadas irregulares, inabilitados para funcao publica).",
  input: VerificarDocumentoInput,
  run: (args) => TcuInidoneos.pipe(Effect.flatMap((service) => service.verificar(args.documento))),
});

const buscarInidoneoTcu = defineTool({
  name: "buscar_inidoneo_tcu",
  description: "Busca inidoneos/inabilitados do TCU por nome (empresa ou pessoa).",
  input: buscarNomeInput(100),
  run: (args) =>
    TcuInidoneos.pipe(
      Effect.flatMap((service) =>
        service.buscarPorNome(
          args.nome,
          Struct.renameKeys(Struct.pick(args, ["limite"]), { limite: "limit" })
        )
      )
    ),
});

export const tcuTools = [verificarInidoneoTcu, buscarInidoneoTcu] as const;
