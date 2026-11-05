import { runRule } from "./rule-tester.ts";

runRule(
  "no-source-comments",
  [
    "const a = 1;",
    "// oxlint-disable-next-line no-console\nconsole.log(1);",
    "const b = '// not a comment';",
  ],
  [
    { code: "// why\nconst a = 1;" },
    { code: "/** doc */\nconst a = 1;" },
    { code: "const a = 1; /* x */" },
  ]
);

runRule(
  "filename-case",
  [
    { code: "const a = 1;", filename: "src/kernel/http/client.ts" },
    { code: "const a = 1;", filename: "src/sources/capag/catalog.unit.test.ts" },
    { code: "const a = 1;", filename: "infra/local-index.run.ts" },
  ],
  [
    { code: "const a = 1;", filename: "src/kernel/duck/duckTable.ts" },
    { code: "const a = 1;", filename: "src/kernel/duck/Duck_Table.ts" },
  ]
);

runRule(
  "no-in-operator",
  ["const a = Object.hasOwn(o, 'k');", "for (const k of ks) {}"],
  [{ code: "const a = 'k' in o;" }]
);

runRule(
  "no-reflect-get",
  ["const a = o.k;", "const b = Reflect.has(o, 'k');"],
  [{ code: "const a = Reflect.get(o, 'k');" }]
);

runRule(
  "no-reflect-apply",
  ["const a = f(1);", "const b = Reflect.has(o, 'k');"],
  [{ code: "const a = Reflect.apply(f, undefined, []);" }]
);

runRule(
  "no-handwritten-type-predicates",
  ["const f = (x: unknown): boolean => typeof x === 'string';", "const g = Schema.is(Body);"],
  [
    { code: "const f = (x: unknown): x is string => typeof x === 'string';" },
    { code: "function g(x: unknown): x is Body { return true; }" },
  ]
);

runRule(
  "no-json-string-comparison",
  ["const a = Equal.equals(x, y);", "const b = JSON.stringify(x) === 'a';"],
  [{ code: "const a = JSON.stringify(x) === JSON.stringify(y);" }]
);

runRule(
  "no-generic-json-codec-wrappers",
  [
    "const decodeBody = (text: string) => Schema.decodeUnknownEffect(Schema.fromJsonString(Body))(text);",
  ],
  [
    {
      code: "const decodeWith = (schema: S, text: string) => Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(text);",
    },
    { code: "const parseJson = (text: string) => text;" },
  ]
);

runRule(
  "prefer-effect-foreach",
  ["Effect.forEach(xs, f, { concurrency: 2 });", "Effect.all([a, b]);"],
  [{ code: "Effect.all(xs.map((x) => f(x)));" }]
);

runRule(
  "no-service-option",
  ["const a = yield* Db;"],
  [{ code: "const a = yield* Effect.serviceOption(Db);" }]
);

runRule(
  "no-then-in-effect-gen",
  [
    "const a = p.then((x) => x);",
    "Effect.gen(function* () { const x = yield* Effect.tryPromise(() => p); });",
  ],
  [
    { code: "Effect.gen(function* () { const x = yield* p.then((v) => v); });" },
    { code: "const run = Effect.fn('run')(function* () { p.then(f); });" },
  ]
);

runRule(
  "no-unowned-effect-run",
  ["const a = Effect.gen(function* () {});", "const b = runtime.runPromise(a);"],
  [
    { code: "Effect.runPromise(a);" },
    { code: "Effect.runSync(a);" },
    { code: "Effect.runFork(a);" },
  ]
);

runRule(
  "no-extra-managed-runtime",
  [
    "const a = Layer.empty;",
    { code: "const a = ManagedRuntime.make(AppLayer);", options: [{ max: 1 }] },
  ],
  [
    { code: "const a = ManagedRuntime.make(AppLayer);" },
    {
      code: "const a = ManagedRuntime.make(L); const b = ManagedRuntime.make(L);",
      options: [{ max: 1 }],
    },
  ]
);

runRule(
  "no-direct-fetch",
  ["const a = http.text(url);", "const b = this.fetch(url);"],
  [{ code: "const a = fetch(url);" }, { code: "const a = globalThis.fetch(url);" }]
);

runRule(
  "no-generic-helper-names",
  ["const decodeBody = (x: string) => x.trim();", "function parseRow(x: string) { return x; }"],
  [
    { code: "const stringHelper = (x: string) => x.trim();" },
    { code: "function utils(x: string) { return x; }" },
    { code: "const dataManager = () => 1;" },
  ]
);

runRule(
  "no-thin-forwarding-wrappers",
  [
    "const decodeBody = (text: string) => decode(text, 1);",
    "const f = (a: string, b: string) => g(b, a);",
    "const h = (x: string) => Schema.decodeUnknownSync(Body)(x);",
  ],
  [
    { code: "const f = (a: string, b: string) => g(a, b);" },
    { code: "function f(a: string) { return http.text(a); }" },
  ]
);

runRule(
  "no-unknown-type-aliases",
  ["type A = string;", "type B = (typeof B)['Type'];"],
  [{ code: "type A = unknown;" }]
);

runRule(
  "no-unsafe-dictionary-type",
  ["type A = Record<'a' | 'b', string>;", "const a = Schema.Record(Schema.String, Schema.String);"],
  [
    { code: "type A = Record<string, string>;" },
    { code: "type A = { [key: string]: number };" },
    { code: "type A = Readonly<Record<string, unknown>>;" },
  ]
);
