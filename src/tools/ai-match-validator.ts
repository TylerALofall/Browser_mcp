import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "./tool";
import type { EnhancedQuote } from "./jsonl-loader";
import { getAllEnhancedQuotes, getEnhancedQuoteById } from "./jsonl-loader";
import {
  createTask,
  submitWork,
  judgeSubmission,
  viewScoreboard,
} from "./scoreboard";

// =============================================================================
// AI-POWERED MATCH VALIDATION SYSTEM
// =============================================================================

/**
 * This system uses multiple AI models to find and validate quote matches
 * across documents. Only matches that BOTH models agree on are counted.
 *
 * Workflow:
 * 1. Load PDF documents and verify quotes
 * 2. Two models independently search for matches
 * 3. Validate that both models found the same matches
 * 4. Check context (positive vs negative framing)
 * 5. Score results and track in scoreboard
 */

// =============================================================================
// TYPES
// =============================================================================

interface MatchCandidate {
  source_quote_id: string;
  target_quote_id: string;
  target_ecf: string;
  target_page: string;
  target_paragraph?: string;
  target_line?: string;
  similarity_score: number;
  context_match: "positive" | "negative" | "neutral";
  explanation: string;
}

interface ModelMatchResult {
  model_name: string;
  quote_id: string;
  matches: MatchCandidate[];
  processing_time_ms: number;
  total_documents_scanned: number;
}

interface ValidationResult {
  quote_id: string;
  model_a_name: string;
  model_b_name: string;
  agreed_matches: MatchCandidate[];
  model_a_only: MatchCandidate[];
  model_b_only: MatchCandidate[];
  agreement_rate: number;
  bluebook_citations: string;
}

// =============================================================================
// IN-MEMORY STORAGE
// =============================================================================

const matchValidationResults: Map<string, ValidationResult> = new Map();
const modelMatchResults: Map<string, ModelMatchResult[]> = new Map(); // quote_id -> [model results]

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format Bluebook citation
 */
function formatCitation(match: MatchCandidate): string {
  let citation = `ECF ${match.target_ecf}`;
  if (match.target_page && match.target_page !== "n/a") {
    citation += ` pg ${match.target_page}`;
  }
  if (match.target_paragraph && match.target_paragraph !== "n/a") {
    citation += ` ¶ ${match.target_paragraph}`;
  } else if (match.target_line && match.target_line !== "n/a" && match.target_line !== "[n/a]") {
    citation += ` ln ${match.target_line}`;
  }
  return citation;
}

/**
 * Compare two match candidates to see if they're the same
 */
function matchesAreSame(a: MatchCandidate, b: MatchCandidate): boolean {
  return (
    a.target_quote_id === b.target_quote_id ||
    (a.target_ecf === b.target_ecf &&
      a.target_page === b.target_page &&
      (a.target_paragraph === b.target_paragraph || a.target_line === b.target_line))
  );
}

/**
 * Find matches that both models agreed on
 */
function findAgreedMatches(
  modelA: MatchCandidate[],
  modelB: MatchCandidate[],
): MatchCandidate[] {
  const agreed: MatchCandidate[] = [];

  for (const matchA of modelA) {
    for (const matchB of modelB) {
      if (matchesAreSame(matchA, matchB)) {
        // Both models found this match - use Model A's version but include both scores
        agreed.push({
          ...matchA,
          explanation: `Model A: ${matchA.explanation}\nModel B: ${matchB.explanation}`,
          similarity_score: (matchA.similarity_score + matchB.similarity_score) / 2,
        });
        break;
      }
    }
  }

  return agreed;
}

/**
 * Validate matches from two models
 */
