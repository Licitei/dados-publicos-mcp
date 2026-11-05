import type { ESTree } from "@oxlint/plugins";

import {
  ancestors,
  containsNode,
  isFunctionNode,
  memberPath,
  singleMessage,
  typeText,
  type Node,
} from "../shared/ast.ts";

const testRoots = new Set(["it", "test", "describe", "suite"]);
const iterationMethods = new Set(["forEach", "map", "flatMap", "filter", "reduce"]);

const chainOf = (callee: Node): ReadonlyArray<string> => {
  if (callee.type === "CallExpression") return chainOf(callee.callee);
  return memberPath(callee)?.split(".") ?? [];
};

const testChain = (node: ESTree.CallExpression) => {
  const chain = chainOf(node.callee);
  return chain[0] !== undefined && testRoots.has(chain[0]) ? chain : undefined;
};

const lastFunction = (node: ESTree.CallExpression) => {
  const last = node.arguments.at(-1);
  return isFunctionNode(last) ? last : undefined;
};

const assertionCall = (node: Node) => {
  if (node.type !== "CallExpression") return false;
  const path = memberPath(node.callee) ?? "";
  return /^(?:expect|assert|expectTypeOf)(?:[A-Z.]|$)/.test(path);
};

export const requireTestAssertion = singleMessage(
  "Every test asserts an observable result.",
  "Assert an observable result. Calling setup or the implementation without checking its outcome is not behavioral coverage.",
  (context) => ({
    CallExpression: (node: ESTree.CallExpression) => {
      const chain = testChain(node);
      if (chain === undefined || !["it", "test"].includes(chain[0] ?? "")) return;
      if (
        chain.some((member) =>
          ["describe", "suite", "todo", "skip", "each", "for", "extend", "use"].includes(member)
        )
      )
        return;
      const callback = lastFunction(node);
      if (callback === undefined || node.arguments.length < 2) return;
      if (!containsNode(context, callback.body, assertionCall))
        context.report({ node, messageId: "violation" });
    },
  })
);

export const noTestInLoop = singleMessage(
  "Register parameterized cases with it.each instead of a loop.",
  "Register parameterized cases with it.each or it.effect.each instead of declaring tests in a loop.",
  (context) => ({
    CallExpression: (node: ESTree.CallExpression) => {
      const chain = testChain(node);
      if (chain === undefined || chain.includes("each") || node.callee.type === "CallExpression")
        return;
      for (const parent of ancestors(node)) {
        if (
          [
            "ForStatement",
            "ForOfStatement",
            "ForInStatement",
            "WhileStatement",
            "DoWhileStatement",
          ].includes(parent.type)
        ) {
          context.report({ node: node.callee, messageId: "violation" });
          return;
        }
        if (isFunctionNode(parent)) {
          const owner = parent.parent;
          const iterates =
            owner?.type === "CallExpression" &&
            owner.callee.type === "MemberExpression" &&
            owner.callee.property.type === "Identifier" &&
            iterationMethods.has(owner.callee.property.name);
          if (!iterates) return;
          context.report({ node: node.callee, messageId: "violation" });
          return;
        }
      }
    },
  })
);

export const noTestTimeoutOrSkip = singleMessage(
  "No focused, skipped or timeout-extended tests.",
  "Do not leave focused, skipped or placeholder tests, and keep timeout policy in the vitest config instead of per-test timeouts.",
  (context) => ({
    CallExpression: (node: ESTree.CallExpression) => {
      const chain = testChain(node);
      if (chain === undefined) return;
      if (
        chain.some((member) => ["only", "skip", "todo", "fixme", "setTimeout"].includes(member))
      ) {
        context.report({ node: node.callee, messageId: "violation" });
        return;
      }
      for (const argument of node.arguments.slice(1)) {
        const numeric = argument.type === "Literal" && typeof argument.value === "number";
        const options =
          argument.type === "ObjectExpression" &&
          argument.properties.some(
            (property) =>
              property.type === "Property" &&
              property.key.type === "Identifier" &&
              ["timeout", "retry", "retries"].includes(property.key.name)
          );
        if (numeric || options) context.report({ node: argument, messageId: "violation" });
      }
    },
  })
);

const sleepers = new Set(["Effect.sleep", "Bun.sleep", "Bun.sleepSync", "Atomics.wait"]);
const timers = new Set(["setTimeout", "setInterval", "setImmediate"]);

export const noRealTimeWaitInTests = singleMessage(
  "Do not sleep on real timers in tests.",
  "Do not sleep on real timers in tests. Await an event or drive the Effect TestClock.",
  (context) => {
    const sleeps: Array<ESTree.CallExpression> = [];
    let clockDriven = false;
    return {
      CallExpression: (node: ESTree.CallExpression) => {
        const path = memberPath(node.callee) ?? "";
        if (path === "TestClock.adjust" || path === "TestClock.setTime") clockDriven = true;
        if (timers.has(path) || path === "globalThis.setTimeout")
          context.report({ node, messageId: "violation" });
        else if (sleepers.has(path)) sleeps.push(node);
      },
      "Program:exit": () => {
        if (clockDriven) return;
        for (const call of sleeps) context.report({ node: call, messageId: "violation" });
      },
    };
  }
);

export const noManualEffectRuntimeInTests = singleMessage(
  "Run test Effects with @effect/vitest, not a manual runtime.",
  "Run test Effects with it.effect / layer from @effect/vitest instead of Effect.run* or a hand-built ManagedRuntime.",
  (context) => ({
    MemberExpression: (node: ESTree.MemberExpression) => {
      const path = memberPath(node) ?? "";
      if (
        /^Effect\.run(?:Promise|PromiseExit|Sync|SyncExit|Fork|Callback)$/.test(path) ||
        path === "ManagedRuntime.make"
      )
        context.report({ node, messageId: "violation" });
    },
  })
);

const mockers = new Set([
  "vi.mock",
  "vi.doMock",
  "vi.stubGlobal",
  "vi.hoisted",
  "jest.mock",
  "mock.module",
]);

export const noModuleMocking = singleMessage(
  "Do not mock modules or globals.",
  "Do not mock modules or globals; exercise the real implementation with a fixture layer.",
  (context) => ({
    CallExpression: (node: ESTree.CallExpression) => {
      if (mockers.has(memberPath(node.callee) ?? ""))
        context.report({ node, messageId: "violation" });
    },
  })
);

const isStaticLiteral = (node: Node | null | undefined) =>
  node?.type === "Literal" || (node?.type === "TemplateLiteral" && node.expressions.length === 0);

export const noTautologicalAssertion = singleMessage(
  "Assert the result of production behavior.",
  "Assert the result of production behavior instead of a literal or a value compared with itself.",
  (context) => ({
    CallExpression: (node: ESTree.CallExpression) => {
      const matcher = node.callee;
      if (matcher.type !== "MemberExpression" || matcher.property.type !== "Identifier") return;
      if (!["toBe", "toEqual", "toStrictEqual"].includes(matcher.property.name)) return;
      let subject: Node = matcher.object;
      while (subject.type === "MemberExpression") subject = subject.object;
      if (subject.type !== "CallExpression" || memberPath(subject.callee) !== "expect") return;
      const actual = subject.arguments[0];
      const expected = node.arguments[0];
      if (actual === undefined || expected === undefined) return;
      const same = typeText(context, actual) === typeText(context, expected);
      if (same || (isStaticLiteral(actual) && isStaticLiteral(expected)))
        context.report({ node, messageId: "violation" });
    },
  })
);
