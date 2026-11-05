import type { ESTree } from "@oxlint/plugins";

import {
  callPath,
  containsNode,
  functionBinding,
  makeRule,
  memberPath,
  propertyName,
  singleMessage,
  soleExpression,
  typeText,
  unwrap,
  type Node,
} from "../shared/ast.ts";

const helperName = /^(to|from|map|wrap|is)[A-Za-z0-9_]*Error$/;
const failureName = /(Failure|Fault)$/;
const errorClassName = /(Error|Fault|Failure)$/;
const errorFieldNames = new Set(["operation", "message", "cause"]);

const isNewError = (node: Node) =>
  node.type === "NewExpression" &&
  node.callee.type === "Identifier" &&
  errorClassName.test(node.callee.name);

export const taggedErrorBase = (declaration: ESTree.Class) => {
  const base = declaration.superClass;
  if (base === null || base === undefined || base.type !== "CallExpression") return undefined;
  const root = base.callee.type === "CallExpression" ? base.callee : base;
  const path = memberPath(root.callee);
  return path?.startsWith("Schema.TaggedError") === true ? base : undefined;
};

export const taggedErrorFields = (base: ESTree.CallExpression) => {
  const last = base.arguments.at(-1);
  return last?.type === "ObjectExpression" ? last : undefined;
};

const fieldNames = (fields: ESTree.ObjectExpression) =>
  fields.properties.map((property) =>
    property.type === "Property" ? propertyName(property) : undefined
  );

const messageGetter = (declaration: ESTree.Class) =>
  declaration.body.body.find(
    (member) =>
      member.type === "MethodDefinition" &&
      member.kind === "get" &&
      propertyName(member) === "message"
  );

export const noThrow = singleMessage(
  "Errors flow through Effect.fail, never throw.",
  "Errors flow through Effect.fail, never throw.",
  (context) => ({
    ThrowStatement: (node: ESTree.ThrowStatement) =>
      context.report({ node, messageId: "violation" }),
  })
);

export const noInstanceof = singleMessage(
  "Branch on this.code via get message() or Match.tag, never instanceof.",
  "Branch on this.code via switch in get message() or Match.tag, never instanceof.",
  (context) => ({
    BinaryExpression: (node: ESTree.BinaryExpression) => {
      if (node.operator === "instanceof") context.report({ node, messageId: "violation" });
    },
  })
);

export const noStatementTryCatchFinally = singleMessage(
  "Capture faults with Effect.tryPromise, acquire resources with Effect.acquireRelease.",
  "Capture faults with Effect.tryPromise({ try, catch }); acquire resources with Effect.acquireRelease, never statement try/catch/finally.",
  (context) => ({
    TryStatement: (node: ESTree.TryStatement) => context.report({ node, messageId: "violation" }),
  })
);

export const noErrorHelperFunctions = singleMessage(
  "No error wrapper or helper functions; build the error inline at the failure site.",
  "No error wrapper/helper functions (toXError, mapXError, wrapError). Build the error inline as new XError({ code, ... }) at the failure site.",
  (context) => {
    const check = (node: Node) => {
      const binding = functionBinding(node);
      if (binding === undefined) return;
      const { name, fn } = binding;
      const returnType = typeText(context, fn.returnType?.typeAnnotation);
      const flagged =
        helperName.test(name) ||
        failureName.test(name) ||
        (errorClassName.test(returnType) && containsNode(context, fn.body, isNewError));
      if (flagged) context.report({ node, messageId: "violation" });
    };
    return {
      FunctionDeclaration: check,
      VariableDeclarator: check,
    };
  }
);

export const noThinErrorFactories = singleMessage(
  "Construct the tagged domain error at the failure site.",
  "Construct the tagged domain error at the failure site; a thin error factory hides the operation and cause without adding semantics.",
  (context) => {
    const check = (node: Node) => {
      const binding = functionBinding(node);
      if (binding === undefined) return;
      const result = unwrap(soleExpression(binding.fn));
      const constructed =
        result?.type === "NewExpression" &&
        result.callee.type === "Identifier" &&
        errorClassName.test(result.callee.name);
      const failed =
        result?.type === "CallExpression" &&
        callPath(result) === "Effect.fail" &&
        unwrap(result.arguments[0])?.type === "NewExpression";
      if (constructed || failed) context.report({ node, messageId: "violation" });
    };
    return { FunctionDeclaration: check, VariableDeclarator: check };
  }
);

