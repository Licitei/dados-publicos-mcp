import type { ESTree } from "@oxlint/plugins";

import {
  baseName,
  callPath,
  containsNode,
  enclosingFunction,
  functionBinding,
  isEffectGenBody,
  makeRule,
  memberPath,
  singleMessage,
  soleExpression,
  unwrap,
  type Node,
} from "../shared/ast.ts";

const directive = /^\s*(?:oxlint|eslint)-(?:disable|enable)/;

export const noSourceComments = singleMessage(
  "Source comments are prohibited; keep intent in named code.",
  "Source comments are prohibited; keep intent in named code. Only a shebang and oxlint-disable directives are allowed.",
  (context) => ({
    Program: () => {
      for (const comment of context.sourceCode.getAllComments()) {
        const type: string = comment.type;
        if (
          type === "Shebang" ||
          (type === "Line" && comment.value.startsWith("!/")) ||
          directive.test(comment.value)
        )
          continue;
        context.report({ node: comment, messageId: "violation" });
      }
    },
  })
);

export const filenameCase = singleMessage(
  "Source filenames use kebab-case.",
  "Source filenames must use kebab-case.",
  (context) => ({
    Program: (node: ESTree.Program) => {
      const base = baseName(context).split(".")[0] ?? "";
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(base))
        context.report({ node, messageId: "violation" });
    },
  })
);

export const noInOperator = singleMessage(
  "Do not probe keys with the in operator.",
  "Do not probe keys with the in operator. Use a tagged discriminant, Effect Schema, or Object.hasOwn at an explicit boundary.",
  (context) => ({
    BinaryExpression: (node: ESTree.BinaryExpression) => {
      if (node.operator === "in") context.report({ node, messageId: "violation" });
    },
  })
);

export const noReflectGet = singleMessage(
  "Do not read properties through Reflect.get.",
  "Do not read properties through Reflect.get; decode the value with a Schema.",
  (context) => ({
    CallExpression: (node: ESTree.CallExpression) => {
      if (memberPath(node.callee) === "Reflect.get")
        context.report({ node, messageId: "violation" });
    },
  })
);

export const noReflectApply = singleMessage(
  "Do not call through Reflect.apply.",
  "Replace Reflect.apply with a typed function call. Model dynamic dispatch behind a named interface.",
  (context) => ({
    CallExpression: (node: ESTree.CallExpression) => {
      if (memberPath(node.callee) === "Reflect.apply")
        context.report({ node, messageId: "violation" });
    },
  })
);

export const noHandwrittenTypePredicates = singleMessage(
  "Narrow with Schema.is or a tagged discriminant, not a hand-written type predicate.",
  "Do not hand-write type predicates (x is T); narrow with Schema.is(Schema) or a tagged discriminant.",
  (context) => {
    const check = (node: ESTree.Function) => {
      if (node.returnType?.typeAnnotation.type === "TSTypePredicate")
        context.report({ node, messageId: "violation" });
    };
    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    };
  }
);

const isJsonStringify = (node: Node | null | undefined) =>
  node?.type === "CallExpression" && memberPath(node.callee) === "JSON.stringify";

export const noJsonStringComparison = singleMessage(
  "Do not compare values through JSON.stringify.",
  "Do not compare values through JSON.stringify; use Equal.equals on Data values or Schema.toEquivalence of the owning Schema.",
  (context) => ({
    BinaryExpression: (node: ESTree.BinaryExpression) => {
      if (
        ["==", "===", "!=", "!=="].includes(node.operator) &&
        isJsonStringify(node.left) &&
        isJsonStringify(node.right)
      )
        context.report({ node, messageId: "violation" });
    },
  })
);

const genericJsonName =
  /^(?:parse|decode|encode|stringify|serialize|deserialize|to|from)Json(?:String)?$|^json(?:Parse|Decode|Encode|Codec)$/i;
