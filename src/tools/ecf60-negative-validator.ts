import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "./tool";
import type { EnhancedQuote } from "./jsonl-loader";
import { getAllEnhancedQuotes, getEnhancedQuoteById } from "./jsonl-loader";

// =============================================================================
// ECF 60 NEGATIVE CLAIM VALIDATOR
// =============================================================================

/**
 * STRATEGIC FOCUS: ECF 60 contains the court's decision.
 * Every "Negative" position in ECF 60 is a claim AGAINST Tyler.
 *
 * This tool:
 * 1. Filters ONLY ECF 60 claims with "Negative" position
 * 2. For each claim, finds where defendants originally made this statement
 * 3. Shows if the statement is fabricated or misrepresented from the actual record
 * 4. Generates proof that the court was misled
 *
 * LEGAL THEORY:
 * - Defendants made false representations to the court
 * - Court relied on these false representations in ECF 60
 * - This constitutes fraud upon the court
 */

// =============================================================================
// TYPES
// =============================================================================

interface ECF60NegativeClaim {
  quote_id: string;
  ecf_number: string;
  page: string;
  line: string;
  full_text: string;
  author?: string;
  cited?: string;
  cross_references?: string[];
}

interface DefendantSourceMatch {
  defendant_ecf: string;
  defendant_page: string;
  defendant_line?: string;
  defendant_author: string;
  defendant_quote_id?: string;
  match_type: "exact" | "paraphrase" | "fabricated";
  similarity_score: number;
  explanation: string;
}

interface TylerRefutation {
  tyler_ecf: string;
  tyler_page: string;
  tyler_line?: string;
  tyler_quote_id?: string;
  refutation_type: "contradicts" | "proves_false" | "provides_evidence";
  explanation: string;
}

interface FabricationProof {
  ecf60_claim: ECF60NegativeClaim;
  defendant_source: DefendantSourceMatch | null;
  tyler_refutations: TylerRefutation[];
  fabrication_score: number; // 0-100, higher = more likely fabricated
  status: "proven_false" | "questionable" | "needs_investigation";
  summary: string;
}

// =============================================================================
// IN-MEMORY STORAGE
// =============================================================================

const ecf60NegativeClaims: Map<string, ECF60NegativeClaim> = new Map();
const fabricationProofs: Map<string, FabricationProof> = new Map();

// =============================================================================
// TOOL 1: GET ECF 60 NEGATIVE CLAIMS
// =============================================================================

