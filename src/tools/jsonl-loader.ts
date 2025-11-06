import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { readFile, writeFile } from "fs/promises";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import type { Tool } from "./tool";
import type { Quote } from "./quote-storage";

// =============================================================================
// ENHANCED QUOTE DATA STRUCTURE - With Source Attribution & Timeline Support
// =============================================================================

/**
 * Enhanced Quote interface that tracks:
 * - Who is being quoted (Tyler vs someone else from an exhibit)
 * - Timeline/date information
 * - Cross-references to other ECF documents
 */
export interface EnhancedQuote extends Quote {
  // Source attribution - tracking quote-within-quote
  source_attribution?: {
    quoted_by: string; // "tyler" | "beckerman" | "defendant" | "exhibit" | etc.
    original_source?: string; // e.g., "Exhibit A", "ECF 17-1", etc.
    is_nested_quote: boolean; // Is this Tyler quoting someone else?
  };

  // Timeline information
  date?: string; // YYYY-MM-DD format
  event_id?: string; // Link to timeline event
  event_type?: "filing" | "ruling" | "hearing" | "deadline" | "other";

  // Cross-references
  cross_references?: string[]; // ECF numbers this quote references
  related_quotes?: string[]; // Other quote_ids related to this
}

/**
 * JSONL format from Tyler's data
 * Example:
 * {"ecf": "11", "page": "1", "line": "[n/a]", "quoted_point": "...", "matter_of": "Fact", ...}
 */
interface QuoteJSONL {
  ecf: string;
  page: string;
  line: string;
  quoted_point: string;
  matter_of?: string;
  cited?: string;
  position?: string;

  // Enhanced fields
  quoted_by?: string; // Who is speaking?
  original_source?: string; // Where did they get this quote?
  date?: string; // When did this event occur?
  event_type?: string;
  cross_references?: string[]; // Related ECF numbers
}

// =============================================================================
// IN-MEMORY STORAGE FOR ENHANCED QUOTES
// =============================================================================

const enhancedQuotes: Map<string, EnhancedQuote> = new Map();
const sourceIndex: Map<string, string[]> = new Map(); // quoted_by -> [quote_ids]
const dateIndex: Map<string, string[]> = new Map(); // YYYY-MM-DD -> [quote_ids]
const crossRefIndex: Map<string, string[]> = new Map(); // ecf_number -> [quote_ids that reference it]

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function extractFirstThreeWords(text: string): string {
  const words = text.trim().split(/\s+/);
  return words.slice(0, 3).join(" ").toLowerCase();
}

function normalizePosition(pos?: string): "Positive" | "Negative" | "Indifferent" {
  if (!pos) return "Indifferent";
  const normalized = pos.toLowerCase();
  if (normalized.includes("positive")) return "Positive";
  if (normalized.includes("negative")) return "Negative";
  return "Indifferent";
}

function normalizeMatterOf(matter?: string): "Fact" | "Law" | null {
  if (!matter) return null;
  const normalized = matter.toLowerCase();
  if (normalized.includes("fact")) return "Fact";
  if (normalized.includes("law")) return "Law";
  return null;
}

function normalizeEventType(
  eventType?: string,
): "filing" | "ruling" | "hearing" | "deadline" | "other" | undefined {
  if (!eventType) return undefined;
  const normalized = eventType.toLowerCase();
  if (normalized.includes("filing")) return "filing";
  if (normalized.includes("ruling") || normalized.includes("order")) return "ruling";
  if (normalized.includes("hearing")) return "hearing";
  if (normalized.includes("deadline")) return "deadline";
  return "other";
}

/**
 * Detects if a quote is Tyler quoting someone else
 * Heuristics:
 * - Contains quotation marks within the text
 * - Cites an exhibit (ECF XX-1, Exhibit A, etc.)
 * - Has "quoted_by" field set to someone other than Tyler
 */
