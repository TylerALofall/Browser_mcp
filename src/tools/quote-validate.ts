import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "./tool";
import { findQuotesByFirstThree, getAllQuotes, type Quote } from "./quote-storage";

// =============================================================================
// QUOTE VALIDATOR - Character-by-Character Exact Match
// Tyler's "Can't Go Wrong" System - Final validation before filing briefs
// =============================================================================

interface ValidationResult {
  valid: boolean;
  source_quote?: Quote;
  diff?: DiffResult[];
  error?: string;
}

interface DiffResult {
  position: number;
  expected: string;
  actual: string;
  context_before: string;
  context_after: string;
}

/**
 * Character-by-character comparison
 * Returns array of differences with context
 */
function compareCharByChar(briefText: string, sourceText: string): DiffResult[] {
  const diffs: DiffResult[] = [];
  const maxLen = Math.max(briefText.length, sourceText.length);

  for (let i = 0; i < maxLen; i++) {
    const briefChar = briefText[i] || "[END]";
    const sourceChar = sourceText[i] || "[END]";

    if (briefChar !== sourceChar) {
      // Get context (10 chars before and after)
      const contextStart = Math.max(0, i - 10);
      const contextEnd = Math.min(maxLen, i + 11);

      diffs.push({
        position: i,
        expected: sourceChar,
        actual: briefChar,
        context_before: sourceText.substring(contextStart, i),
        context_after: sourceText.substring(i + 1, contextEnd),
      });
    }
  }

  return diffs;
}

/**
 * Strip common quote formatting differences (smart quotes, etc)
 * But PRESERVE the actual content exactly
 */
function normalizeQuoteFormatting(text: string): string {
  return text
    .replace(/['']/g, "'") // Smart quotes to regular quotes
    .replace(/[""]/g, '"') // Smart double quotes
    .replace(/\u00A0/g, " ") // Non-breaking space to regular space
    .trim();
}

/**
 * Find source quote by first 3 words from brief text
 */
function findSourceQuote(briefText: string): Quote | null {
  const normalized = normalizeQuoteFormatting(briefText);
  const words = normalized.split(/\s+/);

  if (words.length < 3) {
    return null;
  }

  const firstThree = words.slice(0, 3).join(" ");
  const candidates = findQuotesByFirstThree(firstThree);

  if (candidates.length === 0) {
    return null;
  }

  // If multiple matches, try to find exact match
  if (candidates.length > 1) {
    for (const candidate of candidates) {
      const sourceNormalized = normalizeQuoteFormatting(candidate.full_text);
      if (normalized === sourceNormalized) {
        return candidate;
      }
    }
    // Return first match if no exact match
    return candidates[0];
  }

  return candidates[0];
}

/**
 * Generate diff display for user
 */
function generateDiffDisplay(diffs: DiffResult[]): string {
  let display = "";

  diffs.forEach((diff, index) => {
    display += `\n\n--- Difference ${index + 1} at position ${diff.position} ---\n`;
    display += `Context: "...${diff.context_before}[HERE]${diff.context_after}..."\n`;
    display += `Expected: '${diff.expected}'\n`;
    display += `Actual:   '${diff.actual}'\n`;
  });

  return display;
}

// =============================================================================
// MCP TOOLS
// =============================================================================

// 1. VALIDATE SINGLE QUOTE (Main validation tool)
const ValidateQuoteSchema = z.object({
  brief_text: z
    .string()
    .describe("The quote text from the brief to validate"),
  strict_mode: z
    .boolean()
    .default(true)
    .describe("Strict mode: no formatting normalization, exact character match only"),
  show_diff: z
    .boolean()
    .default(true)
    .describe("Show detailed diff if validation fails"),
  auto_fix_formatting: z
    .boolean()
    .default(false)
    .describe("Suggest auto-fix for formatting differences (quotes, spaces)"),
});

