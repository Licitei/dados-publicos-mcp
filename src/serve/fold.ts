import { Cause, Exit, Match, Option, Schema } from "effect";

export const textContent = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

export const errorContent = (text: string) => ({
  isError: true as const,
  content: [{ type: "text" as const, text }],
});

const hasMessage = (value: unknown): value is { readonly message: string } =>
  typeof value === "object" &&
  value !== null &&
  "message" in value &&
  typeof Reflect.get(value, "message") === "string";

const failureText = (error: unknown) =>
  Match.value(error).pipe(
    Match.when(Schema.isSchemaError, () => "Parametros invalidos para a ferramenta."),
    Match.when(hasMessage, (tagged) => tagged.message),
    Match.orElse(() => "Falha ao executar a ferramenta.")
  );

export const foldExit = Exit.match({
  onSuccess: (value: unknown) => textContent(JSON.stringify(value, null, 2)),
  onFailure: (cause: Cause.Cause<unknown>) =>
    errorContent(
      Cause.findErrorOption(cause).pipe(
        Option.map(failureText),
        Option.getOrElse(() => Cause.pretty(cause))
      )
    ),
});
