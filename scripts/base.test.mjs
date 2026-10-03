import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeBase, readBase } from "./base.mjs";

test("normalizeBase adds missing slashes", () => {
  assert.equal(normalizeBase("/"), "/");
  assert.equal(normalizeBase(""), "/");
  assert.equal(normalizeBase("pocket-ledger"), "/pocket-ledger/");
  assert.equal(normalizeBase("/pocket-ledger"), "/pocket-ledger/");
  assert.equal(normalizeBase("/pocket-ledger/"), "/pocket-ledger/");
  assert.equal(normalizeBase("/a/b/"), "/a/b/");
});

test("normalizeBase rejects unsafe paths", () => {
  assert.throws(() => normalizeBase("/../x/"));
  assert.throws(() => normalizeBase("/a b/"));
  assert.throws(() => normalizeBase("//"));
  assert.throws(() => normalizeBase("/x?y/"));
});

test("readBase prefers --base over BASE env", () => {
  assert.equal(readBase(["--base=/pocket-ledger/"], { BASE: "/other/" }), "/pocket-ledger/");
  assert.equal(readBase([], { BASE: "/other" }), "/other/");
  assert.equal(readBase([], {}), "/");
});
