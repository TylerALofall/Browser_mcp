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
    author: string; // "tyler" | "beckerman" | "defendant" | "exhibit" | etc.
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

  // Fuzzy match tracking for cross-document verification
  matches_scanned?: string[]; // List of ECF documents scanned for matching quotes
  matches_found?: Array<{
    // Proper Bluebook citation format
    ecf: string; // ECF number where match was found
    page: string; // Page number
    paragraph?: string; // Paragraph number if available (use instead of line if present)
    line?: string; // Line number (skip if n/a or if paragraph is used)
    quote_id: string; // ID of the matching quote
    similarity_score: number; // Fuzzy match score (0-1)
  }>;
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
  author?: string; // Who is speaking?
  original_source?: string; // Where did they get this quote?
  date?: string; // When did this event occur?
  event_type?: string;
  cross_references?: string[]; // Related ECF numbers
}

// =============================================================================
// IN-MEMORY STORAGE FOR ENHANCED QUOTES
// =============================================================================

const enhancedQuotes: Map<string, EnhancedQuote> = new Map();
const sourceIndex: Map<string, string[]> = new Map(); // author -> [quote_ids]
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
 * - Has "author" field set to someone other than Tyler
 */
function detectSourceAttribution(data: QuoteJSONL): EnhancedQuote["source_attribution"] {
  const author = data.author?.toLowerCase() || "tyler";
  const originalSource = data.original_source || data.cited || "";

  // Check if this is a nested quote (Tyler quoting someone else)
  const hasInnerQuotes = /["""''']/.test(data.quoted_point);
  const citesExhibit = /exhibit|ecf \d+-\d+/i.test(originalSource);

  const isNestedQuote = author !== "tyler" || hasInnerQuotes || citesExhibit;

  return {
    author: author,
    original_source: originalSource || undefined,
    is_nested_quote: isNestedQuote,
  };
}

function addToEnhancedIndexes(quote: EnhancedQuote): void {
  // Index by source attribution
  if (quote.source_attribution) {
    const author = quote.source_attribution.author;
    const existing = sourceIndex.get(author) || [];
    existing.push(quote.quote_id);
    sourceIndex.set(author, existing);
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
// FUZZY MATCHING FOR CROSS-REFERENCE VERIFICATION
// =============================================================================

/**
 * Simple string similarity (0-1) using Levenshtein distance
 * 1.0 = exact match, 0.0 = completely different
 */
function stringSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Levenshtein distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) {
      costs[s2.length] = lastValue;
    }
  }
  return costs[s2.length];
}

/**
 * Format Bluebook citation for a quote match
 * Format: "ECF 60 pg 4" or "ECF 60 pg 4 ¶ 3" (if paragraph available)
 * Skips line number if it's "n/a" or if paragraph is used
 */
function formatBluebookCitation(match: {
  ecf: string;
  page: string;
  paragraph?: string;
  line?: string;
}): string {
  let citation = `ECF ${match.ecf}`;

  // Add page if available
  if (match.page && match.page !== "n/a") {
    citation += ` pg ${match.page}`;
  }

  // Add paragraph if available (preferred over line)
  if (match.paragraph && match.paragraph !== "n/a") {
    citation += ` ¶ ${match.paragraph}`;
  } else if (match.line && match.line !== "n/a" && match.line !== "[n/a]") {
    // Only add line if paragraph not available and line is valid
    citation += ` ln ${match.line}`;
  }

  return citation;
}

/**
 * Perform fuzzy matching of a quote against all other quotes in different ECF documents
 * Returns matches with similarity score above threshold
 */
function findCrossDocumentMatches(
  sourceQuote: EnhancedQuote,
  threshold: number = 0.85,
): EnhancedQuote["matches_found"] {
  const allQuotes = getAllEnhancedQuotes();
  const matches: NonNullable<EnhancedQuote["matches_found"]> = [];

  const sourceText = sourceQuote.full_text.toLowerCase().trim();

  for (const targetQuote of allQuotes) {
    // Skip same quote
    if (targetQuote.quote_id === sourceQuote.quote_id) continue;

    // Skip quotes from same ECF document
    if (targetQuote.ecf_number === sourceQuote.ecf_number) continue;

    const targetText = targetQuote.full_text.toLowerCase().trim();

    // Calculate similarity
    const similarity = stringSimilarity(sourceText, targetText);

    if (similarity >= threshold) {
      matches.push({
        ecf: targetQuote.ecf_number,
        page: targetQuote.page,
        paragraph: undefined, // Can be enhanced later
        line: targetQuote.line !== "[n/a]" ? targetQuote.line : undefined,
        quote_id: targetQuote.quote_id,
        similarity_score: similarity,
      });
    }
  }

  // Sort by similarity score (highest first)
  matches.sort((a, b) => b.similarity_score - a.similarity_score);

  return matches;
}

/**
 * Scan all documents for matches to a specific quote
 * Updates the quote with matches_scanned and matches_found
 */
export function scanQuoteForMatches(
  quoteId: string,
  threshold: number = 0.85,
): {
  scanned: string[];
  found: string;
  matches: NonNullable<EnhancedQuote["matches_found"]>;
} {
  const quote = enhancedQuotes.get(quoteId);
  if (!quote) {
    throw new Error(`Quote not found: ${quoteId}`);
  }

  // Get all unique ECF numbers (excluding the source ECF)
  const allECFs = new Set<string>();
  getAllEnhancedQuotes().forEach((q) => {
    if (q.ecf_number !== quote.ecf_number) {
      allECFs.add(q.ecf_number);
    }
  });

  const scannedDocs = Array.from(allECFs).sort();

  // Find matches
  const matches = findCrossDocumentMatches(quote, threshold);

  // Update the quote with scan results
  quote.matches_scanned = scannedDocs;
  quote.matches_found = matches;

  // Format matches as Bluebook citations
  const bluebookCitations = matches && matches.length > 0
    ? matches.map((m) => formatBluebookCitation(m)).join("; ")
    : "No matches found";

  return {
    scanned: scannedDocs,
    found: bluebookCitations,
    matches: matches || [],
  };
}

/**
 * Batch scan all quotes for cross-document matches
 * This is the main function to run for building the cross-reference database
 */
export function batchScanAllQuotesForMatches(threshold: number = 0.85): {
  total_quotes: number;
  quotes_scanned: number;
  total_matches_found: number;
  processing_time_ms: number;
} {
  const startTime = Date.now();
  const allQuotes = getAllEnhancedQuotes();

  let quotesScanned = 0;
  let totalMatches = 0;

  for (const quote of allQuotes) {
    const result = scanQuoteForMatches(quote.quote_id, threshold);
    quotesScanned++;
    totalMatches += result.matches.length;
  }

  const processingTime = Date.now() - startTime;

  return {
    total_quotes: allQuotes.length,
    quotes_scanned: quotesScanned,
    total_matches_found: totalMatches,
    processing_time_ms: processingTime,
  };
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

export function findQuotesBySource(author: string): EnhancedQuote[] {
  const quoteIds = sourceIndex.get(author.toLowerCase()) || [];
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
      const source = q.source_attribution.author;
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
            author: sourceAttribution?.author || "unknown",
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
        "Author",
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
        return `| ${entry.line} | ${entry.ecf} | ${entry.page} | ${entry.quote_start} | ${entry.author} | ${entry.is_nested} | ${entry.original_source} | ${entry.date} | ${entry.matter_of} | ${entry.position} | ${entry.cross_refs} |`;
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
  author: z
    .string()
    .describe('Who is the author/speaker? e.g., "tyler", "beckerman", "defendant", "exhibit"'),
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
    const { author, include_nested_only } = SearchBySourceSchema.parse(params);

    let results = findQuotesBySource(author);

    if (include_nested_only) {
      results = results.filter((q) => q.source_attribution?.is_nested_quote);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              author,
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

// 8. SCAN SINGLE QUOTE FOR CROSS-DOCUMENT MATCHES
const ScanQuoteSchema = z.object({
  quote_id: z.string().describe("Quote ID to scan for matches in other documents"),
  threshold: z
    .number()
    .optional()
    .default(0.85)
    .describe("Similarity threshold (0-1, default 0.85 = 85% match)"),
});

export const scanQuote: Tool = {
  schema: {
    name: "jsonl_scan_quote_for_matches",
    description:
      "Scan a specific quote for matching text in other ECF documents. Returns Bluebook citations of all matches found. Useful for proving you already presented facts in the record.",
    inputSchema: zodToJsonSchema(ScanQuoteSchema),
  },
  handle: async (_context, params) => {
    const { quote_id, threshold } = ScanQuoteSchema.parse(params);

    try {
      const result = scanQuoteForMatches(quote_id, threshold);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                quote_id,
                threshold,
                scanned_documents: result.scanned,
                bluebook_citations: result.found,
                matches: result.matches,
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
            text: `Error scanning quote: ${error}`,
          },
        ],
        isError: true,
      };
    }
  },
};

// 9. BATCH SCAN ALL QUOTES FOR MATCHES
const BatchScanSchema = z.object({
  threshold: z
    .number()
    .optional()
    .default(0.85)
    .describe("Similarity threshold (0-1, default 0.85 = 85% match)"),
});

export const batchScanQuotes: Tool = {
  schema: {
    name: "jsonl_batch_scan_all_quotes",
    description:
      "Scan ALL quotes for cross-document matches. This builds a complete cross-reference database showing where each fact appears in multiple documents. Essential for proving you already presented information in the record.",
    inputSchema: zodToJsonSchema(BatchScanSchema),
  },
  handle: async (_context, params) => {
    const { threshold } = BatchScanSchema.parse(params);

    try {
      const result = batchScanAllQuotesForMatches(threshold);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                threshold,
                ...result,
                note: "All quotes have been scanned. Use jsonl_get_quote_with_matches to view results.",
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
            text: `Error batch scanning quotes: ${error}`,
          },
        ],
        isError: true,
      };
    }
  },
};

// 10. GET QUOTE WITH CROSS-REFERENCE MATCHES
const GetQuoteWithMatchesSchema = z.object({
  quote_id: z.string().describe("Quote ID to retrieve with cross-reference matches"),
});

export const getQuoteWithMatches: Tool = {
  schema: {
    name: "jsonl_get_quote_with_matches",
    description:
      "Get a quote with its cross-reference matches (if scanned). Shows where the same/similar text appears in other documents with proper Bluebook citations.",
    inputSchema: zodToJsonSchema(GetQuoteWithMatchesSchema),
  },
  handle: async (_context, params) => {
    const { quote_id } = GetQuoteWithMatchesSchema.parse(params);

    const quote = getEnhancedQuoteById(quote_id);

    if (!quote) {
      return {
        content: [
          {
            type: "text",
            text: `Quote not found: ${quote_id}`,
          },
        ],
        isError: true,
      };
    }

    // Format matches as Bluebook citations if available
    const bluebookCitations = quote.matches_found
      ?.map((m) => formatBluebookCitation(m))
      .join("; ");

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              quote_id: quote.quote_id,
              ecf: quote.ecf_number,
              page: quote.page,
              full_text: quote.full_text,
              author: quote.source_attribution?.author,
              matches_scanned: quote.matches_scanned || [],
              bluebook_citations: bluebookCitations || "Not scanned yet",
              matches_found: quote.matches_found || [],
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};
