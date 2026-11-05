import { Effect, Schema, Struct } from "effect";
import { Transferegov } from "../../sources/transferegov/store";
import { BuscarTermoUfInput, NonEmptyString, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const buscarConvenio = defineTool({
  name: "buscar_convenio",
  description:
    "Busca convenios/transferencias federais (Transferegov/SICONV) por objeto/proponente/orgao, opcionalmente filtrando por UF.",
  input: BuscarTermoUfInput,
  run: (args) =>
    Transferegov.pipe(
      Effect.flatMap((service) =>
        service.buscarConvenio(
          args.termo,
          Struct.renameKeys(Struct.pick(args, ["uf", "limite"]), { limite: "limit" })
        )
      )
    ),
});

const ProponenteInput = Schema.Struct({ documento: NonEmptyString });

const conveniosDoProponente = defineTool({
  name: "convenios_do_proponente",
  description:
    "Lista e soma os convenios federais recebidos por um CNPJ/CPF proponente (quem recebe verba federal).",
  input: ProponenteInput,
  run: (args) =>
    Transferegov.pipe(Effect.flatMap((service) => service.conveniosDoProponente(args.documento))),
});

const MunicipioInput = Schema.Struct({
  codigo: NonEmptyString,
  limite: Schema.optionalKey(positiveIntMax(200)),
});

const conveniosDoMunicipio = defineTool({
  name: "convenios_do_municipio",
  description: "Lista convenios federais de um municipio pelo codigo IBGE, ordenados por valor.",
  input: MunicipioInput,
  run: (args) =>
    Transferegov.pipe(
      Effect.flatMap((service) => service.conveniosDoMunicipio(args.codigo, args.limite ?? 100))
    ),
});

export const transferegovTools = [
  buscarConvenio,
  conveniosDoProponente,
  conveniosDoMunicipio,
] as const;
