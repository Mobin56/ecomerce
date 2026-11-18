import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, toCsv } from "../../src/lib/csv.ts";
import { sanitizeBasicHtml } from "../../src/lib/sanitize.ts";

test("CSV round trip with quotes, commas and newlines", () => {
  const csv = toCsv(["a", "b"], [{ a: 'He said "hi"', b: "x,y\nz" }, { a: "=SUM(A1)", b: "-5" }]);
  const rows = parseCsv(csv);
  assert.equal(rows[0]!.a, 'He said "hi"');
  assert.equal(rows[0]!.b, "x,y\nz");
  assert.equal(rows[1]!.a, "'=SUM(A1)", "formula injection neutralised");
  assert.equal(rows[1]!.b, "-5", "negative numbers untouched");
});

test("HTML sanitizer strips scripts, handlers and unsafe links", () => {
  const dirty = `<p onclick="x()">Hi<script>alert(1)</script></p><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a><a href="/pages/about" target="_blank">ok</a><iframe src="//evil"></iframe>`;
  const clean = sanitizeBasicHtml(dirty);
  assert.equal(clean, `<p>Hi</p><a>bad</a><a href="/pages/about" rel="noopener nofollow">ok</a>`);
});
