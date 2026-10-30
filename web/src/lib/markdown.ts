/** Minimal GFM-ish markdown → HTML for war room answers (no deps). */

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inlineMarkdown(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(
    /(^|[^*])\*([^*\n]+)\*(?!\*)/g,
    "$1<em>$2</em>",
  );
  return out;
}

function isTableSeparator(line: string): boolean {
  const cells = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
  if (cells.length === 0) {
    return false;
  }
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function renderTable(rows: string[][]): string {
  if (rows.length === 0) {
    return "";
  }
  const [header, ...body] = rows;
  const headCells = (header ?? [])
    .map((cell) => `<th>${inlineMarkdown(cell)}</th>`)
    .join("");
  const bodyRows = body
    .map((row) => {
      const cells = row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<div class="md-table-wrap"><table><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
}

function renderList(items: string[], ordered: boolean): string {
  const tag = ordered ? "ol" : "ul";
  const lis = items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("");
  return `<${tag}>${lis}</${tag}>`;
}

/**
 * Convert a subset of markdown (headings, tables, lists, bold, code) to safe HTML.
 */
export function markdownToHtml(source: string): string {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      i += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const level = heading[1]!.length;
      blocks.push(`<h${level}>${inlineMarkdown(heading[2]!)}</h${level}>`);
      i += 1;
      continue;
    }

    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1] ?? "")
    ) {
      const tableRows: string[][] = [parseTableRow(trimmed)];
      i += 2;
      while (i < lines.length && (lines[i] ?? "").trim().includes("|")) {
        tableRows.push(parseTableRow(lines[i]!));
        i += 1;
      }
      blocks.push(renderTable(tableRows));
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(renderList(items, false));
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push(renderList(items, true));
      continue;
    }

    const paragraph: string[] = [trimmed];
    i += 1;
    while (i < lines.length) {
      const next = (lines[i] ?? "").trim();
      if (
        next.length === 0 ||
        /^(#{1,3})\s+/.test(next) ||
        /^[-*]\s+/.test(next) ||
        /^\d+\.\s+/.test(next) ||
        (next.includes("|") &&
          i + 1 < lines.length &&
          isTableSeparator(lines[i + 1] ?? ""))
      ) {
        break;
      }
      paragraph.push(next);
      i += 1;
    }
    blocks.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
  }

  return blocks.join("");
}
