import { Effect, Match, Schema } from "effect";
import type { JsonSchema } from "effect/JsonSchema";
import type { HttpClient } from "effect/unstable/http";
import type { Db } from "../kernel/db/client";
import type { Embedder } from "../kernel/embed/embedder";
import type { CamaraDeputados } from "../sources/camara-deputados/store";
import type { Capag } from "../sources/capag/store";
import type { CatmatCatser } from "../sources/catmat-catser/store";
import type { CmedAnvisa } from "../sources/cmed-anvisa/store";
import type { Cnae } from "../sources/cnae/store";
import type { IbgeEconomia } from "../sources/ibge-economia/store";
import type { IbgeLocalidades } from "../sources/ibge-localidades/store";
import type { Legislacao } from "../sources/legislacao/store";
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
  | Legislacao
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
  | Db
  | Embedder
  | HttpClient.HttpClient;

export type ObjectSchema = {
  readonly type: "object";
  readonly properties: Record<string, JsonSchema>;
  readonly required: readonly string[];
};

export type Tool = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ObjectSchema;
  readonly handle: (
    args: unknown
  ) => Effect.Effect<unknown, unknown, AppServices>;
};

const objectSchema = (schema: JsonSchema): ObjectSchema =>
  Match.value(schema).pipe(
    Match.when(
      (value): value is JsonSchema & { properties: Record<string, JsonSchema> } =>
        "properties" in value && value.properties !== undefined,
      (value) => ({
        type: "object" as const,
        properties: value.properties,
        required:
          "required" in value && Array.isArray(value.required)
            ? value.required
            : [],
      })
    ),
    Match.orElse(() => ({
      type: "object" as const,
      properties: {},
      required: [],
    }))
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
    Schema.decodeUnknownEffect(spec.input)(args).pipe(Effect.flatMap(spec.run)),
});
