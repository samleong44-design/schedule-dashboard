import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

// AI field mapping (docs/02-schedule-ingestion.md step 3). Receives extracted
// TEXT only — never the raw file. Returns structured sailing rows.

const SailingRowSchema = z.object({
  vessel: z.string().describe("Vessel name as printed"),
  voyage: z.string().describe("Voyage number, e.g. 034E"),
  pol: z.string().describe("Port of loading — UN/LOCODE if shown, else the port name"),
  pod: z.string().describe("Port of discharge — UN/LOCODE if shown, else the port name"),
  etd: z.string().describe("Departure date from POL, ISO 8601 date (YYYY-MM-DD)"),
  eta: z.string().nullable().describe("Arrival date at POD, ISO 8601 date, null if absent"),
  cy_cutoff: z
    .string()
    .nullable()
    .describe("CY/gate cutoff as ISO 8601 datetime if the file states one, else null"),
});

const ScheduleSchema = z.object({
  rows: z.array(SailingRowSchema),
  notes: z.string().nullable().describe("Anything ambiguous about the file, e.g. assumed date format"),
});

export type ParsedRow = z.infer<typeof SailingRowSchema>;

const MAX_TEXT_CHARS = 150_000;

export async function mapFieldsWithClaude(
  text: string,
  carrierName: string,
): Promise<{ rows: ParsedRow[]; notes: string | null }> {
  if (text.length > MAX_TEXT_CHARS) {
    // A carrier schedule this large is almost certainly a mis-extracted file.
    throw new Error(
      `Extracted text is ${text.length} characters — too large for a carrier schedule. Check the file.`,
    );
  }

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 32000,
    output_config: {
      effort: "low", // extraction task; keeps latency inside serverless limits
      format: zodOutputFormat(ScheduleSchema),
    },
    system:
      "You extract container sailing schedules from carrier files that have been converted to text. " +
      "Identify every sailing (one row per vessel+voyage+port-of-loading) and return the structured rows. " +
      "Dates: resolve to ISO 8601. If the year is missing, assume the schedule is for the current or " +
      "upcoming months. If day/month order is ambiguous, prefer DD/MM (these are Asian carrier files) " +
      "and say so in notes. Ignore header/footer boilerplate, agent contact details, and legal text. " +
      "Do not invent rows; if the text contains no schedule, return an empty rows array.",
    messages: [
      {
        role: "user",
        content: `Carrier: ${carrierName}\n\nExtracted file text:\n\n${text}`,
      },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("Could not identify the schedule columns in this file.");
  }
  return { rows: parsed.rows, notes: parsed.notes };
}
