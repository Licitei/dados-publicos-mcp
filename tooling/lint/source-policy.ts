import { readFileSync } from "node:fs";
import * as ts from "tsrs/ast";
import { API } from "tsrs/async";

export type ShapeViolation = {
  readonly line: number;
  readonly column: number;
  readonly message: string;
};

const strictRoots = ["src/kernel", "src/sources"];
const wrapperTypes = new Set([
  "Readonly",
  "ReadonlyArray",
  "Array",
  "Partial",
  "Required",
  "Omit",
  "Pick",
]);

const containsTypeLiteral = (node: ts.TypeNode): boolean => {
  if (ts.isTypeLiteralNode(node)) return true;
  if (ts.isParenthesizedTypeNode(node)) return containsTypeLiteral(node.type);
  if (ts.isArrayTypeNode(node)) return containsTypeLiteral(node.elementType);
  if (ts.isIntersectionTypeNode(node) || ts.isUnionTypeNode(node))
    return node.types.some(containsTypeLiteral);
  if (
    ts.isTypeReferenceNode(node) &&
    ts.isIdentifier(node.typeName) &&
    wrapperTypes.has(node.typeName.text)
  )
    return (node.typeArguments ?? []).some(containsTypeLiteral);
  return false;
};

export const shapeViolations = (source: ts.SourceFile): ReadonlyArray<ShapeViolation> => {
  const found: Array<ShapeViolation> = [];
  const report = (node: ts.Node, message: string) => {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    found.push({ line: line + 1, column: character + 1, message });
  };
  const visit = (node: ts.Node) => {
    if (ts.isInterfaceDeclaration(node))
      report(
        node,
        `interface ${node.name.text}: derive the shape from a Schema or inference instead of a handwritten interface.`
      );
    if (ts.isTypeAliasDeclaration(node) && containsTypeLiteral(node.type))
      report(
        node,
        `type ${node.name.text}: derive the shape from a Schema ((typeof X)["Type"]) or inference instead of a handwritten object type.`
      );
    node.forEachChild(visit);
  };
  visit(source);
  return found;
};

const listSources = (root: string) =>
  strictRoots
    .flatMap((directory) =>
      Array.from(new Bun.Glob(`${directory}/**/*.ts`).scanSync({ cwd: root }))
    )
    .filter((path) => !path.endsWith(".d.ts"))
    .toSorted((left, right) => left.localeCompare(right));

if (import.meta.main) {
  const root = process.argv[2] ?? ".";
  await using api = new API();
  const reports = await Promise.all(
    listSources(root).map(async (path) => {
      await using retained = await api.createSourceFile(
        `${root}/${path}`,
        readFileSync(`${root}/${path}`, "utf8")
      );
      return shapeViolations(retained.sourceFile).map(
        (violation) =>
          `${path}:${violation.line}:${violation.column}: [source-policy] ${violation.message}`
      );
    })
  );
  const lines = reports.flat();
  if (lines.length > 0) console.error(lines.join("\n"));
  if (lines.length > 0) process.exitCode = 1;
}
