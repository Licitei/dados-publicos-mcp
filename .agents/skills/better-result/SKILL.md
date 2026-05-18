---
name: better-result
description: Use when implementing, refactoring, reviewing, or testing Result-based domain flows with better-result in Montte, especially domain errors, async integrations, retries, serialization, jobs, workflows, and boundary contracts.
---

# Better Result In Montte

Use this skill when a new or touched flow should model recoverable failures with `better-result`.

Primary docs:

- `https://better-result.dev/llms.txt`
- `https://better-result.dev/core/creating-results`
- `https://better-result.dev/core/transforming-results`
- `https://better-result.dev/core/error-handling`
- `https://better-result.dev/core/pattern-matching`
- `https://better-result.dev/core/generator-composition`
- `https://better-result.dev/advanced/async-operations`
- `https://better-result.dev/advanced/retry-logic`
- `https://better-result.dev/advanced/serialization`
- `https://better-result.dev/advanced/best-practices`

## Hard Rules

- Use `Result<T, E>` for expected domain, integration, job, workflow, validation, permission, conflict, missing-record, provider, and retryable failures.
- Throw only for programmer defects, broken invariants, corrupted state, or framework APIs that require exceptions.
- Do not mix `better-result` and `neverthrow` in the same module. Legacy `neverthrow` modules may stay on it until intentionally migrated.
- Do not use legacy transport error classes or broad catch-all error buckets for new domain errors. Boundary code must keep the typed domain error contract or translate through an explicit adapter owned by that boundary.
- Do not return `Result<..., string>`, `Result<..., Error>`, `Result<..., unknown>`, or `Result<..., any>` from domain code.
- Do not let `unknown` causes or raw provider objects cross the boundary. Convert them immediately into controlled catalog metadata and typed fields.
- User-facing messages are pt-BR.
- No module-wide `errors.ts` just to centralize errors. Colocate the error catalog and `TaggedError` with the owner file/bounded context.

## Create Results

Use the smallest constructor that states the intent:

- `Result.ok(value)` for a successful value.
- `Result.ok()` for `Result<void, E>`.
- `Result.err(error)` for expected failure.
- `Result.try(...)` only around synchronous throwing APIs.
- `Result.tryPromise(...)` around rejecting async APIs, with typed catch handlers.

```ts
import { Result, TaggedError } from "better-result";

export class AgentTitleJobError extends TaggedError("AgentTitleJobError")<{
  error: ReturnType<typeof agentTitleCatalog.INVALID_PAYLOAD>;
  jobId: string;
  threadId: string;
  message: string;
}>() {}

export const parseJobPayload = (
  jobId: string,
  data: unknown,
): Result<AgentTitlePayload, AgentTitleJobError> => {
  const parsed = agentTitlePayloadSchema.safeParse(data);

  if (!parsed.success) {
    return Result.err(
      new AgentTitleJobError({
        error: agentTitleCatalog.INVALID_PAYLOAD({ jobId }),
        jobId,
        threadId: "",
        message: "Payload do job invalido.",
      }),
    );
  }

  return Result.ok(parsed.data);
};
```

For nullable values, convert explicitly:

```ts
export const fromNullable = <T, E>(
  value: T | null | undefined,
  error: E,
): Result<T, E> =>
  value === null || value === undefined ? Result.err(error) : Result.ok(value);
```

## Error Shape

Use one owner-local `TaggedError` class per bounded context. The payload should carry:

- `error: ReturnType<typeof catalog.CODE>` from the colocated evlog catalog;
- typed ids needed to operate the failure (`jobId`, `threadId`, `teamId`, `organizationId`, `providerId`);
- `message` in pt-BR;
- small typed metadata such as `retryable`, `status`, or `provider` when callers need it.

Prefer this:

```ts
export class BillingProviderError extends TaggedError("BillingProviderError")<{
  error: ReturnType<typeof billingProviderCatalog.PROVIDER_REQUEST_FAILED>;
  provider: "hyprpay";
  invoiceId: string;
  retryable: boolean;
  message: string;
}>() {}
```

