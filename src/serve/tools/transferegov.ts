import { Effect, Schema } from "effect";
import { Transferegov } from "../../sources/transferegov/store";
import { NonEmptyString, positiveIntMax, Uf } from "../checks";
import { defineTool } from "../tool";

const BuscarInput = Schema.Struct({
  termo: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  uf: Schema.optional(Uf),
  limite: Schema.optional(positiveIntMax(200)),
});

const buscarConvenio = defineTool({
  name: "buscar_convenio",
  description:
    "Busca convenios/transferencias federais (Transferegov/SICONV) por objeto/proponente/orgao usando BM25, opcionalmente filtrando por UF.",
  input: BuscarInput,
  run: (args) =>
    Transferegov.pipe(
      Effect.flatMap((service) =>
        service.buscarConvenio(args.termo, { uf: args.uf, limit: args.limite })
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
    Transferegov.pipe(
      Effect.flatMap((service) =>
        service.conveniosDoProponente(args.documento)
      )
    ),
});

const MunicipioInput = Schema.Struct({
  codigo: NonEmptyString,
  limite: Schema.optional(positiveIntMax(200)),
});

const conveniosDoMunicipio = defineTool({
  name: "convenios_do_municipio",
  description:
    "Lista convenios federais de um municipio pelo codigo IBGE, ordenados por valor.",
  input: MunicipioInput,
  run: (args) =>
    Transferegov.pipe(
      Effect.flatMap((service) =>
        service.conveniosDoMunicipio(args.codigo, args.limite ?? 100)
      )
    ),
});

export const transferegovTools = [
  buscarConvenio,
  conveniosDoProponente,
  conveniosDoMunicipio,
] as const;
