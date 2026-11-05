import { inflateRawSync } from "node:zlib";
import { Effect, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";

const ZipErrorCode = Schema.Literals(["zip.MALFORMED", "zip.INFLATE"]);
type ZipErrorCode = (typeof ZipErrorCode)["Type"];

export class ZipError extends Schema.TaggedError<ZipError, { readonly brand: unique symbol }>()(
  "ZipError",
  {
    code: ZipErrorCode,
    entry: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.String),
  }
) {
  override get message() {
    switch (this.code) {
      case "zip.MALFORMED":
        return "Arquivo ZIP invalido ou corrompido.";
      case "zip.INFLATE":
        return `Falha ao descompactar a entrada do ZIP: ${this.entry}.`;
    }
  }
}

const ZipEntry = Schema.Struct({
  name: Schema.String,
  data: Schema.Uint8Array,
});
export type ZipEntry = (typeof ZipEntry)["Type"];

const RawEntry = Schema.Struct({
  name: Schema.String,
  method: Schema.Finite,
  compressedSize: Schema.Finite,
  localOffset: Schema.Finite,
});
type RawEntry = (typeof RawEntry)["Type"];

const eocdSignature = 0x06054b50;

const findEocd = (view: DataView, size: number) => {
  const minSize = 22;
  const maxBack = Math.min(size, minSize + 0xffff);
  const limit = size - maxBack;
  return pipe(
    Arr.makeBy(size - minSize - limit + 1, (offset) => size - minSize - offset),
    Arr.findFirst((offset) => view.getUint32(offset, true) === eocdSignature),
    Option.getOrElse(() => -1)
  );
};

const walkCentralDirectory = (buf: Uint8Array, view: DataView, eocd: number) => {
  const total = view.getUint16(eocd + 10, true);
  const start = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder("utf-8");
  return pipe(
    Arr.makeBy(total, (index) => index),
    Arr.reduce<
      {
        readonly entries: readonly RawEntry[];
        readonly offset: number;
      },
      number
    >({ entries: [], offset: start }, (acc) => {
      const offset = acc.offset;
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const entry: RawEntry = {
        name: decoder.decode(buf.subarray(offset + 46, offset + 46 + nameLength)),
        method: view.getUint16(offset + 10, true),
        compressedSize: view.getUint32(offset + 20, true),
        localOffset: view.getUint32(offset + 42, true),
      };
      return {
        entries: Arr.append(acc.entries, entry),
        offset: offset + 46 + nameLength + extraLength + commentLength,
      };
    })
  ).entries;
};

const entryData = (buf: Uint8Array, view: DataView, entry: RawEntry) =>
  Effect.try({
    try: () => {
      const nameLength = view.getUint16(entry.localOffset + 26, true);
      const extraLength = view.getUint16(entry.localOffset + 28, true);
      const dataStart = entry.localOffset + 30 + nameLength + extraLength;
      const data = buf.subarray(dataStart, dataStart + entry.compressedSize);
      return entry.method === 0 ? data.slice() : inflateRawSync(data);
    },
    catch: (cause) =>
      ZipError.make({
        code: "zip.INFLATE",
        entry: entry.name,
        cause: String(cause),
      }),
  });

const directoryOf = (bytes: Uint8Array) =>
  Effect.gen(function* () {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = findEocd(view, bytes.byteLength);
    yield* eocd === -1 ? Effect.fail(ZipError.make({ code: "zip.MALFORMED" })) : Effect.void;
    const directory = yield* Effect.try({
      try: () => walkCentralDirectory(bytes, view, eocd),
      catch: (cause) => ZipError.make({ code: "zip.MALFORMED", cause: String(cause) }),
    });
    return { view, directory };
  });

const unzipEntriesImpl = (bytes: Uint8Array, accept: (name: string) => boolean) =>
  forEachZipEntry(bytes, accept, Effect.succeed);

export const forEachZipEntry: {
  <A, E, R>(
    accept: (name: string) => boolean,
    process: (entry: ZipEntry) => Effect.Effect<A, E, R>
  ): (bytes: Uint8Array) => Effect.Effect<readonly A[], ZipError | E, R>;
  <A, E, R>(
    bytes: Uint8Array,
    accept: (name: string) => boolean,
    process: (entry: ZipEntry) => Effect.Effect<A, E, R>
  ): Effect.Effect<readonly A[], ZipError | E, R>;
} = dual(
  3,
  <A, E, R>(
    bytes: Uint8Array,
    accept: (name: string) => boolean,
    process: (entry: ZipEntry) => Effect.Effect<A, E, R>
  ) =>
    Effect.gen(function* () {
      const { view, directory } = yield* directoryOf(bytes);
      return yield* Effect.forEach(
        Arr.filter(directory, (entry) => accept(entry.name)),
        (entry) =>
          entryData(bytes, view, entry).pipe(
            Effect.flatMap((data) => process({ name: entry.name, data }))
          ),
        { concurrency: 1 }
      );
    })
);

export const unzipEntries: {
  (accept: (name: string) => boolean): (bytes: Uint8Array) => ReturnType<typeof unzipEntriesImpl>;
  (bytes: Uint8Array, accept: (name: string) => boolean): ReturnType<typeof unzipEntriesImpl>;
} = dual(2, (bytes: Uint8Array, accept: (name: string) => boolean) =>
  unzipEntriesImpl(bytes, accept)
);
