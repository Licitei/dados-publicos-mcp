import { inflateRawSync } from "node:zlib";
import { Effect, Match, Schema } from "effect";

const ZipErrorCode = Schema.Literals(["zip.MALFORMED", "zip.INFLATE"]);
export type ZipErrorCode = (typeof ZipErrorCode)["Type"];

export class ZipError extends Schema.TaggedErrorClass<ZipError>()("ZipError", {
  code: ZipErrorCode,
  entry: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.String),
}) {
  override get message() {
    switch (this.code) {
      case "zip.MALFORMED":
        return "Arquivo ZIP invalido ou corrompido.";
      case "zip.INFLATE":
        return `Falha ao descompactar a entrada do ZIP: ${this.entry}.`;
    }
  }
}

export type ZipEntry = {
  readonly name: string;
  readonly data: Uint8Array;
};

type RawEntry = {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly localOffset: number;
};

const eocdSignature = 0x06054b50;

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

const findEocd = (view: DataView, size: number) => {
  const minSize = 22;
  const maxBack = Math.min(size, minSize + 0xffff);
  const limit = size - maxBack;
  const candidate = range(size - minSize - limit + 1)
    .map((offset) => size - minSize - offset)
    .find((offset) => view.getUint32(offset, true) === eocdSignature);
  return candidate ?? -1;
};

const walkCentralDirectory = (
  buf: Uint8Array,
  view: DataView,
  eocd: number
) => {
  const total = view.getUint16(eocd + 10, true);
  const start = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder("utf-8");
  return range(total).reduce<{
    readonly entries: readonly RawEntry[];
    readonly offset: number;
  }>(
    (acc) => {
      const offset = acc.offset;
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const entry: RawEntry = {
        name: decoder.decode(
          buf.subarray(offset + 46, offset + 46 + nameLength)
        ),
        method: view.getUint16(offset + 10, true),
        compressedSize: view.getUint32(offset + 20, true),
        localOffset: view.getUint32(offset + 42, true),
      };
      return {
        entries: [...acc.entries, entry],
        offset: offset + 46 + nameLength + extraLength + commentLength,
      };
    },
    { entries: [], offset: start }
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
      new ZipError({
        code: "zip.INFLATE",
        entry: entry.name,
        cause: String(cause),
      }),
  });

export const unzipEntries = (
  bytes: Uint8Array,
  accept: (name: string) => boolean
) =>
  Effect.gen(function* () {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = findEocd(view, bytes.byteLength);
    yield* Match.value(eocd).pipe(
      Match.when(-1, () => Effect.fail(new ZipError({ code: "zip.MALFORMED" }))),
      Match.orElse(() => Effect.void)
    );
    const directory = yield* Effect.try({
      try: () => walkCentralDirectory(bytes, view, eocd),
      catch: (cause) =>
        new ZipError({ code: "zip.MALFORMED", cause: String(cause) }),
    });
    const selected = directory.filter((entry) => accept(entry.name));
    return yield* Effect.forEach(
      selected,
      (entry) =>
        entryData(bytes, view, entry).pipe(
          Effect.map((data) => ({ name: entry.name, data }) satisfies ZipEntry)
        ),
      { concurrency: 1 }
    );
  });