export function validateModelMatches(
  quoteId: string,
  modelAName: string,
  modelAMatches: MatchCandidate[],
  modelBName: string,
  modelBMatches: MatchCandidate[],
): ValidationResult {
  const agreedMatches = findAgreedMatches(modelAMatches, modelBMatches);

  // Find matches only Model A found
  const modelAOnly = modelAMatches.filter(
    (matchA) => !agreedMatches.some((agreed) => matchesAreSame(matchA, agreed)),
  );

  // Find matches only Model B found
  const modelBOnly = modelBMatches.filter(
    (matchB) => !agreedMatches.some((agreed) => matchesAreSame(matchB, agreed)),
  );

  const totalCandidates = modelAMatches.length + modelBMatches.length;
  const agreementRate =
    totalCandidates > 0 ? (agreedMatches.length * 2) / totalCandidates : 0;

  const bluebookCitations = agreedMatches.map((m) => formatCitation(m)).join("; ");

  const result: ValidationResult = {
    quote_id: quoteId,
    model_a_name: modelAName,
    model_b_name: modelBName,
    agreed_matches: agreedMatches,
    model_a_only: modelAOnly,
    model_b_only: modelBOnly,
    agreement_rate: agreementRate,
    bluebook_citations: bluebookCitations || "No agreed matches",
  };

  matchValidationResults.set(quoteId, result);
  return result;
}

// =============================================================================
// MCP TOOLS
// =============================================================================

// 1. PREPARE QUOTE FOR AI VALIDATION
const PrepareQuoteSchema = z.object({
  quote_id: z.string().describe("Quote ID to prepare for AI model validation"),
});

