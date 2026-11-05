import { Schema } from "effect";

export const NonEmptyString = Schema.String.pipe(Schema.check(Schema.isMinLength(1)));

export const Uf = Schema.String.pipe(Schema.check(Schema.isBetweenLength(2, 2)));

export const positiveIntMax = (max: number) =>
  Schema.Finite.pipe(
    Schema.check(Schema.isInt(), Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(max))
  );

export const intYear = Schema.Finite.pipe(Schema.check(Schema.isInt()));

export const ceapYear = Schema.Finite.pipe(
  Schema.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(2008),
    Schema.isLessThanOrEqualTo(2026)
  )
);

const MinTwoString = Schema.String.pipe(Schema.check(Schema.isMinLength(2)));

export const VerificarDocumentoInput = Schema.Struct({ documento: NonEmptyString });

export const buscarNomeInput = (max: number) =>
  Schema.Struct({
    nome: MinTwoString,
    limite: Schema.optionalKey(positiveIntMax(max)),
  });

export const BuscarTermoUfInput = Schema.Struct({
  termo: MinTwoString,
  uf: Schema.optionalKey(Uf),
  limite: Schema.optionalKey(positiveIntMax(200)),
});
