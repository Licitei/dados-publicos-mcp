import { Effect, Schema, Struct } from "effect";
import * as Arr from "effect/Array";
import { findNorma, normas, rootSegment } from "../../sources/legislacao/catalog";
import { Legislacao } from "../../sources/legislacao/store";
import { NonEmptyString, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const BuscarInput = Schema.Struct({
  termo: NonEmptyString,
  norma: Schema.optionalKey(Schema.String),
  limite: Schema.optionalKey(positiveIntMax(25)),
});

const buscarLegislacao = defineTool({
  name: "buscar_legislacao",
  description: "Busca um termo no indice local de legislacao brasileira.",
  input: BuscarInput,
  run: (args) =>
    Legislacao.pipe(
      Effect.flatMap((service) =>
        service.search(args.termo, Struct.renameKeys(Struct.pick(args, ["norma", "limite"]), { norma: "normaId", limite: "limit" }))
      )
    ),
});

const ObterArtigoInput = Schema.Struct({
  norma: NonEmptyString,
  artigo: Schema.Union([Schema.String, Schema.Finite]),
});

const obterArtigo = defineTool({
  name: "obter_artigo",
  description: "Retorna um artigo especifico de uma norma brasileira.",
  input: ObterArtigoInput,
  run: (args) =>
    Legislacao.pipe(
      Effect.flatMap((service) => {
        const found = findNorma(args.norma);
        const normaId = found?.id ?? args.norma;
        return service.getArticle(normaId, rootSegment(normaId), args.artigo);
      })
    ),
});

const ListarNormasInput = Schema.Struct({});

const listarNormas = defineTool({
  name: "listar_normas",
  description: "Lista as normas brasileiras disponiveis no catalogo.",
  input: ListarNormasInput,
  run: () =>
    Effect.succeed(
      Arr.map(normas, (norma) => ({
        id: norma.id,
        titulo: norma.titulo,
        apelidos: norma.apelidos,
        temas: norma.temas,
        url: norma.url,
      }))
    ),
});

export const legislacaoTools = [
  buscarLegislacao,
  obterArtigo,
  listarNormas,
] as const;
