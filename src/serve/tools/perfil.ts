import { Effect, Schema } from "effect";
import { ReceitaCnpj } from "../../sources/receita-cnpj/store";
import { SancoesCgu } from "../../sources/sancoes-cgu/store";
import { Sicaf } from "../../sources/sicaf-fornecedores/store";
import { TcuInidoneos } from "../../sources/tcu-inidoneos/store";
import { NonEmptyString } from "../checks";
import { defineTool, failureText } from "../tool";

const PerfilInput = Schema.Struct({ cnpj: NonEmptyString });

const part = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.match({
      onSuccess: (dados) => ({ ok: true, dados }),
      onFailure: (error) => ({ ok: false, erro: failureText(error) }),
    })
  );

const perfilFornecedor = defineTool({
  name: "perfil_fornecedor",
  description:
    "Perfil consolidado de um fornecedor por CNPJ, tudo local e em uma chamada: cadastro da Receita, sancoes CGU (CEIS/CNEP), inidoneidade TCU e habilitacao SICAF. Cada parte informa ok/erro de forma independente (ex: fonte ainda nao indexada).",
  input: PerfilInput,
  run: (args) =>
    Effect.all(
      {
        cadastro: part(
          ReceitaCnpj.pipe(Effect.flatMap((service) => service.consultarCnpj(args.cnpj)))
        ),
        sancoes: part(SancoesCgu.pipe(Effect.flatMap((service) => service.verificar(args.cnpj)))),
        inidoneoTcu: part(
          TcuInidoneos.pipe(Effect.flatMap((service) => service.verificar(args.cnpj)))
        ),
        sicaf: part(Sicaf.pipe(Effect.flatMap((service) => service.habilitado(args.cnpj)))),
      },
      { concurrency: 2 }
    ),
});

export const perfilTools = [perfilFornecedor];
