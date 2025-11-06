import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { Tool } from "./tool";

// =============================================================================
// QUOTE DATA STRUCTURE - Tyler's Federal Case Brief Builder
// =============================================================================

export interface Quote {
  quote_id: string;
  ecf_number: string; // ECF document number
  page: string; // Page number
  line: string; // Line number (often "n/a")
  full_text: string; // The actual quote
  first_three_words: string; // Indexed for fast search (lowercase)
  matter_of: "Fact" | "Law" | null; // Type of quote
  cited: string; // Citation/source
  position: "Positive" | "Negative" | "Indifferent"; // Tyler vs Opposition
  word_count: number;
  created_at: number;
}

// JSON structure from Tyler's files
interface QuoteJSON {
  ecf: string;
  page: string;
  line: string;
  quoted_point: string;
  matter_of?: string;
  cited?: string;
  position?: string;
}

// =============================================================================
// IN-MEMORY STORAGE (Fast lookups for brief building)
// =============================================================================

const quotes: Map<string, Quote> = new Map();
const firstThreeIndex: Map<string, string[]> = new Map(); // first_three -> [quote_ids]
const ecfIndex: Map<string, string[]> = new Map(); // ecf_number -> [quote_ids]

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

function addToIndex(quote: Quote): void {
  // Index by first three words
  const existing = firstThreeIndex.get(quote.first_three_words) || [];
  existing.push(quote.quote_id);
  firstThreeIndex.set(quote.first_three_words, existing);

  // Index by ECF number
  const ecfExisting = ecfIndex.get(quote.ecf_number) || [];
  ecfExisting.push(quote.quote_id);
  ecfIndex.set(quote.ecf_number, ecfExisting);
}

function importQuoteFromJSON(data: QuoteJSON): Quote {
  const quoteId = generateId();
  const fullText = data.quoted_point;
  const firstThree = extractFirstThreeWords(fullText);

  const quote: Quote = {
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
  };

  quotes.set(quoteId, quote);
  addToIndex(quote);

  return quote;
}

// =============================================================================
// EXPORT FUNCTIONS (for other tools to use)
// =============================================================================

export function findQuotesByFirstThree(firstThree: string): Quote[] {
  const normalized = firstThree.toLowerCase().trim();
  const quoteIds = firstThreeIndex.get(normalized) || [];
  return quoteIds.map((id) => quotes.get(id)!).filter(Boolean);
}

export function findQuotesByECF(ecfNumber: string): Quote[] {
  const quoteIds = ecfIndex.get(ecfNumber) || [];
  return quoteIds.map((id) => quotes.get(id)!).filter(Boolean);
}

export function getAllQuotes(): Quote[] {
  return Array.from(quotes.values());
}

export function getQuoteById(quoteId: string): Quote | undefined {
  return quotes.get(quoteId);
}

export function getStorageStats(): {
  total_quotes: number;
  total_ecfs: number;
  by_position: Record<string, number>;
  by_matter: Record<string, number>;
} {
  const allQuotes = getAllQuotes();

  const byPosition: Record<string, number> = {
    Positive: 0,
    Negative: 0,
    Indifferent: 0,
  };

  const byMatter: Record<string, number> = {
    Fact: 0,
    Law: 0,
    Null: 0,
  };

  allQuotes.forEach((q) => {
    byPosition[q.position]++;
    byMatter[q.matter_of || "Null"]++;
  });

  return {
    total_quotes: allQuotes.length,
    total_ecfs: ecfIndex.size,
    by_position: byPosition,
    by_matter: byMatter,
  };
}

// =============================================================================
// MCP TOOLS
// =============================================================================

// 1. IMPORT QUOTES FROM JSON FILES
const ImportQuotesSchema = z.object({
  directory_path: z.string().describe("Path to directory containing JSON quote files"),
});

export const importQuotes: Tool = {
  schema: {
    name: "quote_import_json",
    description: "Import Tyler's case quotes from JSON files into the quote database",
    inputSchema: zodToJsonSchema(ImportQuotesSchema),
  },
  handle: async (_context, params) => {
    const { directory_path } = ImportQuotesSchema.parse(params);

    try {
      const files = await readdir(directory_path);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));

      let importedCount = 0;
      const errors: string[] = [];

      for (const filename of jsonFiles) {
        try {
          const filePath = join(directory_path, filename);
          const content = await readFile(filePath, "utf-8");
          const data = JSON.parse(content);

          // Handle both single quote object and array of quotes
          const quotesArray = Array.isArray(data) ? data : [data];

          for (const quoteData of quotesArray) {
            importQuoteFromJSON(quoteData);
            importedCount++;
          }
        } catch (err) {
          errors.push(`Error in ${filename}: ${err}`);
        }
      }

      const stats = getStorageStats();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                imported: importedCount,
                files_processed: jsonFiles.length,
                errors: errors.length > 0 ? errors : undefined,
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
            text: `Error importing quotes: ${error}`,
          },
        ],
        isError: true,
      };
    }
  },
};

// 2. LOAD QUOTES BY ECF
const LoadByECFSchema = z.object({
  ecf_number: z.string().describe("ECF document number (e.g., '11', '34', '60')"),
  filter_matter: z
    .enum(["Fact", "Law"])
    .optional()
    .describe("Filter by matter type"),
  filter_position: z
    .enum(["Positive", "Negative", "Indifferent"])
    .optional()
    .describe("Filter by position"),
});

export const loadQuotesByECF: Tool = {
  schema: {
    name: "quote_load_by_ecf",
    description: "Load all quotes from a specific ECF document",
    inputSchema: zodToJsonSchema(LoadByECFSchema),
  },
  handle: async (_context, params) => {
    const { ecf_number, filter_matter, filter_position } = LoadByECFSchema.parse(params);

    let results = findQuotesByECF(ecf_number);

    if (filter_matter) {
      results = results.filter((q) => q.matter_of === filter_matter);
    }

    if (filter_position) {
      results = results.filter((q) => q.position === filter_position);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
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

// 3. GET STORAGE STATISTICS
export const getStats: Tool = {
  schema: {
    name: "quote_get_stats",
    description: "Get statistics about the quote database",
    inputSchema: zodToJsonSchema(z.object({})),
  },
  handle: async (_context, _params) => {
    const stats = getStorageStats();

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

// 4. EXPORT QUOTES TO JSON (for backup)
const ExportQuotesSchema = z.object({
  output_path: z.string().describe("Path where to save the exported quotes JSON"),
  ecf_number: z.string().optional().describe("Optional: export only specific ECF"),
});

export const exportQuotes: Tool = {
  schema: {
    name: "quote_export_json",
    description: "Export quotes to JSON file (for backup or sharing)",
    inputSchema: zodToJsonSchema(ExportQuotesSchema),
  },
  handle: async (_context, params) => {
    const { output_path, ecf_number } = ExportQuotesSchema.parse(params);

    try {
      let quotesToExport = ecf_number
        ? findQuotesByECF(ecf_number)
        : getAllQuotes();

      await writeFile(output_path, JSON.stringify(quotesToExport, null, 2));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              exported: quotesToExport.length,
              output_path,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error exporting quotes: ${error}`,
          },
        ],
        isError: true,
      };
    }
  },
};
