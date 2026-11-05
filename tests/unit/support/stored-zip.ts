import { Effect } from "effect";
import * as Arr from "effect/Array";
import { dual } from "effect/Function";
import * as Option from "effect/Option";

export type ZipEntry = { readonly name: string; readonly bytes: Uint8Array };

const numberAt = (values: readonly number[], index: number) =>
  Arr.get(values, index).pipe(Option.getOrElse(() => 0));

const crcTable = Arr.makeBy(256, (n) =>
  Arr.reduce(Arr.range(1, 8), n, (c) =>
    (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  )
);

const crc32 = (bytes: Uint8Array) =>
  (Arr.reduce(
    Arr.fromIterable(bytes),
    0xffffffff,
    (crc, byte) => (crc >>> 8) ^ numberAt(crcTable, (crc ^ byte) & 0xff)
  ) ^
    0xffffffff) >>>
  0;

const encoder = new TextEncoder();

export const utf8 = (text: string) => encoder.encode(text);

const concat = (chunks: readonly Uint8Array[]) => {
  const out = new Uint8Array(
    Arr.reduce(chunks, 0, (sum, chunk) => sum + chunk.length)
  );
  Arr.reduce(chunks, 0, (position, chunk) => {
    out.set(chunk, position);
    return position + chunk.length;
  });
  return out;
};

export type ZipMethod = "store" | "deflate";

type ZipPart = {
  readonly name: string;
  readonly raw: Uint8Array;
  readonly data: Uint8Array;
  readonly method: number;
};

const assemble = (parts: readonly ZipPart[]) => {
  const local = Arr.map(parts, (part) => {
    const nameBytes = utf8(part.name);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(8, part.method, true);
    view.setUint32(14, crc32(part.raw), true);
    view.setUint32(18, part.data.length, true);
    view.setUint32(22, part.raw.length, true);
    view.setUint16(26, nameBytes.length, true);
    header.set(nameBytes, 30);
    return { nameBytes, header, part };
  });
  const offsets = Arr.scan(
    local,
    0,
    (acc, item) => acc + item.header.length + item.part.data.length
  );
  const central = Arr.map(local, (item, index) => {
    const header = new Uint8Array(46 + item.nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(10, item.part.method, true);
    view.setUint32(16, crc32(item.part.raw), true);
    view.setUint32(20, item.part.data.length, true);
    view.setUint32(24, item.part.raw.length, true);
    view.setUint16(28, item.nameBytes.length, true);
    view.setUint32(42, numberAt(offsets, index), true);
    header.set(item.nameBytes, 46);
    return header;
  });
  const centralSize = Arr.reduce(
    central,
    0,
    (sum, header) => sum + header.length
  );
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, parts.length, true);
  eocdView.setUint16(10, parts.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(
    16,
    Arr.last(offsets).pipe(Option.getOrElse(() => 0)),
    true
  );
  return concat([
    ...Arr.flatMap(local, (item) => [item.header, item.part.data]),
    ...central,
    eocd,
  ]);
};

export const storedZip = (entries: readonly ZipEntry[]) =>
  assemble(
    Arr.map(entries, (entry) => ({
      name: entry.name,
      raw: entry.bytes,
      data: entry.bytes,
      method: 0,
    }))
  );

const deflateRaw = (bytes: Uint8Array) =>
  Effect.promise(() =>
    new Response(
      new Blob([bytes.slice()]).stream().pipeThrough(new CompressionStream("deflate-raw"))
    ).arrayBuffer()
  ).pipe(Effect.map((buffer) => new Uint8Array(buffer)));

export const zip: {
  (
    options: { readonly method: ZipMethod }
  ): (entries: readonly ZipEntry[]) => Effect.Effect<Uint8Array>;
  (
    entries: readonly ZipEntry[],
    options: { readonly method: ZipMethod }
  ): Effect.Effect<Uint8Array>;
} = dual(
  2,
  (
    entries: readonly ZipEntry[],
    options: { readonly method: ZipMethod }
  ): Effect.Effect<Uint8Array> =>
    options.method === "store"
      ? Effect.succeed(storedZip(entries))
      : Effect.forEach(
          entries,
          (entry) =>
            deflateRaw(entry.bytes).pipe(
              Effect.map((data) => ({
                name: entry.name,
                raw: entry.bytes,
                data,
                method: 8,
              }))
            ),
          { concurrency: 2 }
        ).pipe(Effect.map(assemble))
);
