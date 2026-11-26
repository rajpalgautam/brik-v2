import test from "node:test";
import assert from "node:assert/strict";
import { fileType } from "../lib/files.ts";
test("rejects renamed binaries, malformed office archives and invalid text", () => {
  const binary = new Uint8Array([77, 90, 0, 255]);
  for (const extension of ["pdf", "png", "jpg", "docx", "txt", "exe"])
    assert.equal(fileType("lecture." + extension, binary), null);
  assert.equal(
    fileType("outline.md", new TextEncoder().encode("# Plan")),
    "text/markdown",
  );
});
