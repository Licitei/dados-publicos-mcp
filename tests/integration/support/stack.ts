import type { ScratchStack } from "@alchemy.run/test/Vitest";
import type { Input } from "alchemy/Input";
import { Cause, Effect, Schema } from "effect";
import { dual } from "effect/Function";

export const StackOperation = Schema.Literals(["deploy", "plan", "destroy"]);
export type StackOperation = (typeof StackOperation)["Type"];

class StackOperationError extends Schema.TaggedError<
  StackOperationError,
  { readonly brand: unique symbol }
>()("StackOperationError", {
  op: StackOperation,
  cause: Schema.String,
}) {
  override get message() {
    switch (this.op) {
      case "deploy":
        return `Falha ao aplicar a stack: ${this.cause}`;
      case "plan":
        return `Falha ao planejar a stack: ${this.cause}`;
      case "destroy":
        return `Falha ao destruir a stack: ${this.cause}`;
    }
  }
}

type RawDeploy = <A, E, R>(
  effect: Effect.Effect<A, E, R>
) => Effect.Effect<Input.Resolve<A>, Error>;

type RawDestroy = () => Effect.Effect<void, Error>;

const rawDeploy = (stack: ScratchStack): RawDeploy => stack.deploy.bind(stack);
const rawDestroy = (stack: ScratchStack): RawDestroy => stack.destroy.bind(stack);

const toStackError = (op: StackOperation) => (error: Error) =>
  StackOperationError.make({ op, cause: Cause.pretty(Cause.fail(error)) });

export const deploy: {
  <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ): (stack: ScratchStack) => ReturnType<typeof deployWith<A, E, R>>;
  <A, E, R>(
    stack: ScratchStack,
    effect: Effect.Effect<A, E, R>
  ): ReturnType<typeof deployWith<A, E, R>>;
} = dual(2, deployWith);

function deployWith<A, E, R>(stack: ScratchStack, effect: Effect.Effect<A, E, R>) {
  return rawDeploy(stack)(effect).pipe(Effect.mapError(toStackError("deploy")));
}

export const destroy = (stack: ScratchStack) =>
  rawDestroy(stack)().pipe(Effect.mapError(toStackError("destroy")));

export const destroyIgnored = (stack: ScratchStack) => Effect.ignore(destroy(stack));