export const prepareQuoteForAI: Tool = {
  schema: {
    name: "ai_prepare_quote_for_validation",
    description:
      "Prepare a quote for AI model validation. Returns the quote text and list of all other ECF documents to search. This creates the task prompt for AI models.",
    inputSchema: zodToJsonSchema(PrepareQuoteSchema),
  },
  handle: async (_context, params) => {
    const { quote_id } = PrepareQuoteSchema.parse(params);

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

    // Get all unique ECF numbers (excluding source ECF)
    const allQuotes = getAllEnhancedQuotes();
    const targetECFs = new Set<string>();
    allQuotes.forEach((q) => {
      if (q.ecf_number !== quote.ecf_number) {
        targetECFs.add(q.ecf_number);
      }
    });

    const taskPrompt = `
# TASK: Find Matching Quotes

## Source Quote
**ECF:** ${quote.ecf_number}
**Page:** ${quote.page}
**Line:** ${quote.line}
**Author:** ${quote.source_attribution?.author || "unknown"}
**Position:** ${quote.position}
**Text:** "${quote.full_text}"

## Instructions
Search ALL of the following ECF documents for quotes that match or reference the source quote:

**Target ECFs:** ${Array.from(targetECFs).sort().join(", ")}

## What to Look For
1. **Exact or near-exact text matches** (allow for minor formatting differences)
2. **Paraphrases** that convey the same fact or argument
3. **References** to the same event or claim

## IMPORTANT: Context Matters
- "Tyler is a beast" (positive) ≠ "Tyler says he's a beast but court doesn't agree" (negative)
- Mark context_match as:
  - "positive": Supports the source quote's position
  - "negative": Contradicts or dismisses the source quote
  - "neutral": Neither supports nor contradicts

## Response Format
For EACH match you find, provide:
\`\`\`json
{
  "target_quote_id": "ID of matching quote if known",
  "target_ecf": "ECF number",
  "target_page": "page number",
  "target_paragraph": "paragraph if available",
  "target_line": "line number if available",
  "similarity_score": 0.95,
  "context_match": "positive",
  "explanation": "Brief explanation of why this is a match and context"
}
\`\`\`
`;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              quote_id,
              source_ecf: quote.ecf_number,
              source_text: quote.full_text,
              target_ecfs: Array.from(targetECFs).sort(),
              task_prompt: taskPrompt,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

// 2. SUBMIT MODEL MATCHES
const SubmitModelMatchesSchema = z.object({
  quote_id: z.string().describe("Quote ID being validated"),
  model_name: z.string().describe("Name of AI model (e.g., 'claude-3-5-sonnet', 'gpt-4')"),
  matches: z
    .array(
      z.object({
        target_quote_id: z.string().optional(),
        target_ecf: z.string(),
        target_page: z.string(),
        target_paragraph: z.string().optional(),
        target_line: z.string().optional(),
        similarity_score: z.number(),
        context_match: z.enum(["positive", "negative", "neutral"]),
        explanation: z.string(),
      }),
    )
    .describe("List of matches found by the model"),
  processing_time_ms: z.number().describe("Time taken by model to find matches"),
});

export const submitModelMatches: Tool = {
  schema: {
    name: "ai_submit_model_matches",
    description:
      "Submit matches found by an AI model. This stores the model's results for later comparison with other models.",
    inputSchema: zodToJsonSchema(SubmitModelMatchesSchema),
  },
  handle: async (_context, params) => {
    const { quote_id, model_name, matches, processing_time_ms } =
      SubmitModelMatchesSchema.parse(params);

    // Get all quotes to count documents scanned
    const allQuotes = getAllEnhancedQuotes();
    const sourceQuote = getEnhancedQuoteById(quote_id);
    if (!sourceQuote) {
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

    const targetECFs = new Set<string>();
    allQuotes.forEach((q) => {
      if (q.ecf_number !== sourceQuote.ecf_number) {
        targetECFs.add(q.ecf_number);
      }
    });

    const result: ModelMatchResult = {
      model_name,
      quote_id,
      matches: matches.map((m) => ({
        source_quote_id: quote_id,
        target_quote_id: m.target_quote_id || "",
        target_ecf: m.target_ecf,
        target_page: m.target_page,
        target_paragraph: m.target_paragraph,
        target_line: m.target_line,
        similarity_score: m.similarity_score,
        context_match: m.context_match,
        explanation: m.explanation,
      })),
      processing_time_ms,
      total_documents_scanned: targetECFs.size,
    };

    // Store result
    const existing = modelMatchResults.get(quote_id) || [];
    existing.push(result);
    modelMatchResults.set(quote_id, existing);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              quote_id,
              model_name,
              matches_found: matches.length,
              documents_scanned: targetECFs.size,
              note: "Use ai_validate_and_compare to compare with other model results",
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

// 3. VALIDATE AND COMPARE MODEL RESULTS
const ValidateAndCompareSchema = z.object({
  quote_id: z.string().describe("Quote ID to validate"),
  model_a_name: z.string().describe("Name of first model"),
  model_b_name: z.string().describe("Name of second model"),
  create_scoreboard_task: z
    .boolean()
    .optional()
    .describe("If true, creates a scoreboard task for this comparison"),
});

export const validateAndCompare: Tool = {
  schema: {
    name: "ai_validate_and_compare",
    description:
      "Compare results from two AI models and validate matches. Only counts matches that BOTH models agreed on. Optionally creates a scoreboard task to track performance.",
    inputSchema: zodToJsonSchema(ValidateAndCompareSchema),
  },
  handle: async (context, params) => {
    const { quote_id, model_a_name, model_b_name, create_scoreboard_task } =
      ValidateAndCompareSchema.parse(params);

    const results = modelMatchResults.get(quote_id);
    if (!results || results.length < 2) {
      return {
        content: [
          {
            type: "text",
            text: `Need at least 2 model results for quote ${quote_id}. Currently have: ${results?.length || 0}`,
          },
        ],
        isError: true,
      };
    }

    const modelA = results.find((r) => r.model_name === model_a_name);
    const modelB = results.find((r) => r.model_name === model_b_name);

    if (!modelA || !modelB) {
      return {
        content: [
          {
            type: "text",
            text: `Could not find results for both models. Available: ${results.map((r) => r.model_name).join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    const validation = validateModelMatches(
      quote_id,
      model_a_name,
      modelA.matches,
      model_b_name,
      modelB.matches,
    );

    // Optionally create scoreboard task
    if (create_scoreboard_task) {
      const sourceQuote = getEnhancedQuoteById(quote_id);
      const taskDescription = `Find matching quotes for: "${sourceQuote?.full_text.substring(0, 100)}..." from ECF ${sourceQuote?.ecf_number}`;

      await createTask.handle(context, {
        task_name: `Match Validation: ${quote_id.substring(0, 13)}`,
        description: taskDescription,
        test_cases: `Target ECFs: All documents except ECF ${sourceQuote?.ecf_number}`,
      });

      // Submit both model results
      await submitWork.handle(context, {
        task_name: `Match Validation: ${quote_id.substring(0, 13)}`,
        model_name: model_a_name,
        output: JSON.stringify(modelA.matches, null, 2),
      });

      await submitWork.handle(context, {
        task_name: `Match Validation: ${quote_id.substring(0, 13)}`,
        model_name: model_b_name,
        output: JSON.stringify(modelB.matches, null, 2),
      });

      // Judge both submissions based on agreement rate
      const scoreA = validation.agreed_matches.length + validation.model_a_only.length * 0.5;
      const scoreB = validation.agreed_matches.length + validation.model_b_only.length * 0.5;

      await judgeSubmission.handle(context, {
        task_name: `Match Validation: ${quote_id.substring(0, 13)}`,
        model_name: model_a_name,
        score: scoreA,
        feedback: `Agreed matches: ${validation.agreed_matches.length}, Unique to this model: ${validation.model_a_only.length}`,
      });

      await judgeSubmission.handle(context, {
        task_name: `Match Validation: ${quote_id.substring(0, 13)}`,
        model_name: model_b_name,
        score: scoreB,
        feedback: `Agreed matches: ${validation.agreed_matches.length}, Unique to this model: ${validation.model_b_only.length}`,
      });
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              quote_id,
              agreement_rate: `${(validation.agreement_rate * 100).toFixed(1)}%`,
              agreed_matches_count: validation.agreed_matches.length,
              model_a_only_count: validation.model_a_only.length,
              model_b_only_count: validation.model_b_only.length,
              bluebook_citations: validation.bluebook_citations,
              agreed_matches: validation.agreed_matches,
              model_a_only: validation.model_a_only,
              model_b_only: validation.model_b_only,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

// 4. BATCH VALIDATE ALL QUOTES
const BatchValidateSchema = z.object({
  model_a_name: z.string().describe("Name of first model to compare"),
  model_b_name: z.string().describe("Name of second model to compare"),
  min_agreement_threshold: z
    .number()
    .optional()
    .default(0.5)
    .describe("Minimum agreement rate (0-1) to include in results"),
});

export const batchValidateAll: Tool = {
  schema: {
    name: "ai_batch_validate_all",
    description:
      "Validate and compare results from two models for ALL quotes that have been submitted. Generates a comprehensive report.",
    inputSchema: zodToJsonSchema(BatchValidateSchema),
  },
  handle: async (_context, params) => {
    const { model_a_name, model_b_name, min_agreement_threshold } =
      BatchValidateSchema.parse(params);

    const allValidations: ValidationResult[] = [];
    let totalAgreedMatches = 0;
    let totalModelAOnly = 0;
    let totalModelBOnly = 0;

    for (const [quoteId, results] of modelMatchResults.entries()) {
      const modelA = results.find((r) => r.model_name === model_a_name);
      const modelB = results.find((r) => r.model_name === model_b_name);

      if (modelA && modelB) {
        const validation = validateModelMatches(
          quoteId,
          model_a_name,
          modelA.matches,
          model_b_name,
          modelB.matches,
        );

        if (validation.agreement_rate >= min_agreement_threshold) {
          allValidations.push(validation);
          totalAgreedMatches += validation.agreed_matches.length;
          totalModelAOnly += validation.model_a_only.length;
          totalModelBOnly += validation.model_b_only.length;
        }
      }
    }

    const overallAgreementRate =
      totalAgreedMatches + totalModelAOnly + totalModelBOnly > 0
        ? (totalAgreedMatches * 2) /
          (totalAgreedMatches * 2 + totalModelAOnly + totalModelBOnly)
        : 0;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              model_a: model_a_name,
              model_b: model_b_name,
              total_quotes_validated: allValidations.length,
              overall_agreement_rate: `${(overallAgreementRate * 100).toFixed(1)}%`,
              total_agreed_matches: totalAgreedMatches,
              total_model_a_only: totalModelAOnly,
              total_model_b_only: totalModelBOnly,
              validations: allValidations,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

// 5. GET VALIDATION RESULT
const GetValidationSchema = z.object({
  quote_id: z.string().describe("Quote ID to get validation result for"),
});

export const getValidationResult: Tool = {
  schema: {
    name: "ai_get_validation_result",
    description: "Get the validation result for a specific quote (after models have compared)",
    inputSchema: zodToJsonSchema(GetValidationSchema),
  },
  handle: async (_context, params) => {
    const { quote_id } = GetValidationSchema.parse(params);

    const validation = matchValidationResults.get(quote_id);
    if (!validation) {
      return {
        content: [
          {
            type: "text",
            text: `No validation result found for quote: ${quote_id}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(validation, null, 2),
        },
      ],
    };
  },
};