Avoid one class per catalog code, broad base errors, generic `operation` strings, `cause: unknown`, or raw SDK response payloads.

Use `matchError` for exhaustive handling. Use `matchErrorPartial` only when the fallback is intentional and the fallback type still matters.

## Composition

Choose the primitive by control flow:

- `map()` for pure success transforms that cannot fail.
- `mapError()` to normalize an error at a boundary.
- `andThen()` for a short synchronous Result-returning chain.
- `andThenAsync()` for a short async Result-returning chain.
- `Result.gen()` for multiple intermediate values, conditionals, loops, early returns, or cleanup.
- `Result.match()` when success and failure produce different boundary outputs.
- `Result.partition(results)` when batch work should keep partial successes.

Inside `Result.gen`, use `yield* result` for `Result` and `yield* Result.await(promise)` for `Promise<Result>`.

```ts
const result = await Result.gen(async function* () {
  const payload = yield* parseJobPayload(job.id, job.data);
  const thread = yield* Result.await(loadThread(payload.threadId));
  const title = yield* Result.await(generateTitle(thread));

  return Result.ok({ threadId: thread.id, title });
});
```

Every generator must return `Result.ok(...)` or `Result.err(...)`. Returning a raw value is a defect.

Keep values in the Result context until the boundary. Prefer `Result.gen()` or `andThen()` over manual unwrap/check/re-wrap code.

Use loops in `Result.gen()` only when fail-fast is correct. If one failed item should not stop the batch, collect individual Results and `Result.partition(...)`.

For independent async operations, start them concurrently with `Promise.all`, then compose the returned Results.

## Panics And Unwrap

Do not throw inside `map`, `mapError`, `andThen`, `tap`, `match`, retry predicates, `catch` handlers, or `Result.gen` cleanup. better-result treats these as `Panic`: a user-code defect, not a recoverable `Err`.

Do not catch and convert `Panic` into a domain error. Fix the callback, cleanup, or invalid unwrap.

Use `unwrap()` only after narrowing with `Result.isOk(result)`, `result.isOk()`, or an equivalent test assertion. Use `unwrapOr(fallback)` only when dropping the error is intentional, such as optional display data.

## Side Effects

Use `tap()` and `tapAsync()` only for side effects that must not affect the Result value, such as metrics or structured logs.

Do not hide normal failures inside `tap()`:

- sending email;
- calling a provider;
- queueing a pg-boss job;
- writing storage/cache;
- mutating the database.

Model those as explicit Result-returning steps, or intentionally log and discard their `Err`.

## Async And Retry

Always `await Result.tryPromise(...)`; it returns `Promise<Result<...>>`.

Use the `{ try, catch }` form in production code so errors are typed:

```ts
const result = await Result.tryPromise(
  {
    try: () => provider.createInvoice(input, { signal: AbortSignal.timeout(10_000) }),
    catch: () =>
      new BillingProviderError({
        error: billingProviderCatalog.PROVIDER_REQUEST_FAILED({
          provider: "hyprpay",
        }),
        provider: "hyprpay",
        invoiceId: input.invoiceId,
        retryable: true,
        message: "Falha ao criar cobranca no provedor.",
      }),
  },
  {
    retry: {
      times: 3,
      delayMs: 250,
      backoff: "exponential",
      shouldRetry: (error) => error.retryable,
    },
  },
);
```

Retry rules:

- `times` means retry attempts, not total attempts.
- Use `exponential` for provider/network instability.
- Use `linear` for rate-limit recovery.
- Use `constant` for short cheap transient work, mostly tests/local infra.
- `shouldRetry` must be total and side-effect free.
- Do not retry validation, auth, permission, conflict, or deterministic parsing failures.
- Combine retries with operation-level timeout when the API can hang.

For pg-boss jobs, prefer platform retry controls (`retryLimit`, `retryDelay`, `retryBackoff`, `deadLetter`, `singletonKey`, `sendDebounced`, `sendThrottled`) before adding an inner `Result.tryPromise` retry loop. Add an inner retry only when the smaller operation retry is intentional.

