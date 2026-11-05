import { Effect, Match, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Rec from "effect/Record";
import { FonteKey, indexRegistry } from "../index-registry";
import { ToolFailure, defineTool } from "../tool";

const lightFontes = Arr.filter(Rec.keys(indexRegistry), (fonte) => !indexRegistry[fonte].heavy);

const IndexarInput = Schema.Struct({
  fonte: FonteKey,
  escopo: Schema.optionalKey(
    Schema.Struct({
      orgaos: Schema.optionalKey(Schema.Array(Schema.String)),
      uasgs: Schema.optionalKey(Schema.Array(Schema.String)),
      ufs: Schema.optionalKey(Schema.Array(Schema.String)),
      anos: Schema.optionalKey(Schema.Array(Schema.Finite.pipe(Schema.check(Schema.isInt())))),
      mes: Schema.optionalKey(
        Schema.String.pipe(Schema.check(Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])$/)))
      ),
    })
  ),
});

const indexar = defineTool({
  name: "indexar",
  description: `Baixa a fonte oficial e recria o indice local neste computador. Fontes leves aceitas aqui: ${Arr.join(lightFontes, ", ")}. As pesadas so rodam pela CLI: dados-publicos-mcp index <fonte>.`,
  input: IndexarInput,
  run: (args) =>
    Match.value(indexRegistry[args.fonte]).pipe(
      Match.when({ heavy: true }, () =>
        Effect.fail(
          ToolFailure.make({
            text: `A fonte ${args.fonte} e pesada; rode \`dados-publicos-mcp index ${args.fonte}\` no terminal.`,
          })
        )
      ),
      Match.orElse((entry) => entry.run(args.escopo ?? {}))
    ),
});

export const indexTools = [indexar];
