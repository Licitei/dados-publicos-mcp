import { runRule } from "./rule-tester.ts";

runRule(
  "require-test-assertion",
  [
    "it('a', () => { expect(f()).toBe(1); });",
    "it.effect('a', () => Effect.gen(function* () { const x = yield* f; expect(x).toBe(1); }));",
    "it.effect('a', () => Effect.gen(function* () { assert.strictEqual(yield* f, 1); }));",
    "it.todo('a');",
    "describe('a', () => { it('b', () => { expect(1 + f()).toBe(2); }); });",
  ],
  [
    { code: "it('a', () => { f(); });" },
    { code: "test('a', async () => { await f(); });" },
    { code: "it.effect('a', () => Effect.gen(function* () { yield* f; }));" },
  ]
);

runRule(
  "no-test-in-loop",
  [
    "it.each([1, 2])('a %s', (n) => { expect(n).toBeGreaterThan(0); });",
    "describe('a', () => { it('b', () => { expect(1).toBe(f()); }); });",
    "const rows = xs.map((x) => x + 1);",
  ],
  [
    { code: "for (const x of xs) { it(`a ${x}`, () => { expect(x).toBe(1); }); }" },
    { code: "xs.forEach((x) => { it(`a ${x}`, () => { expect(x).toBe(1); }); });" },
  ]
);

runRule(
  "no-test-timeout-or-skip",
  ["it('a', () => { expect(1).toBe(f()); });", "describe('a', () => {});"],
  [
    { code: "it.skip('a', () => {});" },
    { code: "describe.only('a', () => {});" },
    { code: "it('a', () => {}, 5000);" },
    { code: "it('a', { timeout: 5000 }, () => {});" },
    { code: "it.todo('a');" },
  ]
);

runRule(
  "no-real-time-wait-in-tests",
  [
    "const a = Effect.gen(function* () { yield* TestClock.adjust('1 second'); yield* Effect.sleep('1 second'); });",
    "const b = clock.now();",
  ],
  [
    { code: "await new Promise((r) => setTimeout(r, 10));" },
    { code: "const a = Effect.sleep('1 second');" },
    { code: "await Bun.sleep(10);" },
  ]
);

runRule(
  "no-manual-effect-runtime-in-tests",
  ["it.effect('a', () => Effect.gen(function* () {}));"],
  [
    { code: "await Effect.runPromise(a);" },
    { code: "const r = ManagedRuntime.make(L);" },
    { code: "Effect.runSync(a);" },
  ]
);

runRule(
  "no-module-mocking",
  ["const a = vi.fn();", "vi.spyOn(o, 'm');"],
  [
    { code: "vi.mock('./a');" },
    { code: "vi.doMock('./a');" },
    { code: "vi.stubGlobal('fetch', f);" },
  ]
);

runRule(
  "no-tautological-assertion",
  ["expect(f()).toBe(1);", "expect(x).toEqual(y);", "expect(f()).not.toBe(g());"],
  [
    { code: "expect(true).toBe(true);" },
    { code: "expect(x).toBe(x);" },
    { code: "expect(1).toEqual(1);" },
    { code: "expect(a.b).not.toBe(a.b);" },
  ]
);

runRule(
  "no-process-env-in-alchemy-run",
  ["const a = yield* Config.string('DATA_DIR');"],
  [{ code: "const a = process.env.DATA_DIR;" }]
);

runRule(
  "no-stack-as-void",
  ["export default Alchemy.Stack('A', {}, Effect.gen(function* () { return { a: 1 }; }));"],
  [{ code: "export default Alchemy.Stack('A', {}, body.pipe(Effect.asVoid));" }]
);

runRule(
  "no-yield-resource-constructor",
  [
    "const database = LocalDatabase('local-db', {}); Effect.gen(function* () { const d = yield* database; });",
    "Effect.gen(function* () { const l = yield* Layer.build(x); });",
  ],
  [
    { code: "Effect.gen(function* () { const d = yield* LocalDatabase('local-db', {}); });" },
    { code: "Effect.gen(function* () { const d = yield* Mcp.LocalIndex('idx', {}); });" },
  ]
);