const jsonCodecCalls = new Set(["Schema.fromJsonString", "Schema.parseJson"]);

export const noGenericJsonCodecWrappers = singleMessage(
  "Do not hide JSON encoding or decoding behind a generic helper.",
  "Do not hide JSON encoding or decoding behind a generic helper; use the concrete Effect Schema at the typed callsite.",
  (context) => {
    const check = (node: Node) => {
      const binding = functionBinding(node);
      if (binding === undefined) return;
      const parameters = new Set(
        binding.fn.params.flatMap((parameter) =>
          parameter.type === "Identifier" ? [parameter.name] : []
        )
      );
      const parameterized = containsNode(context, binding.fn.body, (child) => {
        if (child.type !== "CallExpression" || !jsonCodecCalls.has(callPath(child) ?? ""))
          return false;
        const argument = child.arguments[0];
        return argument?.type === "Identifier" && parameters.has(argument.name);
      });
      if (parameterized || genericJsonName.test(binding.name))
        context.report({ node, messageId: "violation" });
    };
    return { FunctionDeclaration: check, VariableDeclarator: check };
  }
);

export const preferEffectForeach = singleMessage(
  "Use Effect.forEach to traverse a collection.",
  "Use Effect.forEach to traverse a collection. Effect.all(items.map(...)) loses per-item identity and bounded concurrency.",
  (context) => ({
    CallExpression: (node: ESTree.CallExpression) => {
      if (memberPath(node.callee) !== "Effect.all") return;
      const collection = node.arguments[0];
      if (
        collection?.type === "CallExpression" &&
        collection.callee.type === "MemberExpression" &&
        !collection.callee.computed &&
        collection.callee.property.type === "Identifier" &&
        collection.callee.property.name === "map"
      )
        context.report({ node, messageId: "violation" });
    },
  })
);

export const noServiceOption = singleMessage(
  "Do not use Effect.serviceOption.",
  "Do not use Effect.serviceOption. Yield the service and provide it in the Layer, including a void implementation when the capability is absent.",
  (context) => ({
    MemberExpression: (node: ESTree.MemberExpression) => {
      if (memberPath(node) === "Effect.serviceOption")
        context.report({ node, messageId: "violation" });
    },
  })
);

export const noThenInEffectGen = singleMessage(
  "Do not chain Promise .then inside Effect.gen or Effect.fn.",
  "Do not chain Promise .then inside Effect.gen/Effect.fn; lift the native call once with Effect.tryPromise and yield* it.",
  (context) => ({
    CallExpression: (node: ESTree.CallExpression) => {
      if (
        node.callee.type === "MemberExpression" &&
        !node.callee.computed &&
        node.callee.property.type === "Identifier" &&
        node.callee.property.name === "then" &&
        isEffectGenBody(enclosingFunction(node))
      )
        context.report({ node: node.callee.property, messageId: "violation" });
    },
  })
);

const runners = /^Effect\.run(?:Promise|PromiseExit|Sync|SyncExit|Fork|Callback)$/;

export const noUnownedEffectRun = singleMessage(
  "Run Effects only through the owning process runtime.",
  "Run Effects through the owning process runtime (src/runtime.ts, src/index.ts, tooling, tests); do not run Effects in domain code.",
  (context) => ({
    MemberExpression: (node: ESTree.MemberExpression) => {
      if (runners.test(memberPath(node) ?? "")) context.report({ node, messageId: "violation" });
    },
  })
);

export const noExtraManagedRuntime = makeRule({
  description: "One process-scoped ManagedRuntime.",
  messages: {
    violation:
      "One process-scoped ManagedRuntime lives in src/runtime.ts. Do not mint extra runtimes.",
  },
  schema: [
    { type: "object", properties: { max: { type: "number" } }, additionalProperties: false },
  ],
  create: (context) => {
    const max: number = (context.options[0] as { readonly max?: number } | undefined)?.max ?? 0;
    const calls: Array<ESTree.CallExpression> = [];
    return {
      CallExpression: (node: ESTree.CallExpression) => {
        if (memberPath(node.callee) === "ManagedRuntime.make") calls.push(node);
      },
      "Program:exit": () => {
        for (const call of calls.slice(max)) context.report({ node: call, messageId: "violation" });
      },
    };
  },
});

