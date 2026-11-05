import { runRule } from "./rule-tester.ts";

runRule(
  "no-throw",
  ["const f = () => Effect.fail(new XError({ code: 'x.A' }));"],
  [{ code: "const f = () => { throw new Error('x'); };" }]
);

runRule(
  "no-instanceof",
  ["const f = (e) => e._tag === 'XError';"],
  [{ code: "const f = (e) => e instanceof XError;" }]
);

runRule(
  "no-statement-try-catch-finally",
  [
    "const f = Effect.tryPromise({ try: () => g(), catch: (cause) => new XError({ code: 'x.A', cause: String(cause) }) });",
  ],
  [{ code: "const f = () => { try { g(); } catch (e) { h(); } };" }]
);

runRule(
  "no-error-helper-functions",
  [
    "const decode = (input: string) => input.trim();",
    "const f = () => Effect.fail(new XError({ code: 'x.A' }));",
  ],
  [
    {
      code: "const toXError = (cause: unknown) => new XError({ code: 'x.A', cause: String(cause) });",
    },
    { code: "function wrapError(cause: unknown) { return new XError({ code: 'x.A' }); }" },
    { code: "const build = (cause: unknown): XError => new XError({ code: 'x.A' });" },
    { code: "const upstreamFailure = () => 1;" },
  ]
);

runRule(
  "no-thin-error-factories",
  [
    "const f = (id: string) => Effect.gen(function* () { yield* Effect.log(id); return yield* Effect.fail(new XError({ code: 'x.A', id })); });",
  ],
  [
    { code: "const notFound = (id: string) => new XError({ code: 'x.A', id });" },
    { code: "const notFound = (id: string) => Effect.fail(new XError({ code: 'x.A', id }));" },
  ]
);

runRule(
  "no-wrap-only-errors",
  [
    "const a = Effect.mapError(effect, (cause) => new XError({ code: 'x.A', cause: String(cause) }));",
    "class XError extends Schema.TaggedError<XError>()('XError', { code: XErrorCode, cause: Schema.optional(Schema.String) }) {}",
  ],
  [
    {
      code: "class XError extends Schema.TaggedError<XError>()('XError', { operation: Schema.String, cause: Schema.String }) {}",
      messageId: "wrapper",
    },
    {
      code: "const a = Effect.mapError(effect, (cause) => new XError({ cause }));",
      messageId: "callback",
    },
  ]
);

runRule(
  "no-swallowed-try-promise",
  [
    "const a = Effect.tryPromise({ try: () => g(), catch: (cause) => new XError({ code: 'x.A' }) });",
    "const a = Effect.ignore(Effect.succeed(1));",
  ],
  [
    {
      code: "const a = Effect.ignore(Effect.tryPromise({ try: () => g(), catch: () => new XError({ code: 'x.A' }) }));",
    },
    {
      code: "const a = Effect.tryPromise({ try: () => g(), catch: () => new XError({ code: 'x.A' }) }).pipe(Effect.orElseSucceed(() => 1));",
    },
    {
      code: "const a = Effect.tryPromise({ try: () => g(), catch: () => new XError({ code: 'x.A' }) }).pipe(Effect.ignore);",
    },
  ]
);

runRule(
  "no-swallowed-promise-catch",
  ["const a = p.catch((error) => Effect.fail(error));", "const a = p.then((x) => x);"],
  [
    { code: "const a = p.catch(() => undefined);" },
    { code: "const a = p.catch(() => {});" },
    { code: "const a = p.catch(() => null);" },
  ]
);

runRule(
  "no-data-tagged-error",
  ["class XError extends Schema.TaggedError<XError>()('XError', {}) {}"],
  [{ code: "class XError extends Data.TaggedError('XError')<{}> {}" }]
);

runRule(
  "error-class-must-use-tagged-error",
  [
    "class XError extends Schema.TaggedError<XError>()('XError', { code: XErrorCode }) {}",
    "class Store {}",
  ],
  [{ code: "class XError extends Error {}" }, { code: "class XFailure {}" }]
);

runRule(
  "error-code-discrimination",
  [
    "class XError extends Schema.TaggedError<XError>()('XError', { code: XErrorCode }) {}",
    "class XError extends Schema.TaggedError<XError>()('XError', {}) { override get message() { switch (this.kind) { case 'a': return 'a'; } } }",
  ],
  [
    {
      code: "class XError extends Schema.TaggedError<XError>()('XError', { url: Schema.String }) {}",
    },
  ]
);

runRule(
  "tagged-error-needs-message-getter",
  [
    "class XError extends Schema.TaggedError<XError>()('XError', {}) { override get message() { return 'x'; } }",
  ],
  [{ code: "class XError extends Schema.TaggedError<XError>()('XError', { code: XErrorCode }) {}" }]
);

runRule(
  "error-code-must-be-literals",
  [
    "const XErrorCode = Schema.Literals(['x.A']); class XError extends Schema.TaggedError<XError>()('XError', { code: XErrorCode }) {}",
    "class XError extends Schema.TaggedError<XError>()('XError', { code: Schema.Literals(['x.A']) }) {}",
    "import { YErrorCode } from './y'; class XError extends Schema.TaggedError<XError>()('XError', { code: YErrorCode }) {}",
  ],
  [
    {
      code: "class XError extends Schema.TaggedError<XError>()('XError', { code: Schema.String }) {}",
    },
    {
      code: "const XErrorCode = Schema.String; class XError extends Schema.TaggedError<XError>()('XError', { code: XErrorCode }) {}",
    },
  ]
);

runRule(
  "no-widened-effect-error-channel",
  ["type A = Effect.Effect<string, XError>;", "type B = Effect.Effect<string>;"],
  [
    { code: "type A = Effect.Effect<string, Error>;" },
    { code: "type A = Effect.Effect<string, unknown, Db>;" },
    { code: "type A = Effect.Effect<string, any>;" },
  ]
);
