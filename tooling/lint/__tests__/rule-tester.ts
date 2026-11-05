import { describe, it } from "vitest";
import { RuleTester } from "oxlint/plugins-dev";

import plugin from "../plugin/index.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

type Case =
  | string
  | {
      readonly code: string;
      readonly filename?: string;
      readonly options?: ReadonlyArray<unknown>;
    };
type Invalid = {
  readonly code: string;
  readonly count?: number;
  readonly messageId?: string;
  readonly filename?: string;
  readonly options?: ReadonlyArray<unknown>;
};

export const runRule = (
  name: keyof typeof plugin.rules,
  valid: ReadonlyArray<Case>,
  invalid: ReadonlyArray<Invalid>
) =>
  tester.run(name, plugin.rules[name], {
    valid: [...valid],
    invalid: invalid.map(({ count = 1, messageId = "violation", ...rest }) => ({
      ...rest,
      errors: Array.from({ length: count }, () => ({ messageId })),
    })),
  });
