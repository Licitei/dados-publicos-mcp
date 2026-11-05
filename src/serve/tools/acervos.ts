import { Effect, Schema } from "effect";
import { Search } from "../../kernel/search/search";
import { NonEmptyString, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const Acervo = Schema.Literals(["leis", "precedentes"]);

const BuscarInput = Schema.Struct({
  acervo: Acervo,
  termos: Schema.Array(NonEmptyString).pipe(Schema.check(Schema.isMinLength(1))),
  dentro: Schema.optionalKey(NonEmptyString),
  limite: Schema.optionalKey(positiveIntMax(50)),
});

const LocalizarInput = Schema.Struct({
  acervo: Acervo,
  consulta: NonEmptyString,
  limite: Schema.optionalKey(positiveIntMax(50)),
});

const LerInput = Schema.Struct({ acervo: Acervo, caminho: NonEmptyString });

export const acervoTools = [
  defineTool({
    name: "acervo_buscar",
    description:
      "Busca termos literais no acervo local de leis ou precedentes. Retorna caminho, linha e contexto. Use dentro para restringir por pasta ou glob, como tribunais/TCU/.",
    input: BuscarInput,
    run: (args) =>
      Search.pipe(
        Effect.flatMap((search) =>
          search.grep(args.acervo, args.termos, {
            ...(args.dentro === undefined ? {} : { within: args.dentro }),
            ...(args.limite === undefined ? {} : { limit: args.limite }),
          })
        )
      ),
  }),
  defineTool({
    name: "acervo_localizar",
    description:
      "Localiza normas ou precedentes pelo nome do arquivo, com busca aproximada por tipo, número, data ou órgão.",
    input: LocalizarInput,
    run: (args) =>
      Search.pipe(
        Effect.flatMap((search) =>
          search.find(
            args.acervo,
            args.consulta,
            args.limite === undefined ? {} : { limit: args.limite }
          )
        )
      ),
  }),
  defineTool({
    name: "acervo_ler",
    description:
      "Lê metadados e texto Markdown do caminho retornado por acervo_buscar ou acervo_localizar. Cite esse caminho ao apresentar evidência jurídica.",
    input: LerInput,
    run: (args) => Search.pipe(Effect.flatMap((search) => search.read(args.acervo, args.caminho))),
  }),
];
