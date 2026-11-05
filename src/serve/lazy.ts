import { Effect } from "effect";
import { dual } from "effect/Function";
import * as Arr from "effect/Array";
import { Duck } from "../kernel/duck/duck";
import { type FonteKey, indexRegistry } from "./index-registry";
import { ToolFailure, type Tool } from "./tool";

const isEmpty = (fonte: FonteKey) =>
  Duck.pipe(
    Effect.flatMap((duck) =>
      Effect.forEach(indexRegistry[fonte].tables, (table) => duck.count(table), { concurrency: 1 })
    ),
    Effect.map(
      (counts) => Arr.isReadonlyArrayNonEmpty(counts) && Arr.every(counts, (count) => count === 0)
    )
  );

const ensureIndexed = (fonte: FonteKey) => {
  const entry = indexRegistry[fonte];
  return entry.heavy
    ? Effect.void
    : isEmpty(fonte).pipe(
        Effect.flatMap((empty) =>
          empty
            ? entry.run({}).pipe(
                Effect.asVoid,
                Effect.mapError((error) =>
                  ToolFailure.make({
                    text: `Indexacao automatica de ${fonte} falhou: ${error.message}`,
                  })
                )
              )
            : Effect.void
        )
      );
};

export const withLazyIndex: {
  (fonte: FonteKey): (tools: readonly Tool[]) => readonly Tool[];
  (tools: readonly Tool[], fonte: FonteKey): readonly Tool[];
} = dual(2, (tools: readonly Tool[], fonte: FonteKey): readonly Tool[] =>
  Arr.map(tools, (tool) => ({
    ...tool,
    description: indexRegistry[fonte].heavy
      ? tool.description
      : `${tool.description} (Indexa ${fonte} automaticamente na primeira chamada se o indice estiver vazio.)`,
    handle: (args: unknown) => ensureIndexed(fonte).pipe(Effect.andThen(tool.handle(args))),
  }))
);
