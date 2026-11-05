import { Cause, Exit, Match, Option, Schema } from "effect";

const textContent = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

export const errorContent = (text: string) => ({
  isError: true as const,
  content: [{ type: "text" as const, text }],
});

const prettyJson = Schema.encodeUnknownOption(Schema.fromJsonString(Schema.Unknown, { space: 2 }));

const successText = (value: unknown) =>
  Match.value(value).pipe(
    Match.when(Match.string, (text) => text),
    Match.orElse((other) =>
      prettyJson(other).pipe(Option.getOrElse(() => "Resultado nao serializavel."))
    )
  );

export const foldExit = (exit: Exit.Exit<unknown, { readonly message: string }>) =>
  Exit.match(exit, {
    onSuccess: (value) => textContent(successText(value)),
    onFailure: (cause) =>
      errorContent(
        Cause.findErrorOption(cause).pipe(
          Option.map((failure) => failure.message),
          Option.getOrElse(() => Cause.pretty(cause))
        )
      ),
  });
