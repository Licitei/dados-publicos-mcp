import { Effect, Schema } from "effect";
import { Duck } from "../../kernel/duck/duck";
import { NonEmptyString, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

export const consultarSql = defineTool({
  name: "consultar_sql",
  description:
    "Executa uma única consulta SELECT ou WITH sobre índices locais. Conexão isolada, banco somente leitura, acesso externo e extensões desabilitados, rollback obrigatório, prazo de 5 segundos. Retorna colunas e linhas; limite padrão 200, máximo 1000. Descubra tabelas e colunas em fontes antes de consultar.",
  input: Schema.Struct({ sql: NonEmptyString, limite: Schema.optionalKey(positiveIntMax(1000)) }),
  run: (args) => Duck.pipe(Effect.flatMap((duck) => duck.readOnly(args.sql, args.limite))),
});
