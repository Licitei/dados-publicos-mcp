import { Effect, Schema } from "effect";
import type { CorpusName } from "../../kernel/search/corpus";
import { Search } from "../../kernel/search/search";
import { NonEmptyString, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const BuscarInput = Schema.Struct({
  termos: Schema.Array(NonEmptyString).pipe(Schema.check(Schema.isMinLength(1))),
  dentro: Schema.optionalKey(NonEmptyString),
  limite: Schema.optionalKey(positiveIntMax(50)),
});

const LocalizarInput = Schema.Struct({
  consulta: NonEmptyString,
  limite: Schema.optionalKey(positiveIntMax(50)),
});

const LerInput = Schema.Struct({ caminho: NonEmptyString });

const acervo = (spec: {
  readonly corpus: CorpusName;
  readonly singular: string;
  readonly exemploCaminho: string;
  readonly exemploDentro: string;
}) => [
  defineTool({
    name: `buscar_${spec.corpus}`,
    description: `Busca textual (grep) no acervo local de ${spec.corpus} em Markdown. Cada termo e procurado literalmente (smart case); retorna caminho, linha e contexto. Use 'dentro' para restringir por pasta ou glob (ex: ${spec.exemploDentro}).`,
    input: BuscarInput,
    run: (args) =>
      Search.pipe(
        Effect.flatMap((search) =>
          search.grep(spec.corpus, args.termos, {
            ...(args.dentro === undefined ? {} : { within: args.dentro }),
            ...(args.limite === undefined ? {} : { limit: args.limite }),
          })
        )
      ),
  }),
  defineTool({
    name: `localizar_${spec.corpus}`,
    description: `Localiza ${spec.singular} pelo nome do arquivo (busca fuzzy por tipo, numero, data, orgao). Ex de caminho: ${spec.exemploCaminho}.`,
    input: LocalizarInput,
    run: (args) =>
      Search.pipe(
        Effect.flatMap((search) =>
          search.find(
            spec.corpus,
            args.consulta,
            args.limite === undefined ? {} : { limit: args.limite }
          )
        )
      ),
  }),
  defineTool({
    name: `ler_${spec.corpus}`,
    description: `Le o Markdown completo de ${spec.singular} (metadados do frontmatter + texto) a partir do caminho retornado por buscar_${spec.corpus}/localizar_${spec.corpus}.`,
    input: LerInput,
    run: (args) => Search.pipe(Effect.flatMap((search) => search.read(spec.corpus, args.caminho))),
  }),
];

export const acervoTools = [
  ...acervo({
    corpus: "leis",
    singular: "uma norma",
    exemploCaminho: "federal/br-federal-lei-2021-04-01-14133.md",
    exemploDentro: "federal/ ou estaduais/SP/",
  }),
  ...acervo({
    corpus: "precedentes",
    singular: "um precedente (sumula, tema, decisao)",
    exemploCaminho: "tribunais/STF/adc/stf-adc-1.md",
    exemploDentro: "tribunais/STJ/ ou tribunais/TCU/",
  }),
];
