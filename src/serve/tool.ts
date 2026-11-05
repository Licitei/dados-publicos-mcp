import { Effect, Match, Option, Schema } from "effect";
import type { JsonSchema } from "effect/JsonSchema";
import * as Predicate from "effect/Predicate";
import type { Duck } from "../kernel/duck/duck";
import type { Http } from "../kernel/http/client";
import type { CorpusGit } from "../kernel/search/corpus";
import type { Fuzzy } from "../kernel/search/fuzzy";
import type { Search } from "../kernel/search/search";
import type { CamaraDeputados } from "../sources/camara-deputados/store";
import type { Capag } from "../sources/capag/store";
import type { CatmatCatser } from "../sources/catmat-catser/store";
import type { CmedAnvisa } from "../sources/cmed-anvisa/store";
import type { Cnae } from "../sources/cnae/store";
import type { IbgeEconomia } from "../sources/ibge-economia/store";
import type { IbgeLocalidades } from "../sources/ibge-localidades/store";
import type { PainelPrecos } from "../sources/painel-precos/store";
import type { Pncp } from "../sources/pncp/store";
import type { QueridoDiario } from "../sources/querido-diario/store";
import type { ReceitaCnpj } from "../sources/receita-cnpj/store";
import type { SancoesCgu } from "../sources/sancoes-cgu/store";
import type { SenadoFederal } from "../sources/senado/store";
import type { Sicaf } from "../sources/sicaf-fornecedores/store";
import type { SiconfiFiscal } from "../sources/siconfi-fiscal/store";
import type { Sinapi } from "../sources/sinapi/store";
import type { TcuInidoneos } from "../sources/tcu-inidoneos/store";
import type { TransparenciaDespesas } from "../sources/transparencia-despesas/store";
import type { Transferegov } from "../sources/transferegov/store";
import type { TseEleitoral } from "../sources/tse-eleitoral/store";

export type AppServices =
  | IbgeLocalidades
  | Cnae
  | CatmatCatser
  | Sicaf
  | SancoesCgu
  | ReceitaCnpj
  | TseEleitoral
  | CamaraDeputados
  | QueridoDiario
  | Capag
  | Pncp
  | TcuInidoneos
  | IbgeEconomia
  | SenadoFederal
  | CmedAnvisa
  | SiconfiFiscal
  | Transferegov
  | PainelPrecos
  | TransparenciaDespesas
  | Sinapi
  | Duck
  | Search
  | Fuzzy
  | CorpusGit
  | Http;

export type ObjectSchema = {
  readonly type: "object";
  readonly properties: Record<string, JsonSchema>;
  readonly required: readonly string[];
};

export class ToolFailure extends Schema.TaggedError<
  ToolFailure,
  { readonly brand: unique symbol }
>()("ToolFailure", { text: Schema.String }) {
  override get message() {
    return this.text;
  }
}

const hasMessage = (value: unknown): value is { readonly message: string } =>
  Predicate.hasProperty(value, "message") && Predicate.isString(value.message);

export const failureText = (error: unknown) =>
  Match.value(error).pipe(
    Match.when(Schema.isSchemaError, () => "Parametros invalidos para a ferramenta."),
    Match.when(hasMessage, (tagged) => tagged.message),
    Match.orElse(() => "Falha ao executar a ferramenta.")
  );

export type Tool = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ObjectSchema;
  readonly handle: (args: unknown) => Effect.Effect<unknown, ToolFailure, AppServices>;
};

const ObjectJson = Schema.Struct({
  properties: Schema.Record(Schema.String, Schema.Any),
  required: Schema.optional(Schema.Array(Schema.String)),
});

const objectSchema = (schema: JsonSchema): ObjectSchema =>
  Schema.decodeUnknownOption(ObjectJson)(schema).pipe(
    Option.match({
      onNone: () => ({
        type: "object" as const,
        properties: {},
        required: [],
      }),
      onSome: (value) => ({
        type: "object" as const,
        properties: value.properties,
        required: value.required ?? [],
      }),
    })
  );

export const defineTool = <
  S extends Schema.Top & { readonly DecodingServices: never },
  E,
  R extends AppServices,
>(spec: {
  readonly name: string;
  readonly description: string;
  readonly input: S;
  readonly run: (args: S["Type"]) => Effect.Effect<unknown, E, R>;
}): Tool => ({
  name: spec.name,
  description: spec.description,
  inputSchema: objectSchema(Schema.toJsonSchemaDocument(spec.input).schema),
  handle: (args) =>
    Schema.decodeUnknownEffect(spec.input)(args).pipe(
      Effect.flatMap(spec.run),
      Effect.mapError((error) => ToolFailure.make({ text: failureText(error) }))
    ),
});
