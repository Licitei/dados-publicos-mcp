import type { ESTree } from "@oxlint/plugins";

import { callPath, memberPath, singleMessage } from "../shared/ast.ts";

export const noProcessEnvInAlchemyRun = singleMessage(
  "Read deploy-time values with Effect Config.",
  "Read deploy-time values with Effect Config. Do not use process.env in infra.",
  (context) => ({
    MemberExpression: (node: ESTree.MemberExpression) => {
      if (memberPath(node) === "process.env") context.report({ node, messageId: "violation" });
    },
  })
);

export const noStackAsVoid = singleMessage(
  "Alchemy stacks return typed outputs.",
  "Alchemy stacks return typed outputs. Do not pipe Effect.asVoid over a stack body.",
  (context) => ({
    MemberExpression: (node: ESTree.MemberExpression) => {
      if (memberPath(node) === "Effect.asVoid") context.report({ node, messageId: "violation" });
    },
  })
);

const pascalCase = /^[A-Z][A-Za-z0-9]*$/;

export const noYieldResourceConstructor = singleMessage(
  "Declare resources as module-level consts and yield those bindings.",
  "Declare Resources as module-level consts and yield those bindings. The run file is the composition root, not the resource catalog.",
  (context) => ({
    YieldExpression: (node: ESTree.YieldExpression) => {
      const argument = node.argument;
      if (argument?.type !== "CallExpression") return;
      const name = (callPath(argument) ?? "").split(".").at(-1) ?? "";
      const [first] = argument.arguments;
      if (pascalCase.test(name) && first?.type === "Literal" && typeof first.value === "string")
        context.report({ node: argument.callee, messageId: "violation" });
    },
  })
);
