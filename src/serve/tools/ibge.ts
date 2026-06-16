import { Effect, Schema } from "effect";
import { IbgeLocalidades } from "../../sources/ibge-localidades/store";
import { NonEmptyString, Uf } from "../checks";
import { defineTool } from "../tool";

const ResolverMunicipioInput = Schema.Struct({
  nome: NonEmptyString,
  uf: Schema.optional(Uf),
});

const resolverMunicipio = defineTool({
  name: "resolver_municipio",
  description:
    "Resolve o nome de um municipio (UF opcional para desambiguar homonimos) para o codigo IBGE de 7 digitos exigido pelo filtro codigoMunicipioIbge do PNCP.",
  input: ResolverMunicipioInput,
  run: (args) =>
    IbgeLocalidades.pipe(
      Effect.flatMap((service) =>
        service.resolveMunicipio(args.nome, { uf: args.uf })
      )
    ),
});

const ResolverCodigoInput = Schema.Struct({ codigo: NonEmptyString });

const resolverCodigoIbge = defineTool({
  name: "resolver_codigo_ibge",
  description:
    "Resolucao reversa: recebe o codigo IBGE de 7 digitos e retorna nome do municipio, UF, mesorregiao e regiao.",
  input: ResolverCodigoInput,
  run: (args) =>
    IbgeLocalidades.pipe(
      Effect.flatMap((service) => service.municipioByCodigo(args.codigo))
    ),
});

const ListarMunicipiosInput = Schema.Struct({ uf: Uf });

const listarMunicipiosUf = defineTool({
  name: "listar_municipios_uf",
  description:
    "Lista todos os municipios de uma UF com seus codigos IBGE de 7 digitos.",
  input: ListarMunicipiosInput,
  run: (args) =>
    IbgeLocalidades.pipe(Effect.flatMap((service) => service.listByUf(args.uf))),
});

const ValidarUfInput = Schema.Struct({ uf: NonEmptyString });

const validarUf = defineTool({
  name: "validar_uf",
  description:
    "Normaliza/valida uma sigla de UF (ex SP, rj) e retorna o codigo numerico IBGE da UF.",
  input: ValidarUfInput,
  run: (args) =>
    IbgeLocalidades.pipe(
      Effect.flatMap((service) => service.validateUf(args.uf))
    ),
});

export const ibgeTools = [
  resolverMunicipio,
  resolverCodigoIbge,
  listarMunicipiosUf,
  validarUf,
] as const;
