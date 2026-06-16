#!/usr/bin/env bun

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const argvRoots = process.argv.slice(2);
const requestedRoots = argvRoots.length > 0 ? argvRoots : ["src"];

const roots = requestedRoots.filter((path) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
});

const skippedSegments = new Set([
  "dist",
  "node_modules",
  "outputs",
  "docs",
  "__tests__",
  "test",
]);
const skippedSuffixes = [".tsbuildinfo", "README.md"];
const checkedExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);

const strictPrefixes = ["src/kernel/", "src/sources/"];

const effectVocabulary =
  "Idioms: Effect.fail, Effect.tryPromise({ try, catch }), Effect.acquireRelease, Effect.mapError, Effect.catchTag, Match.value/tag/when/orElse, Schema.TaggedErrorClass, Schema.Literals, Context.Service/Reference, Layer.effect, Effect.Success<typeof make>.";

const helperName = /^(to|from|map|wrap|is)[A-Za-z0-9_]*Error$/;
const failureName = /(Failure|Fault)$/;
const errorClassName = /(Error|Fault|Failure)$/;
const compoundAssign = new Set([
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.AmpersandEqualsToken,
  ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

const widenedError = new Set(["Error", "unknown", "any"]);

const bannedServiceApi = new Set([
  "Context.Tag",
  "Context.GenericTag",
  "Effect.Tag",
  "Effect.Service",
]);

const text = (node: ts.Node, source: ts.SourceFile) =>
  node.getText(source).replace(/\s+/g, " ").trim();

const fileHasLayerExport = (source: ts.SourceFile): boolean =>
  source.statements.some(
    (statement) =>
      ts.isVariableStatement(statement) &&
      statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
      ) === true &&
      statement.declarationList.declarations.some(
        (declaration) =>
          !!declaration.initializer &&
          text(declaration.initializer, source).startsWith("Layer.")
      )
  );

const bodyHasNewError = (node: ts.Node): boolean => {
  let found = false;
  const visit = (child: ts.Node) => {
    if (found) return;
    if (
      ts.isNewExpression(child) &&
      ts.isIdentifier(child.expression) &&
      errorClassName.test(child.expression.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
};

const containsSwitch = (node: ts.Node): boolean => {
  let found = false;
  const visit = (child: ts.Node) => {
    if (found) return;
    if (ts.isSwitchStatement(child)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
};

const taggedErrorFields = (
  node: ts.ClassDeclaration
): ts.ObjectLiteralExpression | undefined => {
  const heritage = node.heritageClauses?.find(
    (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword
  );
  const base = heritage?.types[0]?.expression;
  if (!base || !ts.isCallExpression(base)) return undefined;
  if (!text(base.expression, node.getSourceFile()).startsWith("Schema.TaggedErrorClass"))
    return undefined;
  const last = base.arguments[base.arguments.length - 1];
  return last && ts.isObjectLiteralExpression(last) ? last : undefined;
};

const helperFunction = (
  name: string | undefined,
  returnType: ts.TypeNode | undefined,
  body: ts.Node | undefined,
  source: ts.SourceFile
): boolean => {
  if (!name) return false;
  if (helperName.test(name) || failureName.test(name)) return true;
  return (
    !!returnType &&
    errorClassName.test(text(returnType, source)) &&
    !!body &&
    bodyHasNewError(body)
  );
};

type Violation = { line: number; column: number; rule: string; message: string };

const collect = (file: string, source: ts.SourceFile, strict: boolean): Violation[] => {
  const violations: Violation[] = [];
  const at = (node: ts.Node, rule: string, message: string) => {
    const { line, character } = source.getLineAndCharacterOfPosition(
      node.getStart(source)
    );
    violations.push({ line: line + 1, column: character + 1, rule, message });
  };

  const importedNames = new Set<string>();
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const element of statement.importClause.namedBindings.elements)
        importedNames.add(element.name.text);
    }
  }

  const visit = (node: ts.Node, inGetMessage: boolean) => {
    if (ts.isThrowStatement(node))
      at(node, "no-throw", `${effectVocabulary} Errors flow through Effect.fail, never throw.`);

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword
    )
      at(
        node,
        "no-instanceof",
        "Branch on this.code via switch in get message() or Match.tag, never instanceof."
      );

    if (ts.isTryStatement(node))
      at(
        node,
        "no-statement-try-catch-finally",
        "Capture faults with Effect.tryPromise({ try, catch }); acquire resources with Effect.acquireRelease, never statement try/catch/finally."
      );

    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
      if (helperFunction(node.name?.text, node.type, node.body, source))
        at(
          node,
          "no-error-helper-functions",
          "No error wrapper/helper functions (toXError, mapXError, wrapError). Build the error inline as new XError({ code, ... }) at the failure site."
        );
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      if (
        helperFunction(node.name.text, node.initializer.type, node.initializer.body, source)
      )
        at(
          node,
          "no-error-helper-functions",
          "No error wrapper/helper functions (toXError, mapXError, wrapError). Build the error inline as new XError({ code, ... }) at the failure site."
        );
    }

    if (strict) {
      if (
        (ts.isAsExpression(node) && text(node.type, source) !== "const") ||
        ts.isTypeAssertionExpression(node) ||
        ts.isNonNullExpression(node)
      )
        at(
          node,
          "no-as-cast",
          "Zero-cast slice: model data via Schema and let inference carry types (as const / satisfies are allowed)."
        );

      if (
        ts.isVariableDeclarationList(node) &&
        (node.flags & ts.NodeFlags.Const) === 0
      )
        at(node, "no-let-var", "Use const + fold (reduce) or Effect/Match combinators, never let/var.");

      if (ts.isEnumDeclaration(node))
        at(
          node,
          "no-enum",
          'Use Schema.Literals([...]) + type X = (typeof X)["Type"] for closed sets, never enum.'
        );

      if (ts.isWhileStatement(node) || ts.isDoStatement(node))
        at(
          node,
          "no-imperative-while-loop",
          "Express iteration as filter/reduce/Effect.forEach, never while/do."
        );

      if (
        ts.isBinaryExpression(node) &&
        compoundAssign.has(node.operatorToken.kind)
      )
        at(
          node,
          "no-mutation-accumulator",
          "No compound-assignment mutation; carry state through reduce over an immutable accumulator."
        );
      if (
        (ts.isPostfixUnaryExpression(node) || ts.isPrefixUnaryExpression(node)) &&
        (node.operator === ts.SyntaxKind.PlusPlusToken ||
          node.operator === ts.SyntaxKind.MinusMinusToken)
      )
        at(
          node,
          "no-mutation-accumulator",
          "No ++/-- mutation; carry state through reduce over an immutable accumulator."
        );

      if (
        ts.isMappedTypeNode(node) &&
        node.readonlyToken?.kind === ts.SyntaxKind.MinusToken
      )
        at(
          node,
          "no-mutable-mapped-type",
          "No -readonly escape hatch off a Schema-derived type; build immutably via reduce."
        );

      if (ts.isSwitchStatement(node) && !inGetMessage)
        at(
          node,
          "switch-only-in-get-message",
          "Branch via Match.value(...).pipe(Match.when/tag/orElse); switch is only allowed inside get message()."
        );

      if (ts.isClassDeclaration(node) && node.name && errorClassName.test(node.name.text)) {
        const heritage = node.heritageClauses?.find(
          (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword
        );
        const base = heritage?.types[0]?.expression;
        if (!base || !text(base, source).startsWith("Schema.TaggedErrorClass"))
          at(
            node,
            "error-class-must-use-TaggedErrorClass",
            "Error classes must extend Schema.TaggedErrorClass<Self>()('Name', {...}); no class extends Error / Data.TaggedError."
          );
        else {
          const fields = taggedErrorFields(node);
          const hasCode = !!fields?.properties.some(
            (property) =>
              ts.isPropertyAssignment(property) &&
              property.name.getText(source) === "code"
          );
          const message = node.members.find(
            (member): member is ts.GetAccessorDeclaration =>
              ts.isGetAccessorDeclaration(member) &&
              member.name.getText(source) === "message"
          );
          const hasSwitch = !!message?.body && containsSwitch(message.body);
          if (!hasCode && !hasSwitch)
            at(
              node,
              "error-code-discrimination",
              "Discriminate failures: add a Schema.Literals code field and switch(this.code) in get message(), per the gold standard."
            );
        }
      }

      if (
        ts.isCallExpression(node) &&
        text(node.expression, source).endsWith("Effect.retry")
      ) {
        const arg = node.arguments[0];
        const classified =
          (!!arg &&
            ts.isObjectLiteralExpression(arg) &&
            arg.properties.some(
              (property) => property.name?.getText(source) === "while"
            )) ||
          (!!arg && ts.isIdentifier(arg));
        if (!classified)
          at(
            node,
            "retry-must-classify-errors",
            "Classify Effect.retry: pass an options object with a while: predicate branching on this.code, or a single named Schedule policy identifier — never a blind schedule."
          );
      }

      if (
        ts.isPropertyAssignment(node) &&
        node.name.getText(source) === "concurrency" &&
        ts.isStringLiteral(node.initializer) &&
        node.initializer.text === "unbounded"
      )
        at(
          node,
          "no-unbounded-concurrency",
          'Bound public-API fan-out: use a small integer concurrency (e.g. concurrency: 2) in Effect.forEach/Effect.all, never concurrency: "unbounded" against rate-budgetless gov.br hosts.'
        );

      if (
        ts.isTypeReferenceNode(node) &&
        ts.isQualifiedName(node.typeName) &&
        ts.isIdentifier(node.typeName.left) &&
        node.typeName.left.text === "Effect" &&
        node.typeName.right.text === "Effect"
      ) {
        const errorArg = node.typeArguments?.[1];
        if (errorArg && widenedError.has(text(errorArg, source)))
          at(
            node,
            "no-widened-effect-error-channel",
            "Tagged-only error channel: never annotate Effect.Effect with Error/unknown/any in the E slot; let inference carry the Schema.TaggedErrorClass union so failures stay discriminated."
          );
      }

      if (
        ts.isPropertyAccessExpression(node) &&
        bannedServiceApi.has(text(node, source))
      )
        at(
          node,
          "no-v3-service-api",
          "Define services with Context.Service<Self, Effect.Success<typeof make>>() + Layer.effect; the v3 Context.Tag/GenericTag/Effect.Tag/Effect.Service APIs are banned in the v4 slice."
        );

      if (ts.isClassDeclaration(node)) {
        const serviceBase = node.heritageClauses
          ?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
          ?.types[0]?.expression;
        if (
          serviceBase &&
          ts.isCallExpression(serviceBase) &&
          text(serviceBase.expression, source).startsWith("Context.Service") &&
          !fileHasLayerExport(source)
        )
          at(
            node,
            "service-needs-layer",
            "A Context.Service must export its Layer (export const XLayer = Layer.effect(X)(make)) in the same module."
          );
      }

      if (
        ts.isExportDeclaration(node) &&
        !node.moduleSpecifier &&
        node.exportClause &&
        ts.isNamedExports(node.exportClause)
      ) {
        for (const element of node.exportClause.elements) {
          const local = element.propertyName?.text ?? element.name.text;
          if (importedNames.has(local))
            at(
              node,
              "no-barrel-passthrough-reexport",
              `No barrel: drop 'export { ${local} }'; consumers import ${local} from its source module directly.`
            );
        }
      }
    }

    const nextInGetMessage =
      inGetMessage ||
      (ts.isGetAccessorDeclaration(node) && node.name.getText(source) === "message");
    ts.forEachChild(node, (child) => visit(child, nextInGetMessage));
  };

  visit(source, false);
  return violations;
};

const hasCheckedExtension = (path: string): boolean => {
  const dot = path.lastIndexOf(".");
  return dot >= 0 && checkedExtensions.has(path.slice(dot));
};

const shouldSkip = (path: string): boolean => {
  const parts = path.split("/");
  return (
    parts.some((part) => skippedSegments.has(part)) ||
    skippedSuffixes.some((suffix) => path.endsWith(suffix))
  );
};

function* walk(root: string): Generator<string> {
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const normalized = path.replaceAll("\\", "/");
    if (shouldSkip(normalized)) continue;

    const stats = statSync(path);
    if (stats.isDirectory()) yield* walk(path);
    else if (stats.isFile() && hasCheckedExtension(normalized)) yield normalized;
  }
}

let failed = false;
for (const file of roots.flatMap((root) => [...walk(root)])) {
  const rel = relative(process.cwd(), file).replaceAll("\\", "/");
  const strict = strictPrefixes.some((prefix) => rel.startsWith(prefix));
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true
  );

  for (const violation of collect(file, source, strict)) {
    console.error(
      `${rel}:${violation.line}:${violation.column}: [${violation.rule}] ${violation.message}`
    );
    failed = true;
  }
}

if (failed) process.exit(1);