export const noDirectFetch = singleMessage(
  "Do not call fetch directly.",
  "Do not call fetch directly. Use the kernel Http service (src/kernel/http) that owns the boundary.",
  (context) => ({
    CallExpression: (node: ESTree.CallExpression) => {
      const path = memberPath(node.callee);
      if (path === "fetch" || path === "globalThis.fetch" || path === "window.fetch")
        context.report({ node: node.callee, messageId: "violation" });
    },
  })
);

const genericName =
  /(?:^|[a-z0-9])(?:Helper|Helpers|Util|Utils|Utility|Manager|Wrapper)$|^(?:helper|helpers|util|utils|misc|doStuff|handleData|processData)$/;

export const noGenericHelperNames = singleMessage(
  "Name functions with the domain they serve.",
  "Name functions with the domain they serve instead of helper, util, wrapper or manager.",
  (context) => {
    const check = (node: Node) => {
      const binding = functionBinding(node);
      if (binding !== undefined && genericName.test(binding.name))
        context.report({ node, messageId: "violation" });
    };
    return { FunctionDeclaration: check, VariableDeclarator: check };
  }
);

export const noThinForwardingWrappers = singleMessage(
  "Do not wrap a function only to forward its parameters.",
  "A function that only forwards its parameters to another function adds no meaning; use the target directly.",
  (context) => {
    const check = (node: Node) => {
      const binding = functionBinding(node);
      if (
        binding === undefined ||
        binding.fn.params.length === 0 ||
        binding.fn.async ||
        binding.fn.generator
      )
        return;
      const names = binding.fn.params.map((parameter) =>
        parameter.type === "Identifier" ? parameter.name : undefined
      );
      if (names.some((name) => name === undefined)) return;
      const call = unwrap(soleExpression(binding.fn));
      if (
        call?.type !== "CallExpression" ||
        (call.callee.type !== "Identifier" && memberPath(call.callee) === undefined)
      )
        return;
      const forwarded = call.arguments.map((argument) =>
        argument.type === "Identifier" ? argument.name : undefined
      );
      if (
        forwarded.length === names.length &&
        forwarded.every((name, index) => name === names[index])
      )
        context.report({ node, messageId: "violation" });
    };
    return { FunctionDeclaration: check, VariableDeclarator: check };
  }
);

export const noUnknownTypeAliases = singleMessage(
  "Type aliases must not hide unknown.",
  "Type alias hides `unknown`. Keep `unknown` explicit at the parsing boundary; otherwise use the parsed owner type.",
  (context) => ({
    TSTypeAliasDeclaration: (node: ESTree.TSTypeAliasDeclaration) => {
      if (node.typeAnnotation.type === "TSUnknownKeyword")
        context.report({ node: node.id, messageId: "violation" });
    },
  })
);

export const noUnsafeDictionaryType = singleMessage(
  "Dictionary types widen known keys.",
  "Do not model data as an open string dictionary (Record<string, T> / index signature); derive the shape from a Schema.",
  (context) => ({
    TSTypeReference: (node: ESTree.TSTypeReference) => {
      if (
        node.typeName.type === "Identifier" &&
        node.typeName.name === "Record" &&
        node.typeArguments?.params[0]?.type === "TSStringKeyword"
      )
        context.report({ node, messageId: "violation" });
    },
    TSIndexSignature: (node: ESTree.TSIndexSignature) => {
      if (node.parameters[0]?.typeAnnotation?.typeAnnotation.type === "TSStringKeyword")
        context.report({ node, messageId: "violation" });
    },
  })
);