export const noWrapOnlyErrors = makeRule({
  description: "A tagged error carrying only operation/message and cause is a generic wrapper.",
  messages: {
    wrapper:
      "A tagged error holding only operation/message and cause is a generic wrapper; model the domain failure with a code or keep the source failure.",
    callback:
      "Do not wrap a failure into an error carrying only the cause; keep the source failure or add domain meaning with a code.",
  },
  create: (context) => ({
    ClassDeclaration: (node: ESTree.Class) => {
      const base = taggedErrorBase(node);
      const fields = base === undefined ? undefined : taggedErrorFields(base);
      if (fields === undefined) return;
      const names = fieldNames(fields);
      if (
        names.includes("cause") &&
        names.every((name) => name !== undefined && errorFieldNames.has(name))
      )
        context.report({ node: node.id ?? node, messageId: "wrapper" });
    },
    CallExpression: (node: ESTree.CallExpression) => {
      const path = memberPath(node.callee);
      if (
        path === undefined ||
        !/^Effect\.(mapError|catch|catchAll|catchCause|orElseFail)$/.test(path)
      )
        return;
      const callback = node.arguments.find(
        (argument): argument is ESTree.Function =>
          argument.type === "ArrowFunctionExpression" || argument.type === "FunctionExpression"
      );
      const parameter = callback?.params[0];
      if (callback === undefined || parameter?.type !== "Identifier") return;
      const result = unwrap(soleExpression(callback));
      const fields = result?.type === "NewExpression" ? unwrap(result.arguments[0]) : undefined;
      if (fields?.type !== "ObjectExpression" || fields.properties.length !== 1) return;
      const [only] = fields.properties;
      if (
        only?.type === "Property" &&
        only.value.type === "Identifier" &&
        only.value.name === parameter.name
      )
        context.report({ node: callback, messageId: "callback" });
    },
  }),
});

const swallowers = new Set([
  "Effect.ignore",
  "Effect.ignoreLogged",
  "Effect.orElseSucceed",
  "Effect.option",
  "Effect.exit",
]);
const swallowingCatchers = new Set(["Effect.catch", "Effect.catchAll", "Effect.catchCause"]);

const isTryPromise = (node: Node | null | undefined) => {
  const expression = unwrap(node);
  return expression?.type === "CallExpression" && callPath(expression) === "Effect.tryPromise";
};

const discardsFailure = (node: Node | null | undefined) => {
  const expression = unwrap(node);
  if (expression === null || expression === undefined) return false;
  if (expression.type === "MemberExpression") return swallowers.has(memberPath(expression) ?? "");
  if (expression.type !== "CallExpression") return false;
  const path = callPath(expression);
  if (path === undefined) return false;
  if (swallowers.has(path)) return true;
  if (!swallowingCatchers.has(path)) return false;
  const callback = expression.arguments.find(
    (argument): argument is ESTree.Function =>
      argument.type === "ArrowFunctionExpression" || argument.type === "FunctionExpression"
  );
  const result = callback === undefined ? undefined : unwrap(soleExpression(callback));
  return (
    result?.type === "Identifier" ||
    memberPath(result) === "Effect.void" ||
    (result?.type === "CallExpression" && callPath(result) === "Effect.succeed")
  );
};

export const noSwallowedTryPromise = singleMessage(
  "Do not discard an Effect.tryPromise failure.",
  "Do not discard an Effect.tryPromise failure; handle the declared failure or let it propagate.",
  (context) => ({
    CallExpression: (node: ESTree.CallExpression) => {
      const path = memberPath(node.callee);
      const direct = path !== undefined && swallowers.has(path) && isTryPromise(node.arguments[0]);
      const directCatch =
        path !== undefined &&
        swallowingCatchers.has(path) &&
        isTryPromise(node.arguments[0]) &&
        discardsFailure(node);
      const piped =
        node.callee.type === "MemberExpression" &&
        !node.callee.computed &&
        node.callee.property.type === "Identifier" &&
        node.callee.property.name === "pipe" &&
        isTryPromise(node.callee.object) &&
        node.arguments.some(discardsFailure);
      if (direct || directCatch || piped) context.report({ node, messageId: "violation" });
    },
  })
);

const swallowedValue = (node: Node | null | undefined): boolean => {
  const value = unwrap(node);
  if (value === null || value === undefined) return true;
  if (value.type === "Literal") return true;
  if (value.type === "Identifier") return value.name === "undefined";
  if (value.type === "UnaryExpression") return value.operator === "void";
  if (value.type === "ArrayExpression") return value.elements.length === 0;
  if (value.type === "ObjectExpression") return value.properties.length === 0;
  return false;
};

export const noSwallowedPromiseCatch = singleMessage(
  "Do not swallow a rejection with .catch(() => undefined).",
  "Do not swallow a rejection with .catch(() => undefined); handle the failure or let it propagate.",
  (context) => ({
    CallExpression: (node: ESTree.CallExpression) => {
      if (node.callee.type !== "MemberExpression") return;
      if (
        node.callee.computed ||
        node.callee.property.type !== "Identifier" ||
        node.callee.property.name !== "catch"
      )
        return;
      const callback = node.arguments[0];
      if (callback?.type !== "ArrowFunctionExpression" && callback?.type !== "FunctionExpression")
        return;
      const empty = callback.body?.type === "BlockStatement" && callback.body.body.length === 0;
      if (empty || swallowedValue(soleExpression(callback)))
        context.report({ node, messageId: "violation" });
    },
  })
);

