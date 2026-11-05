import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

export type Node = ESTree.Node;
export const memberPath = (node: Node | null | undefined): string | undefined => {
  if (node === null || node === undefined) return undefined;
  if (node.type === "Identifier") return node.name;
  if (node.type === "ChainExpression") return memberPath(node.expression);
  if (node.type === "TSNonNullExpression") return memberPath(node.expression);
  if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") {
    const owner = memberPath(node.object);
    return owner === undefined ? undefined : `${owner}.${node.property.name}`;
  }
  return undefined;
};

export const callPath = (node: Node | null | undefined) =>
  node?.type === "CallExpression" ? memberPath(node.callee) : undefined;

export const unwrap = (node: Node | null | undefined): Node | null | undefined => {
  if (node === null || node === undefined) return node;
  if (
    node.type === "ChainExpression" ||
    node.type === "TSAsExpression" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "TSNonNullExpression" ||
    node.type === "TSTypeAssertion" ||
    node.type === "ParenthesizedExpression"
  )
    return unwrap(node.expression);
  return node;
};

export const propertyName = (property: Node): string | undefined => {
  if (
    property.type !== "Property" &&
    property.type !== "MethodDefinition" &&
    property.type !== "PropertyDefinition"
  )
    return undefined;
  if (property.computed) return undefined;
  if (property.key.type === "Identifier") return property.key.name;
  if (property.key.type === "Literal") return String(property.key.value);
  return undefined;
};

export const filenameOf = (context: Context) => context.filename.replaceAll("\\", "/");

export const baseName = (context: Context) => filenameOf(context).split("/").at(-1) ?? "";

export const hasPathSegment = (context: Context, segment: string) =>
  `/${filenameOf(context)}`.includes(`/${segment}`);

export const descendants = function* (
  root: Node,
  visitorKeys: Record<string, ReadonlyArray<string>>
): Generator<Node> {
  const pending: Array<unknown> = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      for (const item of current) pending.push(item);
      continue;
    }
    const node = current as Node;
    if (typeof node.type !== "string") continue;
    yield node;
    for (const key of visitorKeys[node.type] ?? [])
      pending.push((node as unknown as Record<string, unknown>)[key]);
  }
};

export const containsNode = (
  context: Context,
  root: Node | null | undefined,
  predicate: (node: Node) => boolean
) => {
  if (root === null || root === undefined) return false;
  for (const node of descendants(root, context.sourceCode.visitorKeys))
    if (predicate(node)) return true;
  return false;
};

export const ancestors = function* (node: Node): Generator<Node> {
  let current: Node | null | undefined = node.parent;
  while (current !== null && current !== undefined) {
    yield current;
    current = current.parent;
  }
};

export const isFunctionNode = (node: Node | null | undefined): node is ESTree.Function =>
  node !== null &&
  node !== undefined &&
  (node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression");

export const enclosingFunction = (node: Node) => {
  for (const parent of ancestors(node)) if (isFunctionNode(parent)) return parent;
  return undefined;
};

export const isEffectGenBody = (fn: ESTree.Function | undefined) => {
  if (fn === undefined || fn.type === "ArrowFunctionExpression" || !fn.generator) return false;
  const call = fn.parent;
  if (call?.type !== "CallExpression") return false;
  const path = memberPath(call.callee);
  if (path !== undefined) return path.startsWith("Effect.");
  return callPath(call.callee)?.startsWith("Effect.fn") === true;
};

export const soleExpression = (fn: ESTree.Function): Node | undefined => {
  if (fn.body === null || fn.body === undefined) return undefined;
  if (fn.body.type !== "BlockStatement") return fn.body;
  const [only] = fn.body.body;
  if (fn.body.body.length === 1 && only?.type === "ReturnStatement")
    return only.argument ?? undefined;
  return undefined;
};

export const functionBinding = (
  node: Node
): { readonly name: string; readonly fn: ESTree.Function } | undefined => {
  if (node.type === "FunctionDeclaration" && node.id !== null)
    return { name: node.id.name, fn: node };
  if (
    node.type === "VariableDeclarator" &&
    node.id.type === "Identifier" &&
    (node.init?.type === "ArrowFunctionExpression" || node.init?.type === "FunctionExpression")
  )
    return { name: node.id.name, fn: node.init };
  return undefined;
};

export const topLevelStatements = (program: ESTree.Program) =>
  program.body.map((statement) =>
    (statement.type === "ExportNamedDeclaration" ||
      statement.type === "ExportDefaultDeclaration") &&
    statement.declaration !== null &&
    statement.declaration !== undefined
      ? statement.declaration
      : statement
  );

export const isExported = (node: Node) =>
  node.parent?.type === "ExportNamedDeclaration" ||
  (node.parent?.type === "VariableDeclaration" &&
    node.parent.parent?.type === "ExportNamedDeclaration");

export const typeText = (context: Context, node: Node | null | undefined) =>
  node === null || node === undefined
    ? ""
    : context.sourceCode.getText(node).replace(/\s+/g, " ").trim();

type Messages = Record<string, string>;

export const makeRule = (spec: {
  readonly description: string;
  readonly messages: Messages;
  readonly schema?: ReadonlyArray<Record<string, unknown>>;
  readonly create: (context: Context) => Record<string, (node: never) => void>;
}) =>
  defineRule({
    meta: {
      type: "problem",
      docs: { description: spec.description },
      messages: spec.messages,
      ...(spec.schema === undefined ? {} : { schema: [...spec.schema] }),
    },
    create: spec.create,
  });

export const singleMessage = (
  description: string,
  message: string,
  create: (context: Context) => Record<string, (node: never) => void>
) => makeRule({ description, messages: { violation: message }, create });
