import { pipe } from "effect/Function";
import * as Str from "effect/String";
import { onlyDigits } from "./normalize";

export const publicDocument = (document: string) => {
  const digits = onlyDigits(document);
  return digits.length === 11
    ? `***.${Str.slice(3, 6)(digits)}.${Str.slice(6, 9)(digits)}-**`
    : digits.length === 14
      ? digits
      : Str.trim(document);
};

export const publicText = (text: string) =>
  pipe(
    text,
    Str.replace(/(?<!\d)\d{3}\.(\d{3})\.(\d{3})-\d{2}(?!\d)/g, "***.$1.$2-**"),
    Str.replace(
      /(\bCPF(?:\/CNPJ)?[\s:=-]*)\d{3}\.?(\d{3})\.?(\d{3})-?\d{2}(?!\d)/gi,
      "$1***.$2.$3-**"
    )
  );