## Serialization

`Result` instances are class instances. They do not survive JSON, queue, cache, RPC, or workflow transport as usable Results.

Use:

- `Result.serialize(result)` before JSON encoding, returning, caching, queueing, or persisting;
- `Result.deserialize<T, E>(payload)` after JSON parsing or receiving external data;
- `SerializedResult<T, E>` as the declared transport shape.

Serialized shape:

```ts
type SerializedResult<T, E> =
  | { status: "ok"; value: T }
  | { status: "error"; error: E };
```

Always handle `ResultDeserializationError` for untrusted, stale, or external payloads. After deserialization from storage/provider/user-controlled input, Zod-validate the inner `value` or `error` if the shape may drift.

For long-lived storage, wrap serialized Results with an explicit schema version.

`TaggedError` serializes through `toJSON()`, but Montte error payloads still must stay controlled: catalog return, typed ids, small metadata, pt-BR message. Do not rely on serialized raw causes.

## Jobs And Workflows

Montte uses both `pg-boss` and DBOS.

Use `pg-boss` for operational jobs:

- title/suggestions;
- lightweight async side effects;
- retryable provider syncs;
- singleton/debounce/throttle behavior;
- DLQ-inspectable background tasks;
- work enqueued from web and consumed only in `apps/worker`.

Use DBOS for durable business workflows:

- billing, ledger, entitlement, invoice closing;
- multi-step state machines;
- deterministic self-rescheduling;
- DBOS transactions/steps;
- workflow replay and observability as part of correctness.

Both need the same Result discipline:

- Zod-parse input before work.
- Empty or missing job ids are errors.
- Return or persist typed `Result` values for expected failures.
- Serialize Results crossing queue/process/storage boundaries.
- Use one owner-local `TaggedError` carrying evlog catalog errors and typed ids.
- pg-boss jobs log with evlog.
- DBOS workflows log with `DBOS.logger`.
- Keep domain/job/workflow errors typed. Boundary translation is a separate adapter decision.

## Boundaries

At oRPC/HTTP/UI boundaries, pick one explicit contract:

- Return the successful value and let typed domain failures be handled by a colocated boundary adapter.
- Return `SerializedResult<T, E>` when expected errors are part of the client contract.

Do not accidentally leak live `Result` instances through JSON. Do not hide typed domain errors behind generic transport errors.

## Testing Checklist

For non-trivial Result flows, cover:

- `Ok` path and transformed output.
- Each important `TaggedError` branch.
- Type guards such as `MyError.is(result.error)`.
- `Result.gen` short-circuit behavior.
- `Result.await` async failure path.
- Retry attempt counts and non-retryable errors.
- Serialization/deserialization round trip for JSON/cache/queue/workflow boundaries.
- Boundary contract: typed adapter output or `SerializedResult`.

Use `Result.isOk(result)` / `Result.isError(result)` before reading `.value` or `.error`.

## Anti-Patterns

- Mixing thrown expected failures with `Result` in one function.
- Returning strings, raw `Error`, `unknown`, or `any` as domain errors.
- Broad catch-all error buckets that erase the real bounded context.
- Adding helper layers, repositories, or barrels just to host Result utilities.
- Nested `match()` for sequential work; use `andThen()` or `Result.gen()`.
- Calling `.unwrap()` because "this should never fail".
- Ignoring Results with `void`.
- Wrapping hot-loop items in Results when one boundary wrapper is enough.
- Serializing a live Result with `JSON.stringify(result)`.

## Migration

Adopt `better-result` incrementally:

1. Start at provider, job, workflow, cache, and boundary edges.
2. Wrap throwing libraries with `Result.try(...)` or `Result.tryPromise(...)`.
3. Define the smallest owner-local tagged error contract.
4. Convert leaf functions before callers.
5. Update job/workflow/API boundaries to serialize, adapt, or log typed errors intentionally.