export const validateQuote: Tool = {
  schema: {
    name: "quote_validate",
    description:
      "Validate brief quote against source database - CHARACTER-BY-CHARACTER exact match. Tyler's 'Can't Go Wrong' final check.",
    inputSchema: zodToJsonSchema(ValidateQuoteSchema),
  },
  handle: async (_context, params) => {
    const { brief_text, strict_mode, show_diff, auto_fix_formatting } =
      ValidateQuoteSchema.parse(params);

    // Find source quote
    const sourceQuote = findSourceQuote(brief_text);

    if (!sourceQuote) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                valid: false,
                error: "Source quote not found in database",
                brief_text: brief_text.substring(0, 100) + "...",
                suggestion: "Check first 3 words or verify quote is in database",
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // Prepare texts for comparison
    const briefTextToCompare = strict_mode
      ? brief_text
      : normalizeQuoteFormatting(brief_text);
    const sourceTextToCompare = strict_mode
      ? sourceQuote.full_text
      : normalizeQuoteFormatting(sourceQuote.full_text);

    // Character-by-character comparison
    const diffs = compareCharByChar(briefTextToCompare, sourceTextToCompare);

    if (diffs.length === 0) {
      // PERFECT MATCH
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                valid: true,
                message: "✓ EXACT MATCH - Quote is valid for filing",
                source: {
                  ecf: sourceQuote.ecf_number,
                  page: sourceQuote.page,
                  line: sourceQuote.line,
                  citation: `(ECF ${sourceQuote.ecf_number}, p.${sourceQuote.page})`,
                },
                quote_length: brief_text.length,
                strict_mode,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // VALIDATION FAILED - Generate diff
    const diffDisplay = show_diff ? generateDiffDisplay(diffs) : "";

    const result: any = {
      valid: false,
      message: "✗ VALIDATION FAILED - Quote does not match source",
      differences_found: diffs.length,
      source: {
        ecf: sourceQuote.ecf_number,
        page: sourceQuote.page,
        citation: `(ECF ${sourceQuote.ecf_number}, p.${sourceQuote.page})`,
        full_text: sourceQuote.full_text,
      },
      brief_text,
      strict_mode,
    };

    if (show_diff) {
      result.diff_display = diffDisplay;
      result.differences = diffs;
    }

    // Auto-fix suggestion (if enabled)
    if (auto_fix_formatting && !strict_mode) {
      result.suggested_fix = normalizeQuoteFormatting(sourceQuote.full_text);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
};

// 2. VALIDATE ENTIRE BRIEF SECTION (Batch validation)
const ValidateBriefSchema = z.object({
  brief_section: z
    .string()
    .describe("Entire brief section with multiple quotes to validate"),
  extract_quotes_automatically: z
    .boolean()
    .default(true)
    .describe("Auto-extract quotes (text in single quotes) for validation"),
  stop_on_first_error: z
    .boolean()
    .default(false)
    .describe("Stop validation on first error or check all quotes"),
});

export const validateBrief: Tool = {
  schema: {
    name: "quote_validate_brief",
    description:
      "Validate all quotes in a brief section - final check before filing",
    inputSchema: zodToJsonSchema(ValidateBriefSchema),
  },
  handle: async (_context, params) => {
    const { brief_section, extract_quotes_automatically, stop_on_first_error } =
      ValidateBriefSchema.parse(params);

    let quotesToValidate: string[] = [];

    if (extract_quotes_automatically) {
      // Extract text between single quotes
      const quoteRegex = /'([^']+)'/g;
      let match;
      while ((match = quoteRegex.exec(brief_section)) !== null) {
        quotesToValidate.push(match[1]);
      }
    } else {
      quotesToValidate = [brief_section];
    }

    const results: Array<{
      quote_number: number;
      quote_preview: string;
      valid: boolean;
      source?: string;
      error?: string;
    }> = [];

    let validCount = 0;
    let invalidCount = 0;

    for (let i = 0; i < quotesToValidate.length; i++) {
      const quoteText = quotesToValidate[i];
      const sourceQuote = findSourceQuote(quoteText);

      if (!sourceQuote) {
        invalidCount++;
        results.push({
          quote_number: i + 1,
          quote_preview: quoteText.substring(0, 50) + "...",
          valid: false,
          error: "Source not found in database",
        });

        if (stop_on_first_error) break;
        continue;
      }

      const briefNorm = normalizeQuoteFormatting(quoteText);
      const sourceNorm = normalizeQuoteFormatting(sourceQuote.full_text);
      const diffs = compareCharByChar(briefNorm, sourceNorm);

      if (diffs.length === 0) {
        validCount++;
        results.push({
          quote_number: i + 1,
          quote_preview: quoteText.substring(0, 50) + "...",
          valid: true,
          source: `(ECF ${sourceQuote.ecf_number}, p.${sourceQuote.page})`,
        });
      } else {
        invalidCount++;
        results.push({
          quote_number: i + 1,
          quote_preview: quoteText.substring(0, 50) + "...",
          valid: false,
          error: `${diffs.length} character differences found`,
          source: `(ECF ${sourceQuote.ecf_number}, p.${sourceQuote.page})`,
        });

        if (stop_on_first_error) break;
      }
    }

    const allValid = invalidCount === 0;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              all_valid: allValid,
              message: allValid
                ? "✓ ALL QUOTES VALIDATED - Safe to file"
                : "✗ VALIDATION ERRORS - DO NOT FILE",
              total_quotes: quotesToValidate.length,
              valid: validCount,
              invalid: invalidCount,
              results,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

// 3. FIND QUOTE DIFFERENCES (Detailed analysis)
const FindDifferencesSchema = z.object({
  brief_quote: z.string().describe("Quote from brief"),
  source_quote_id: z
    .string()
    .optional()
    .describe("Optional: specific source quote ID to compare against"),
});

export const findDifferences: Tool = {
  schema: {
    name: "quote_find_differences",
    description:
      "Detailed character-by-character analysis showing exact differences",
    inputSchema: zodToJsonSchema(FindDifferencesSchema),
  },
  handle: async (_context, params) => {
    const { brief_quote, source_quote_id } = FindDifferencesSchema.parse(params);

    let sourceQuote: Quote | null = null;

    if (source_quote_id) {
      // Find by ID (would need to add this to storage)
      sourceQuote = findSourceQuote(brief_quote);
    } else {
      sourceQuote = findSourceQuote(brief_quote);
    }

    if (!sourceQuote) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: "Source quote not found",
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    const diffs = compareCharByChar(brief_quote, sourceQuote.full_text);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              total_differences: diffs.length,
              source: {
                ecf: sourceQuote.ecf_number,
                page: sourceQuote.page,
                citation: `(ECF ${sourceQuote.ecf_number}, p.${sourceQuote.page})`,
              },
              brief_length: brief_quote.length,
              source_length: sourceQuote.full_text.length,
              differences: diffs,
              diff_display: generateDiffDisplay(diffs),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};
