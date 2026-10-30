import assert from "node:assert/strict";
import { test } from "node:test";

import { markdownToHtml } from "./markdown.js";

test("markdownToHtml renders headings, bold, lists", () => {
  const html = markdownToHtml(
    "## Título\n\nTexto com **negrito**.\n\n- um\n- dois",
  );
  assert.match(html, /<h2>Título<\/h2>/);
  assert.match(html, /<strong>negrito<\/strong>/);
  assert.match(html, /<ul><li>um<\/li><li>dois<\/li><\/ul>/);
});

test("markdownToHtml renders GFM tables and escapes raw HTML", () => {
  const html = markdownToHtml(
    "| Serviço | Sev |\n|---------|-----|\n| checkout | **critical** |\n\n<script>x</script>",
  );
  assert.match(html, /md-table-wrap/);
  assert.match(html, /<th>Serviço<\/th>/);
  assert.match(html, /<td><strong>critical<\/strong><\/td>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