function detectSourceAttribution(data: QuoteJSONL): EnhancedQuote["source_attribution"] {
  const quotedBy = data.quoted_by?.toLowerCase() || "tyler";
  const originalSource = data.original_source || data.cited || "";

  // Check if this is a nested quote (Tyler quoting someone else)
  const hasInnerQuotes = /["""''']/.test(data.quoted_point);
  const citesExhibit = /exhibit|ecf \d+-\d+/i.test(originalSource);

  const isNestedQuote = quotedBy !== "tyler" || hasInnerQuotes || citesExhibit;

  return {
    quoted_by: quotedBy,
    original_source: originalSource || undefined,
    is_nested_quote: isNestedQuote,
  };
}

function addToEnhancedIndexes(quote: EnhancedQuote): void {
  // Index by source attribution
  if (quote.source_attribution) {
    const quotedBy = quote.source_attribution.quoted_by;
    const existing = sourceIndex.get(quotedBy) || [];
    existing.push(quote.quote_id);
    sourceIndex.set(quotedBy, existing);
  }

  // Index by date
  if (quote.date) {
    const existing = dateIndex.get(quote.date) || [];
    existing.push(quote.quote_id);
    dateIndex.set(quote.date, existing);
  }

  // Index by cross-references
  if (quote.cross_references) {
    quote.cross_references.forEach((ecfRef) => {
      const existing = crossRefIndex.get(ecfRef) || [];
      existing.push(quote.quote_id);
      crossRefIndex.set(ecfRef, existing);
    });
  }
}

function importQuoteFromJSONL(data: QuoteJSONL): EnhancedQuote {
  const quoteId = generateId();
  const fullText = data.quoted_point;
  const firstThree = extractFirstThreeWords(fullText);

  const quote: EnhancedQuote = {
    quote_id: quoteId,
    ecf_number: data.ecf,
    page: data.page,
    line: data.line || "n/a",
    full_text: fullText,
    first_three_words: firstThree,
    matter_of: normalizeMatterOf(data.matter_of),
    cited: data.cited || "",
    position: normalizePosition(data.position),
    word_count: fullText.split(/\s+/).length,
    created_at: Date.now(),

    // Enhanced fields
    source_attribution: detectSourceAttribution(data),
    date: data.date,
    event_type: normalizeEventType(data.event_type),
    cross_references: data.cross_references,
  };

  enhancedQuotes.set(quoteId, quote);
  addToEnhancedIndexes(quote);

  return quote;
}

// =============================================================================
// EXPORT FUNCTIONS (for other tools to use)
// =============================================================================

export function getEnhancedQuoteById(quoteId: string): EnhancedQuote | undefined {
  return enhancedQuotes.get(quoteId);
}

export function getAllEnhancedQuotes(): EnhancedQuote[] {
  return Array.from(enhancedQuotes.values());
}

export function findQuotesBySource(quotedBy: string): EnhancedQuote[] {
  const quoteIds = sourceIndex.get(quotedBy.toLowerCase()) || [];
  return quoteIds.map((id) => enhancedQuotes.get(id)!).filter(Boolean);
}

export function findQuotesByDate(date: string): EnhancedQuote[] {
  const quoteIds = dateIndex.get(date) || [];
  return quoteIds.map((id) => enhancedQuotes.get(id)!).filter(Boolean);
}

export function findQuotesByDateRange(startDate: string, endDate: string): EnhancedQuote[] {
  const start = new Date(startDate);
  const end = new Date(endDate);

  return getAllEnhancedQuotes().filter((quote) => {
    if (!quote.date) return false;
    const quoteDate = new Date(quote.date);
    return quoteDate >= start && quoteDate <= end;
  });
}

export function findQuotesByCrossReference(ecfNumber: string): EnhancedQuote[] {
  const quoteIds = crossRefIndex.get(ecfNumber) || [];
  return quoteIds.map((id) => enhancedQuotes.get(id)!).filter(Boolean);
}

export function getEnhancedStats(): {
  total_quotes: number;
  by_source: Record<string, number>;
  by_date: Record<string, number>;
  nested_quotes: number;
  quotes_with_dates: number;
  quotes_with_cross_refs: number;
} {
  const allQuotes = getAllEnhancedQuotes();

  const bySource: Record<string, number> = {};
  const byDate: Record<string, number> = {};
  let nestedQuotes = 0;
  let quotesWithDates = 0;
  let quotesWithCrossRefs = 0;

  allQuotes.forEach((q) => {
    if (q.source_attribution) {
      const source = q.source_attribution.quoted_by;
      bySource[source] = (bySource[source] || 0) + 1;

      if (q.source_attribution.is_nested_quote) {
        nestedQuotes++;
      }
    }

    if (q.date) {
      quotesWithDates++;
      byDate[q.date] = (byDate[q.date] || 0) + 1;
    }

    if (q.cross_references && q.cross_references.length > 0) {
      quotesWithCrossRefs++;
    }
  });

  return {
    total_quotes: allQuotes.length,
    by_source: bySource,
    by_date: byDate,
    nested_quotes: nestedQuotes,
    quotes_with_dates: quotesWithDates,
    quotes_with_cross_refs: quotesWithCrossRefs,
  };
}

// =============================================================================
// MCP TOOLS
// =============================================================================

// 1. IMPORT QUOTES FROM JSONL FILE (streaming)
const ImportJSONLSchema = z.object({
  file_path: z.string().describe("Path to JSONL file containing quotes"),
  preview_only: z
    .boolean()
    .optional()
    .describe("If true, shows first 10 entries without importing"),
});

export const importJSONL: Tool = {
  schema: {
    name: "jsonl_import_quotes",
    description:
      "Import Tyler's case quotes from JSONL file (streaming, handles large files). Automatically detects nested quotes (Tyler quoting someone else from an exhibit) and tracks timeline/cross-references.",
    inputSchema: zodToJsonSchema(ImportJSONLSchema),
  },
  handle: async (_context, params) => {
    const { file_path, preview_only } = ImportJSONLSchema.parse(params);

    try {
      const fileStream = createReadStream(file_path);
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let importedCount = 0;
      let lineNumber = 0;
      const errors: string[] = [];
      const preview: any[] = [];

      for await (const line of rl) {
        lineNumber++;

        if (!line.trim()) continue; // Skip empty lines

        try {
          const data = JSON.parse(line);

          if (preview_only && preview.length < 10) {
            preview.push({
              line_number: lineNumber,
              data,
              detected_source: detectSourceAttribution(data),
            });
          }

          if (!preview_only) {
            importQuoteFromJSONL(data);
            importedCount++;
          }
        } catch (err) {
          errors.push(`Line ${lineNumber}: ${err}`);
          if (errors.length > 100) break; // Stop after 100 errors
        }
      }

      if (preview_only) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  preview_mode: true,
                  total_lines: lineNumber,
                  preview_entries: preview.length,
                  preview,
                  note: "Set preview_only=false to import all quotes",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const stats = getEnhancedStats();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                imported: importedCount,
                total_lines: lineNumber,
                errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
                stats,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error importing JSONL: ${error}`,
          },
        ],
        isError: true,
      };
    }
  },
};

// 2. EXPORT QUOTES TO JSONL FORMAT
const ExportJSONLSchema = z.object({
  output_path: z.string().describe("Path where to save the JSONL file"),
  ecf_number: z.string().optional().describe("Optional: export only specific ECF"),
  date_range: z
    .object({
      start: z.string(),
      end: z.string(),
    })
    .optional()
    .describe("Optional: export quotes within date range (YYYY-MM-DD)"),
});

export const exportJSONL: Tool = {
  schema: {
    name: "jsonl_export_quotes",
    description: "Export enhanced quotes to JSONL format (one quote per line)",
    inputSchema: zodToJsonSchema(ExportJSONLSchema),
  },
  handle: async (_context, params) => {
    const { output_path, ecf_number, date_range } = ExportJSONLSchema.parse(params);

    try {
      let quotesToExport = getAllEnhancedQuotes();

      // Filter by ECF if specified
      if (ecf_number) {
        quotesToExport = quotesToExport.filter((q) => q.ecf_number === ecf_number);
      }

      // Filter by date range if specified
      if (date_range) {
        const start = new Date(date_range.start);
        const end = new Date(date_range.end);
        quotesToExport = quotesToExport.filter((q) => {
          if (!q.date) return false;
          const quoteDate = new Date(q.date);
          return quoteDate >= start && quoteDate <= end;
        });
      }

      // Write as JSONL (one JSON object per line)
      const lines = quotesToExport.map((quote) => JSON.stringify(quote));
      await writeFile(output_path, lines.join("\n"));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                exported: quotesToExport.length,
                output_path,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error exporting JSONL: ${error}`,
          },
        ],
        isError: true,
      };
    }
  },
};

// 3. PREVIEW JSONL FILE AS TABLE
const PreviewJSONLSchema = z.object({
  file_path: z.string().describe("Path to JSONL file"),
  max_entries: z
    .number()
    .optional()
    .default(20)
    .describe("Maximum number of entries to show (default 20)"),
});

export const previewJSONL: Tool = {
  schema: {
    name: "jsonl_preview_table",
    description:
      "Preview JSONL file in table format for review before importing. Shows source attribution detection and cross-references.",
    inputSchema: zodToJsonSchema(PreviewJSONLSchema),
  },
  handle: async (_context, params) => {
    const { file_path, max_entries } = PreviewJSONLSchema.parse(params);

    try {
      const fileStream = createReadStream(file_path);
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      const preview: any[] = [];
      let lineNumber = 0;

      for await (const line of rl) {
        lineNumber++;

        if (!line.trim()) continue;

        if (preview.length >= max_entries) break;

        try {
          const data = JSON.parse(line);
          const sourceAttribution = detectSourceAttribution(data);

          preview.push({
            line: lineNumber,
            ecf: data.ecf,
            page: data.page,
            quote_start: data.quoted_point.substring(0, 80) + "...",
            quoted_by: sourceAttribution?.quoted_by || "unknown",
            is_nested: sourceAttribution?.is_nested_quote ? "YES" : "NO",
            original_source: sourceAttribution?.original_source || "-",
            date: data.date || "-",
            matter_of: data.matter_of || "-",
            position: data.position || "-",
            cross_refs: data.cross_references?.join(", ") || "-",
          });
        } catch (err) {
          preview.push({
            line: lineNumber,
            error: `Parse error: ${err}`,
          });
        }
      }

      // Format as markdown table
      const headers = [
        "Line",
        "ECF",
        "Pg",
        "Quote Start",
        "Quoted By",
        "Nested?",
        "Orig Source",
        "Date",
        "Matter",
        "Pos",
        "Cross Refs",
      ];

      const rows = preview.map((entry) => {
        if (entry.error) {
          return `| ${entry.line} | ERROR | | | | | | | | | ${entry.error} |`;
        }
        return `| ${entry.line} | ${entry.ecf} | ${entry.page} | ${entry.quote_start} | ${entry.quoted_by} | ${entry.is_nested} | ${entry.original_source} | ${entry.date} | ${entry.matter_of} | ${entry.position} | ${entry.cross_refs} |`;
      });

      const table = [
        `| ${headers.join(" | ")} |`,
        `| ${headers.map(() => "---").join(" | ")} |`,
        ...rows,
      ].join("\n");

      return {
        content: [
          {
            type: "text",
            text: `# JSONL Preview: ${file_path}\n\n${table}\n\n**Total lines processed:** ${lineNumber}\n**Entries shown:** ${preview.length}\n\nUse \`jsonl_import_quotes\` with \`preview_only=false\` to import all quotes.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error previewing JSONL: ${error}`,
          },
        ],
        isError: true,
      };
    }
  },
};

// 4. SEARCH QUOTES BY SOURCE ATTRIBUTION
const SearchBySourceSchema = z.object({
  quoted_by: z
    .string()
    .describe('Who is being quoted? e.g., "tyler", "beckerman", "defendant", "exhibit"'),
  include_nested_only: z
    .boolean()
    .optional()
    .describe("If true, only show quotes where Tyler is quoting someone else"),
});

export const searchBySource: Tool = {
  schema: {
    name: "jsonl_search_by_source",
    description:
      "Search quotes by who is speaking. Useful for finding when Tyler is quoting someone else from an exhibit.",
    inputSchema: zodToJsonSchema(SearchBySourceSchema),
  },
  handle: async (_context, params) => {
    const { quoted_by, include_nested_only } = SearchBySourceSchema.parse(params);

    let results = findQuotesBySource(quoted_by);

    if (include_nested_only) {
      results = results.filter((q) => q.source_attribution?.is_nested_quote);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              quoted_by,
              include_nested_only,
              count: results.length,
              quotes: results,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

// 5. SEARCH QUOTES BY DATE RANGE
const SearchByDateSchema = z.object({
  start_date: z.string().describe("Start date in YYYY-MM-DD format"),
  end_date: z.string().describe("End date in YYYY-MM-DD format"),
  ecf_number: z.string().optional().describe("Optional: filter by ECF number"),
});

export const searchByDateRange: Tool = {
  schema: {
    name: "jsonl_search_by_date_range",
    description: "Search quotes within a date range (for timeline building)",
    inputSchema: zodToJsonSchema(SearchByDateSchema),
  },
  handle: async (_context, params) => {
    const { start_date, end_date, ecf_number } = SearchByDateSchema.parse(params);

    let results = findQuotesByDateRange(start_date, end_date);

    if (ecf_number) {
      results = results.filter((q) => q.ecf_number === ecf_number);
    }

    // Sort by date
    results.sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              start_date,
              end_date,
              ecf_number,
              count: results.length,
              quotes: results,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

// 6. FIND CROSS-REFERENCES
const FindCrossRefsSchema = z.object({
  ecf_number: z
    .string()
    .describe("ECF number to find cross-references for (e.g., '8', '17-1')"),
});

export const findCrossReferences: Tool = {
  schema: {
    name: "jsonl_find_cross_references",
    description:
      "Find all quotes that reference a specific ECF document (for building cross-reference maps)",
    inputSchema: zodToJsonSchema(FindCrossRefsSchema),
  },
  handle: async (_context, params) => {
    const { ecf_number } = FindCrossRefsSchema.parse(params);

    const results = findQuotesByCrossReference(ecf_number);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ecf_number,
              referenced_by_count: results.length,
              quotes: results,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

// 7. GET ENHANCED STATS
export const getEnhancedStatsTools: Tool = {
  schema: {
    name: "jsonl_get_stats",
    description:
      "Get statistics about enhanced quote database (source attribution, dates, cross-references)",
    inputSchema: zodToJsonSchema(z.object({})),
  },
  handle: async (_context, _params) => {
    const stats = getEnhancedStats();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(stats, null, 2),
        },
      ],
    };
  },
};
