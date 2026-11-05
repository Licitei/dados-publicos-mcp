import { Effect, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Rec from "effect/Record";
import * as Str from "effect/String";
import { Duck } from "../kernel/duck/duck";
import { CorpusGit, corpusDir, corpusNames } from "../kernel/search/corpus";
import { defineTool } from "./tool";

const TableRow = Schema.Struct({ tabela: Schema.String, linhas: Schema.Finite });

const banco = Duck.pipe(
  Effect.flatMap((duck) =>
    duck.query(
      TableRow,
      "SELECT table_name AS tabela, estimated_size::INTEGER AS linhas FROM duckdb_tables() WHERE schema_name = 'main' ORDER BY table_name"
    )
  ),
  Effect.map((rows) =>
    Rec.fromEntries(
      Arr.map(
        Arr.filter(rows, (row) => !Str.startsWith("fts_main_")(row.tabela)),
        (row): readonly [string, number] => [row.tabela, row.linhas]
      )
    )
  ),
  Effect.orElseSucceed((): Record<string, number> => ({}))
);

type AcervoInfo = {
  readonly baixado: boolean;
  readonly commit: string | null;
  readonly data: string | null;
};

const ausente: AcervoInfo = { baixado: false, commit: null, data: null };

const acervos = CorpusGit.pipe(
  Effect.flatMap((git) =>
    Effect.forEach(corpusNames, (corpus) =>
      corpusDir(corpus).pipe(
        Effect.flatMap((dir) => git.localHead(corpus, dir)),
        Effect.map((head) =>
          Option.match(head, {
            onNone: (): AcervoInfo => ausente,
            onSome: ({ commit, date }): AcervoInfo => ({ baixado: true, commit, data: date }),
          })
        ),
        Effect.orElseSucceed(() => ausente),
        Effect.map((info): readonly [string, AcervoInfo] => [corpus, info])
      )
    )
  ),
  Effect.map(Rec.fromEntries)
);

export const statusIndices = defineTool({
  name: "status_indices",
  description:
    "Status dos indices locais: linhas por tabela no banco local (DuckDB) e commit/data dos acervos de leis e precedentes baixados.",
  input: Schema.Struct({}),
  run: () => Effect.all({ banco, acervos }, { concurrency: 2 }),
});