export const noDataTaggedError = singleMessage(
  "Domain failures are Schema.TaggedError.",
  "Domain failures are Schema.TaggedError. Data.TaggedError is not serializable Schema.",
  (context) => ({
    MemberExpression: (node: ESTree.MemberExpression) => {
      if (memberPath(node) === "Data.TaggedError") context.report({ node, messageId: "violation" });
    },
  })
);

export const errorClassMustUseTaggedError = singleMessage(
  "Error classes must extend Schema.TaggedError.",
  "Error classes must extend Schema.TaggedError<Self>()('Name', {...}); no class extends Error / Data.TaggedError.",
  (context) => ({
    ClassDeclaration: (node: ESTree.Class) => {
      if (
        node.id !== null &&
        errorClassName.test(node.id.name) &&
        taggedErrorBase(node) === undefined
      )
        context.report({ node, messageId: "violation" });
    },
  })
);

export const errorCodeDiscrimination = singleMessage(
  "Tagged errors discriminate failures with a code field or a switch in get message().",
  "Discriminate failures: add a Schema.Literals code field and switch(this.code) in get message(), per the gold standard.",
  (context) => ({
    ClassDeclaration: (node: ESTree.Class) => {
      if (node.id === null || !errorClassName.test(node.id.name)) return;
      const base = taggedErrorBase(node);
      if (base === undefined) return;
      const fields = taggedErrorFields(base);
      const hasCode = fields !== undefined && fieldNames(fields).includes("code");
      const getter = messageGetter(node);
      const hasSwitch =
        getter?.type === "MethodDefinition" &&
        containsNode(context, getter.value, (child) => child.type === "SwitchStatement");
      if (!hasCode && !hasSwitch) context.report({ node, messageId: "violation" });
    },
  })
);

export const taggedErrorNeedsMessageGetter = singleMessage(
  "Every Schema.TaggedError declares a get message().",
  "A Schema.TaggedError class must declare `override get message()` with the pt-BR user-facing text.",
  (context) => ({
    ClassDeclaration: (node: ESTree.Class) => {
      if (taggedErrorBase(node) !== undefined && messageGetter(node) === undefined)
        context.report({ node: node.id ?? node, messageId: "violation" });
    },
  })
);

export const errorCodeMustBeLiterals = singleMessage(
  "The code field of a tagged error is a Schema.Literals set.",
  "The `code` field of a tagged error must be a Schema.Literals([...]) closed set.",
  (context) => {
    const literalSets = new Set<string>();
    const declared = new Set<string>();
    return {
      Program: (program: ESTree.Program) => {
        for (const statement of program.body) {
          const declaration =
            statement.type === "ExportNamedDeclaration" && statement.declaration
              ? statement.declaration
              : statement;
          if (declaration.type !== "VariableDeclaration") continue;
          for (const declarator of declaration.declarations) {
            if (declarator.id.type !== "Identifier") continue;
            declared.add(declarator.id.name);
            const path = callPath(unwrap(declarator.init));
            if (path === "Schema.Literals" || path === "Schema.Literal")
              literalSets.add(declarator.id.name);
          }
        }
      },
      ClassDeclaration: (node: ESTree.Class) => {
        const base = taggedErrorBase(node);
        const fields = base === undefined ? undefined : taggedErrorFields(base);
        const code = fields?.properties.find(
          (property) => property.type === "Property" && propertyName(property) === "code"
        );
        if (code?.type !== "Property") return;
        const value = unwrap(code.value);
        const path = callPath(value);
        const valid =
          path === "Schema.Literals" ||
          path === "Schema.Literal" ||
          (value?.type === "Identifier" &&
            (literalSets.has(value.name) || !declared.has(value.name)));
        if (!valid) context.report({ node: code, messageId: "violation" });
      },
    };
  }
);

export const noWidenedEffectErrorChannel = singleMessage(
  "Tagged-only error channel: never annotate Effect.Effect with Error, unknown or any in the E slot.",
  "Tagged-only error channel: never annotate Effect.Effect with Error/unknown/any in the E slot; let inference carry the Schema.TaggedError union.",
  (context) => ({
    TSTypeReference: (node: ESTree.TSTypeReference) => {
      if (node.typeName.type !== "TSQualifiedName") return;
      const { left, right } = node.typeName;
      if (left.type !== "Identifier" || left.name !== "Effect" || right.name !== "Effect") return;
      const channel = node.typeArguments?.params[1];
      if (channel === undefined) return;
      if (["Error", "unknown", "any"].includes(typeText(context, channel)))
        context.report({ node, messageId: "violation" });
    },
  })
);