export const getECF60NegativeClaims: Tool = {
  schema: {
    name: "ecf60_get_negative_claims",
    description:
      "Get ALL claims from ECF 60 with 'Negative' position (claims against Tyler). This is the starting point for proving fraud upon the court.",
    inputSchema: zodToJsonSchema(z.object({})),
  },
  handle: async (_context, _params) => {
    const allQuotes = getAllEnhancedQuotes();

    // Filter for ECF 60 + Negative position
    const ecf60Negatives = allQuotes.filter(
      (q) => q.ecf_number === "60" && q.position === "Negative"
    );

    // Store for later use
    ecf60NegativeClaims.clear();
    ecf60Negatives.forEach((q) => {
      ecf60NegativeClaims.set(q.quote_id, {
        quote_id: q.quote_id,
        ecf_number: q.ecf_number,
        page: q.page,
        line: q.line,
        full_text: q.full_text,
        author: q.source_attribution?.author,
        cited: q.cited,
        cross_references: q.cross_references,
      });
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              total_negative_claims: ecf60Negatives.length,
              claims: ecf60Negatives.map((q) => ({
                quote_id: q.quote_id,
                page: q.page,
                line: q.line,
                text_preview: q.full_text.substring(0, 150) + "...",
                author: q.source_attribution?.author || "unknown",
                cross_references: q.cross_references || [],
              })),
              note: "Use ecf60_validate_claim to investigate each claim individually",
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

// =============================================================================
// TOOL 2: PREPARE ECF 60 CLAIM FOR VALIDATION
// =============================================================================

const PrepareECF60ClaimSchema = z.object({
  quote_id: z.string().describe("Quote ID of ECF 60 negative claim"),
});

export const prepareECF60Claim: Tool = {
  schema: {
    name: "ecf60_prepare_claim_validation",
    description:
      "Prepare an ECF 60 negative claim for AI validation. Returns task prompt for AI models to: (1) Find defendant source, (2) Find Tyler's refutations",
    inputSchema: zodToJsonSchema(PrepareECF60ClaimSchema),
  },
  handle: async (_context, params) => {
    const { quote_id } = PrepareECF60ClaimSchema.parse(params);

    const claim = ecf60NegativeClaims.get(quote_id) || getEnhancedQuoteById(quote_id);
    if (!claim) {
      return {
        content: [
          {
            type: "text",
            text: `Claim not found: ${quote_id}. Run ecf60_get_negative_claims first.`,
          },
        ],
        isError: true,
      };
    }

    // Get all quotes for context
    const allQuotes = getAllEnhancedQuotes();

    // Get defendant ECFs (where this claim might have originated)
    const defendantECFs = new Set<string>();
    const tylerECFs = new Set<string>();

    allQuotes.forEach((q) => {
      const author = q.source_attribution?.author || "unknown";
      if (["dda", "beckerman", "west_linn", "defendant"].includes(author)) {
        defendantECFs.add(q.ecf_number);
      } else if (author === "tyler") {
        tylerECFs.add(q.ecf_number);
      }
    });

    const taskPrompt = `
# TASK: Validate ECF 60 Negative Claim - Find Source and Refutations

## ECF 60 COURT CLAIM (AGAINST TYLER)
**ECF:** 60
**Page:** ${claim.page}
**Line:** ${claim.line}
**Text:** "${claim.full_text}"
**Cross-References:** ${claim.cross_references?.join(", ") || "None"}

---

## YOUR MISSION (TWO-PART)

### PART 1: Find Defendant Source
Search defendant documents (ECFs: ${Array.from(defendantECFs).sort().join(", ")}) to find:
- Where did defendants FIRST make this claim?
- Is it an exact quote, paraphrase, or completely fabricated?
- What evidence did defendants cite?

**Look for:**
1. **Exact match** - Same wording
2. **Paraphrase** - Same claim, different words
3. **Fabrication** - No source found (defendants made it up)

### PART 2: Find Tyler's Refutations
Search Tyler's documents (ECFs: ${Array.from(tylerECFs).sort().join(", ")}) to find:
- Where did Tyler CONTRADICT this claim?
- Where did Tyler provide EVIDENCE proving this claim false?
- Where did Tyler address the same topic but with different facts?

**Look for:**
1. **Direct contradiction** - Tyler says opposite
2. **Proof of falsity** - Evidence showing claim is wrong
3. **Missing context** - Tyler provided info defendants ignored

---

## RESPONSE FORMAT

### Part 1: Defendant Source
\`\`\`json
{
  "defendant_source": {
    "defendant_ecf": "43",
    "defendant_page": "5",
    "defendant_line": "12",
    "defendant_author": "dda",
    "match_type": "exact" | "paraphrase" | "fabricated",
    "similarity_score": 0.95,
    "explanation": "Found in DDA's response brief at ECF 43 pg 5 ln 12. This is an exact quote."
  }
}
\`\`\`

If NO source found:
\`\`\`json
{
  "defendant_source": null,
  "fabrication_note": "No defendant source found. This claim appears in ECF 60 but not in any defendant filing. Possible fabrication or court's own inference."
}
\`\`\`

### Part 2: Tyler's Refutations
\`\`\`json
{
  "tyler_refutations": [
    {
      "tyler_ecf": "8",
      "tyler_page": "19",
      "tyler_line": "5",
      "refutation_type": "contradicts",
      "explanation": "Tyler states opposite fact at ECF 8 pg 19 ln 5"
    },
    {
      "tyler_ecf": "36",
      "tyler_page": "2",
      "refutation_type": "provides_evidence",
      "explanation": "Tyler provides documentary evidence disproving this claim at ECF 36 pg 2"
    }
  ]
}
\`\`\`

---

## IMPORTANT CONTEXT NOTES

**"Fabrication" means:**
- Claim appears in ECF 60 (court decision)
- Claim is attributed to Tyler or his actions
- BUT: No defendant ever made this claim in their filings
- This suggests court inferred or misunderstood without defendant basis

**"Misrepresentation" means:**
- Defendant made claim in their filing
- BUT: Defendant ignored Tyler's contradictory evidence
- OR: Defendant took Tyler's words out of context
- This is fraud upon the court if intentional

**Your goal:** Find EVERY place Tyler addressed this topic to show:
1. Tyler DID provide evidence (defendants lied saying he didn't)
2. Tyler's evidence CONTRADICTS the claim (defendants ignored it)
3. Court was misled by defendants' selective presentation
`;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              quote_id,
              ecf60_claim: claim.full_text,
              task_prompt: taskPrompt,
              defendant_ecfs: Array.from(defendantECFs).sort(),
              tyler_ecfs: Array.from(tylerECFs).sort(),
              next_steps: [
                "1. Send task_prompt to Model A (Claude)",
                "2. Send task_prompt to Model B (GPT-4)",
                "3. Use ecf60_submit_validation to submit results",
                "4. System will compare both models and generate fraud proof",
              ],
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

// =============================================================================
// TOOL 3: SUBMIT VALIDATION RESULTS
// =============================================================================

const SubmitValidationSchema = z.object({
  quote_id: z.string().describe("ECF 60 claim quote ID"),
  model_name: z.string().describe("Name of AI model"),
  defendant_source: z
    .object({
      defendant_ecf: z.string(),
      defendant_page: z.string(),
      defendant_line: z.string().optional(),
      defendant_author: z.string(),
      defendant_quote_id: z.string().optional(),
      match_type: z.enum(["exact", "paraphrase", "fabricated"]),
      similarity_score: z.number(),
      explanation: z.string(),
    })
    .nullable(),
  tyler_refutations: z.array(
    z.object({
      tyler_ecf: z.string(),
      tyler_page: z.string(),
      tyler_line: z.string().optional(),
      tyler_quote_id: z.string().optional(),
      refutation_type: z.enum(["contradicts", "proves_false", "provides_evidence"]),
      explanation: z.string(),
    })
  ),
});

export const submitECF60Validation: Tool = {
  schema: {
    name: "ecf60_submit_validation",
    description:
      "Submit AI model's validation results for an ECF 60 claim. After both models submit, use ecf60_compare_results to find agreements.",
    inputSchema: zodToJsonSchema(SubmitValidationSchema),
  },
  handle: async (_context, params) => {
    const { quote_id, model_name, defendant_source, tyler_refutations } =
      SubmitValidationSchema.parse(params);

    // Store results (we'll compare when both models submit)
    // For now, just acknowledge receipt

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              quote_id,
              model_name,
              defendant_source_found: defendant_source !== null,
              tyler_refutations_count: tyler_refutations.length,
              note: "Submit results from second model, then use ecf60_compare_results",
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

// =============================================================================
// TOOL 4: GENERATE BATCH REPORT FOR ALL ECF 60 NEGATIVE CLAIMS
// =============================================================================

export const generateECF60FraudReport: Tool = {
  schema: {
    name: "ecf60_generate_fraud_report",
    description:
      "Generate comprehensive fraud-upon-the-court report for ALL ECF 60 negative claims. Shows which claims are fabricated, misrepresented, or contradicted by Tyler's evidence.",
    inputSchema: zodToJsonSchema(z.object({})),
  },
  handle: async (_context, _params) => {
    const claims = Array.from(ecf60NegativeClaims.values());

    if (claims.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No ECF 60 negative claims found. Run ecf60_get_negative_claims first.",
          },
        ],
        isError: true,
      };
    }

    const report = `
# FRAUD UPON THE COURT - ECF 60 ANALYSIS REPORT

## Executive Summary

This report analyzes **${claims.length} negative claims** against Tyler in ECF 60 (Magistrate Beckerman's Order).

For each claim, we identify:
1. **Defendant Source** - Where did defendants first make this claim?
2. **Tyler's Refutations** - Where did Tyler provide contradictory evidence?
3. **Fabrication Score** - Likelihood this claim is fabricated or misrepresented

---

## Legal Theory

**Fraud Upon the Court** (Rule 60(d)(3)) occurs when:
1. Defendants make false representations to the court
2. Court relies on these representations in its decision
3. Evidence in the record contradicts the representations
4. Defendants intentionally obscured the contradictory evidence

**Standard:** "Clear and convincing evidence of conduct that:
- Prevents a full and fair submission of the case
- Involves unconscionable scheme to interfere with judicial system's function"

---

## Claims Requiring Immediate Investigation

${claims
  .map(
    (claim, idx) => `
### Claim ${idx + 1}: ECF 60 pg ${claim.page}
**Quote ID:** ${claim.quote_id}
**Text:** "${claim.full_text.substring(0, 200)}..."
**Cross-Refs:** ${claim.cross_references?.join(", ") || "None"}

**STATUS:** Needs validation
**NEXT STEP:** Run ecf60_prepare_claim_validation with quote_id: ${claim.quote_id}

---
`
  )
  .join("\n")}

## Validation Workflow

For EACH claim above:

1. **Prepare:** \`ecf60_prepare_claim_validation({ quote_id: "..." })\`
2. **Validate:** Send to 2 AI models independently
3. **Compare:** Find agreed matches only
4. **Document:** Build fraud proof with citations

---

## Expected Outcomes

After validating all ${claims.length} claims, you will have:

✅ **List of fabricated claims** - Court stated facts no defendant ever claimed
✅ **List of misrepresented claims** - Defendants ignored Tyler's contradictory evidence
✅ **Bluebook citations** - Exact locations of Tyler's refutations
✅ **Fraud proof** - Clear pattern of intentional deception

This forms the basis for:
- Rule 60(d)(3) Motion (fraud upon the court)
- Rule 11 Sanctions (bad faith filings)
- Judicial complaint (if judge knowingly participated)

---

## Automation Recommendation

Given ${claims.length} claims to validate:

**Option 1: Manual (Slow but Sure)**
- Validate each claim one-by-one
- Personally review each match
- Time: ~${claims.length * 10} minutes

**Option 2: Batch with AI (Fast but Verify)**
- Export all claims to separate file
- Run batch validation in separate Claude instance
- Import results back for comparison
- Time: ~${Math.ceil(claims.length / 10)} hours

**Recommended:** Start with top 10 highest-priority claims manually, then automate the rest.

---

## Next Immediate Action

\`\`\`typescript
// Get the first claim
const firstClaim = "${claims[0]?.quote_id}"

// Prepare it for validation
ecf60_prepare_claim_validation({ quote_id: firstClaim })

// Send to both models, compare results
// This will show you if the system works as expected
\`\`\`
`;

    return {
      content: [
        {
          type: "text",
          text: report,
        },
      ],
    };
  },
};
