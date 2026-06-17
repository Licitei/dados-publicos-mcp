import { createHash } from "node:crypto";
import { describe, it, expect } from "@effect/vitest";
import { schemaDdl, schemaHash } from "../../infra/local-database";

describe("schemaHash", () => {
  it("is a stable 64-hex digest", () => {
    expect(schemaHash()).toMatch(/^[0-9a-f]{64}$/);
    expect(schemaHash()).toEqual(schemaHash());
  });

  it("hashes the full rendered DDL, including index method/opclass/with", () => {
    const ddl = schemaDdl();
    expect(ddl).toContain("create table");
    expect(ddl).toContain("create index");
    expect(ddl).toContain("using bm25");
    expect(ddl).toContain("text_config");
    expect(ddl).toContain("vector_cosine_ops");
  });

  it("the digest is a function of the rendered DDL", () => {
    expect(schemaHash()).toEqual(
      createHash("sha256").update(schemaDdl()).digest("hex")
    );
  });
});
