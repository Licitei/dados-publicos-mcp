import type { ESTree } from "@oxlint/plugins";

import {
  ancestors,
  memberPath,
  propertyName,
  singleMessage,
  typeText,
  type Node,
} from "../shared/ast.ts";

const isConstAssertion = (node: ESTree.TSAsExpression) =>
  node.typeAnnotation.type === "TSTypeReference" &&
  node.typeAnnotation.typeName.type === "Identifier" &&
  node.typeAnnotation.typeName.name === "const";

export const noAsCast = singleMessage(
  "Zero-cast slice: model data via Schema and let inference carry types.",
  "Zero-cast slice: model data via Schema and let inference carry types (as const / satisfies are allowed).",
  (context) => ({
    TSAsExpression: (node: ESTree.TSAsExpression) => {
      if (!isConstAssertion(node)) context.report({ node, messageId: "violation" });
    },
    TSTypeAssertion: (node: ESTree.TSTypeAssertion) =>
      context.report({ node, messageId: "violation" }),
    TSNonNullExpression: (node: ESTree.TSNonNullExpression) =>
      context.report({ node, messageId: "violation" }),
  })
);

export const noLetVar = singleMessage(
  "Use const and fold, never let or var.",
  "Use const + fold (reduce) or Effect/Match combinators, never let/var.",
  (context) => ({
    VariableDeclaration: (node: ESTree.VariableDeclaration) => {
      if (node.kind !== "const") context.report({ node, messageId: "violation" });
    },
  })
);

export const noEnum = singleMessage(
  "Closed sets are Schema.Literals, never enum.",
  'Use Schema.Literals([...]) + type X = (typeof X)["Type"] for closed sets, never enum.',
  (context) => ({
    TSEnumDeclaration: (node: ESTree.TSEnumDeclaration) =>
      context.report({ node, messageId: "violation" }),
  })
);

export const noImperativeWhileLoop = singleMessage(
  "Express iteration as filter, reduce or Effect.forEach.",
  "Express iteration as filter/reduce/Effect.forEach, never while/do.",
  (context) => ({
    WhileStatement: (node: ESTree.WhileStatement) =>
      context.report({ node, messageId: "violation" }),
    DoWhileStatement: (node: ESTree.DoWhileStatement) =>
      context.report({ node, messageId: "violation" }),
  })
);

export const noMutationAccumulator = singleMessage(
  "No compound assignment or ++/-- mutation.",
  "No compound-assignment or ++/-- mutation; carry state through reduce over an immutable accumulator.",
  (context) => ({
    AssignmentExpression: (node: ESTree.AssignmentExpression) => {
      if (node.operator !== "=") context.report({ node, messageId: "violation" });
    },
    UpdateExpression: (node: ESTree.UpdateExpression) =>
      context.report({ node, messageId: "violation" }),
  })
);

export const noMutableMappedType = singleMessage(
  "No -readonly escape hatch off a Schema-derived type.",
  "No -readonly escape hatch off a Schema-derived type; build immutably via reduce.",
  (context) => ({
    TSMappedType: (node: ESTree.TSMappedType) => {
      if (node.readonly === "-") context.report({ node, messageId: "violation" });
    },
  })
);

export const switchOnlyInGetMessage = singleMessage(
  "switch is only allowed inside get message().",
  "Branch via Match.value(...).pipe(Match.when/tag/orElse); switch is only allowed inside get message().",
  (context) => ({
    SwitchStatement: (node: ESTree.SwitchStatement) => {
      const inGetMessage = [...ancestors(node)].some(
        (parent) =>
          parent.type === "MethodDefinition" &&
          parent.kind === "get" &&
          propertyName(parent) === "message"
      );
      if (!inGetMessage) context.report({ node, messageId: "violation" });
    },
  })
);

export const noBarrelPassthroughReexport = singleMessage(
  "No barrel pass-through re-exports.",
  "No barrel: do not re-export imported bindings; consumers import them from their source module directly.",
  (context) => {
    const imported = new Set<string>();
    return {
      ImportDeclaration: (node: ESTree.ImportDeclaration) => {
        for (const specifier of node.specifiers) imported.add(specifier.local.name);
      },
      ExportAllDeclaration: (node: ESTree.ExportAllDeclaration) =>
        context.report({ node, messageId: "violation" }),
      ExportNamedDeclaration: (node: ESTree.ExportNamedDeclaration) => {
        if (node.source !== null && node.source !== undefined) {
          if (node.exportKind !== "type" || node.specifiers.length > 0)
            context.report({ node, messageId: "violation" });
          return;
        }
        const local = (specifier: ESTree.ExportSpecifier) =>
          specifier.local.type === "Identifier" ? specifier.local.name : undefined;
        if (node.specifiers.some((specifier) => imported.has(local(specifier) ?? "")))
          context.report({ node, messageId: "violation" });
      },
    };
  }
);

const retryOptionsClassify = (argument: Node | undefined) =>
  argument?.type === "Identifier" ||
  (argument?.type === "ObjectExpression" &&
    argument.properties.some(
      (property) =>
        property.type === "Property" && ["while", "until"].includes(propertyName(property) ?? "")
    ));

