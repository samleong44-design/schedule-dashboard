import * as XLSX from "xlsx";
import { extractText, getDocumentProxy } from "unpdf";

// Deterministic text extraction — no AI here (docs/02-schedule-ingestion.md step 2).
// Returns plain text rows; Excel and PDF converge on one code path after this.
export async function extractToText(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop();

  if (ext === "xlsx" || ext === "xls") {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], {
        header: 1,
        raw: false,
        defval: "",
      });
      const lines = rows
        .map((r) => r.map((c) => String(c).trim()).join("\t"))
        .filter((l) => l.replace(/\t/g, "").length > 0);
      if (lines.length > 0) parts.push(`## Sheet: ${name}\n${lines.join("\n")}`);
    }
    return parts.join("\n\n");
  }

  if (ext === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text.trim();
  }

  throw new Error(`Unsupported file type: .${ext}`);
}
