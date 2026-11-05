import { runRule } from "./rule-tester.ts";

runRule(
  "no-as-cast",
  [
    "const a = [1, 2] as const;",
    "const b = { a: 1 } satisfies { a: number };",
    "import * as Effect from 'effect/Effect';",
  ],
  [
    { code: "const a = value as string;" },
    { code: "const a = <string>value;" },
    { code: "const a = value!;" },
  ]
);

runRule(
  "no-let-var",
  ["const a = 1;", "for (const x of xs) { f(x); }"],
  [{ code: "let a = 1;" }, { code: "var b = 2;" }, { code: "for (let i = 0; i < 1; i = i + 1) {}" }]
);

runRule("no-enum", ["const A = Schema.Literals(['a']);"], [{ code: "enum A { X }" }]);

runRule(
  "no-imperative-while-loop",
  ["const a = xs.filter(Boolean);"],
  [{ code: "while (ok) {}" }, { code: "do {} while (ok);" }]
);

runRule(
  "no-mutation-accumulator",
  ["const a = xs.reduce((sum, x) => sum + x, 0);", "a.b = 1;"],
  [{ code: "total += 1;" }, { code: "count++;" }, { code: "--count;" }]
);

runRule(
  "no-mutable-mapped-type",
  ["type A = { readonly [K in 'a']: string };", "type B = { +readonly [K in 'a']: string };"],
  [{ code: "type A = { -readonly [K in keyof T]: T[K] };" }]
);

runRule(
  "switch-only-in-get-message",
  ["class XError { override get message() { switch (this.code) { case 'a': return 'a'; } } }"],
  [
    { code: "const f = (a: string) => { switch (a) { case 'a': return 1; } };" },
    { code: "class X { get other() { switch (this.code) { case 'a': return 1; } } }" },
  ]
);

runRule(
  "no-barrel-passthrough-reexport",
  ["import { a } from './a'; export const b = a;", "export const c = 1;"],
  [
    { code: "import { a } from './a'; export { a };" },
    { code: "export * from './a';" },
    { code: "export { a } from './a';" },
  ]
);

runRule(
  "retry-must-classify-errors",
  [
    "const a = Effect.retry({ while: (e) => e.code === 'x.NET', schedule });",
    "const a = Effect.retry(policy);",
    "const a = other.retry(schedule);",
  ],
  [
    { code: "const a = Effect.retry({ times: 3 });" },
    { code: "const a = effect.pipe(Effect.retry(Schedule.fixed(1)));" },
  ]
);

runRule(
  "no-unbounded-concurrency",
  [
    "Effect.forEach(xs, f, { concurrency: 2 });",
    "Effect.forEach(xs, f, { concurrency: 4 });",
    "Effect.forEach(xs, f);",
  ],
  [
    { code: "Effect.forEach(xs, f, { concurrency: 'unbounded' });" },
    { code: "Effect.all(xs, { concurrency: 16 });" },
    { code: "Effect.all(xs, { concurrency: 'inherit' });" },
  ]
);

runRule(
  "no-v3-service-api",
  ["class X extends Context.Service<X, Shape>()('X') {}"],
  [
    { code: "const T = Context.GenericTag<X>('X');" },
    { code: "class X extends Effect.Tag('X')<X, Shape>() {}" },
  ]
);

runRule(
  "no-context-tag",
  ["class X extends Context.Service<X, Shape>()('X') {}"],
  [{ code: "class X extends Context.Tag('X')<X, Shape>() {}" }]
);

runRule(
  "no-effect-service",
  ["class X extends Context.Service<X, Shape>()('X') {}"],
  [{ code: "class X extends Effect.Service<X>()('X', { effect: make }) {}" }]
);

runRule(
  "service-needs-layer",
  [
    "class X extends Context.Service<X, Shape>()('X') {} export const XLayer = Layer.effect(X)(make);",
    "class Plain {}",
  ],
  [
    { code: "class X extends Context.Service<X, Shape>()('X') {}" },
    {
      code: "class X extends Context.Service<X, Shape>()('X') {} export const XLayer = Layer.succeed(X)(value);",
    },
  ]
);

runRule(
  "config-via-context-reference",
  [
    "export const HttpConfig = Context.Reference<Shape>('HttpConfig', { defaultValue: () => shape });",
  ],
  [{ code: "class HttpConfig extends Context.Service<HttpConfig, Shape>()('HttpConfig') {}" }]
);

runRule(
  "no-raw-json",
  ["const a = Schema.decodeUnknownSync(Schema.fromJsonString(Body))(text);"],
  [{ code: "const a = JSON.parse(text);" }, { code: "const a = JSON.stringify(value);" }]
);