export const retryMustClassifyErrors = singleMessage(
  "Classify Effect.retry with a while predicate or a named Schedule policy.",
  "Classify Effect.retry: pass an options object with a while: predicate branching on this.code, or a single named Schedule policy identifier, never a blind schedule.",
  (context) => ({
    CallExpression: (node: ESTree.CallExpression) => {
      if (memberPath(node.callee)?.endsWith("Effect.retry") !== true) return;
      if (!retryOptionsClassify(node.arguments.at(-1)))
        context.report({ node, messageId: "violation" });
    },
  })
);

export const noUnboundedConcurrency = singleMessage(
  "Bound public-API fan-out with a small integer concurrency (4 or less).",
  'Bound public-API fan-out: use a small integer concurrency (4 or less, e.g. concurrency: 2) in Effect.forEach/Effect.all, never "unbounded" or "inherit" against rate-budgetless gov.br hosts.',
  (context) => ({
    Property: (node: ESTree.Property) => {
      if (propertyName(node) !== "concurrency") return;
      const value = node.value;
      const unbounded =
        value.type === "Literal" &&
        (typeof value.value === "string" || (typeof value.value === "number" && value.value > 4));
      if (unbounded) context.report({ node, messageId: "violation" });
    },
  })
);

export const noV3ServiceApi = singleMessage(
  "Define services with Context.Service and Layer.effect; the v3 service APIs are banned.",
  "Define services with Context.Service<Self, Effect.Success<typeof make>>() + Layer.effect; Context.GenericTag and Effect.Tag are banned in the v4 slice.",
  (context) => ({
    MemberExpression: (node: ESTree.MemberExpression) => {
      const path = memberPath(node);
      if (path === "Context.GenericTag" || path === "Effect.Tag")
        context.report({ node, messageId: "violation" });
    },
  })
);

export const noContextTag = singleMessage(
  "Context.Tag is the Effect 3 service constructor.",
  "Define services with Context.Service and an exported Layer.effect. Context.Tag is the Effect 3 service constructor.",
  (context) => ({
    MemberExpression: (node: ESTree.MemberExpression) => {
      if (memberPath(node) === "Context.Tag") context.report({ node, messageId: "violation" });
    },
  })
);

export const noEffectService = singleMessage(
  "Effect.Service is not the Effect 4 service constructor.",
  "Define services with Context.Service and an exported Layer.effect. Effect.Service is not the Effect 4 service constructor.",
  (context) => ({
    MemberExpression: (node: ESTree.MemberExpression) => {
      if (memberPath(node) === "Effect.Service") context.report({ node, messageId: "violation" });
    },
  })
);

const serviceClassBase = (declaration: ESTree.Class) => {
  const base = declaration.superClass;
  if (base === null || base === undefined || base.type !== "CallExpression") return false;
  const root = base.callee.type === "CallExpression" ? base.callee : base;
  return memberPath(root.callee)?.startsWith("Context.Service") === true;
};

const exportsLayerEffect = (context: Parameters<typeof typeText>[0], program: ESTree.Program) =>
  program.body.some(
    (statement) =>
      statement.type === "ExportNamedDeclaration" &&
      statement.declaration?.type === "VariableDeclaration" &&
      statement.declaration.declarations.some((declarator) =>
        typeText(context, declarator.init).replace(/\s+/g, "").startsWith("Layer.effect(")
      )
  );

export const serviceNeedsLayer = singleMessage(
  "A Context.Service exports its Layer.effect in the same module.",
  "A Context.Service must export its Layer (export const XLayer = Layer.effect(X)(make)) in the same module.",
  (context) => {
    const services: Array<ESTree.Class> = [];
    return {
      ClassDeclaration: (node: ESTree.Class) => {
        if (serviceClassBase(node)) services.push(node);
      },
      "Program:exit": (program: ESTree.Program) => {
        if (services.length === 0 || exportsLayerEffect(context, program)) return;
        for (const service of services) context.report({ node: service, messageId: "violation" });
      },
    };
  }
);

export const configViaContextReference = singleMessage(
  "Configuration is a Context.Reference with a default, not a Context.Service.",
  "Configuration is a Context.Reference over a Schema.Struct with a defaultValue thunk, not a Context.Service.",
  (context) => ({
    ClassDeclaration: (node: ESTree.Class) => {
      if (serviceClassBase(node) && node.id !== null && /Config(uration)?$/.test(node.id.name))
        context.report({ node, messageId: "violation" });
    },
  })
);

export const noRawJson = singleMessage(
  "JSON only crosses the boundary through a Schema.",
  "Decode and encode JSON through a Schema (Schema.fromJsonString / http.json(url, Schema)), never JSON.parse or JSON.stringify.",
  (context) => ({
    CallExpression: (node: ESTree.CallExpression) => {
      const path = memberPath(node.callee);
      if (path === "JSON.parse" || path === "JSON.stringify")
        context.report({ node, messageId: "violation" });
    },
  })
);
