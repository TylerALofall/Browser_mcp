# Quote Auto-Complete System
## Tyler's Federal Case Brief Builder

---

## Problem Statement

Tyler needs to build appellate briefs that are **mostly quotes**:
- His quotes (from his filings)
- Their quotes (from their motions/orders)
- Case law quotes (from authorities)
- Minimal narrative glue between quotes

**Current Pain Point**: Finding and copying exact quotes is slow and error-prone.

**Solution**: Type first 3 words → get full quote with ECF citation.

---

## Data Structure (Tyler's 60 JSON Files)

```json
{
  "ecf": "11",                    // ECF document number
  "page": "1",                    // Page number
  "line": "[n/a]",                // Line number (often n/a)
  "quoted_point": "Full text...", // The actual quote
  "matter_of": "Fact",            // Fact, Law, or neither
  "cited": "Exhibit 1",           // Citation/source
  "position": "Positive"          // Positive (Tyler), Negative (opposition/court), Indifferent
}
```

### Key Documents

**Tyler's Filings (Positive)**:
- ECF 8: Declaration
- ECF 11: Response to F&R
- ECF 17: Second Amended Complaint
- LOFALL-*: Post-judgment motions, appeals

**Opposition (Negative)**:
- ECF 34: County Defendants' Motion to Dismiss
- ECF 36: West Linn Defendants' Motion to Dismiss
- ECF 37: DDA Portlock's Motion to Dismiss
- ECF 42, 43, 44: Reply briefs

**Court Orders (Negative)**:
- ECF 9: Findings & Recommendation
- ECF 12: Order adopting F&R
- ECF 60: Final dismissal order

---

## Tool 1: Quote Search & Auto-Complete

### Input Methods

#### Method 1: First 3 Words → Full Quote (Default)
```
Input: "Plaintiff here by is"
Output: 'Plaintiff here by is giving notification that he intends to exercise the option to submit the Amended Complaint within thirty days of July 15th as offered in Finding and Recommendation' (ECF 11, p.1)
```

#### Method 2: First 3 Words → End Word
```
Input: "Plaintiff here by is" END: "exercise"
Output: 'Plaintiff here by is giving notification that he intends to exercise' (ECF 11, p.1)
```

#### Method 3: First 3 Words → Next Symbol
```
Input: "Plaintiff here by is" UNTIL: ","
Output: 'Plaintiff here by is giving notification that he intends to exercise the option to submit the Amended Complaint within thirty days of July 15th as offered in Finding and Recommendation' (ECF 11, p.1)
```

### Features

1. **Fuzzy Matching**: Handles typos in first 3 words
2. **Multiple Matches**: Shows all matches if ambiguous
3. **ECF Attribution**: Always includes (ECF X, p.Y)
4. **Smart Quoting**: Returns in single quotes
5. **Copy to Clipboard**: One-click copy

### Database Schema

```sql
CREATE TABLE quotes (
  quote_id INTEGER PRIMARY KEY,
  ecf_number TEXT NOT NULL,
  page TEXT,
  line TEXT,
  full_text TEXT NOT NULL,
  first_three_words TEXT NOT NULL,  -- Indexed for fast search
  matter_of TEXT,                    -- Fact, Law, or NULL
  cited TEXT,
  position TEXT,                     -- Positive, Negative, Indifferent
  word_count INTEGER,
  created_at TIMESTAMP
);

CREATE INDEX idx_first_three ON quotes(first_three_words);
CREATE INDEX idx_ecf ON quotes(ecf_number);
CREATE INDEX idx_position ON quotes(position);
CREATE INDEX idx_matter ON quotes(matter_of);
```

---

## Tool 2: Exact-Match Validator (Final Step)

### Purpose

Before filing a brief, validate that every quote **exactly matches** the original source.

### Rules

1. **Your quotes (Positive)**: Must match 100% character-for-character
2. **Their quotes (Negative)**: Must match 100% character-for-character
3. **Case law quotes**: Must match published opinion exactly
4. **Exception**: When proving their "fantasy" (false statements), slight variations OK if original is checked

### Validation Process

```
Input: Brief draft with quotes
Output:
✅ Quote 1: EXACT MATCH (ECF 11, p.1)
✅ Quote 2: EXACT MATCH (ECF 34, p.10)
❌ Quote 3: MISMATCH - Found: "was" / Expected: "were" (ECF 37, p.5)
✅ Quote 4: EXACT MATCH (Monell v. Dep't, 436 U.S. at 658)
```

### Implementation

```javascript
function validateQuote(briefQuote, sourceDatabase) {
  // 1. Find source quote by first 3 words
  const sourceQuote = findByFirstThree(briefQuote);

  // 2. Character-by-character comparison
  if (briefQuote.text === sourceQuote.text) {
    return { valid: true, source: sourceQuote.citation };
  }

  // 3. Show diff if mismatch
  return {
    valid: false,
    diff: showCharacterDiff(briefQuote.text, sourceQuote.text),
    source: sourceQuote.citation
  };
}
```

---

## Tool 3: Secure JSON Storage

### Requirements

1. **Protected**: Not publicly accessible
2. **Organized**: By ECF number, position, matter
3. **Searchable**: Fast full-text search
4. **Backed up**: Version controlled

### Storage Location

**Option A: WordPress Plugin** (if we build in WordPress)
```
/wp-content/plugins/ninth-circuit-tools/data/quotes/
├── ecf-008-tyler-declaration.json
├── ecf-011-tyler-response.json
├── ecf-017-tyler-sac.json
├── ecf-034-county-mtd.json
├── ecf-036-city-mtd.json
├── ecf-037-portlock-mtd.json
├── ecf-060-dismissal-order.json
└── metadata.json
```

**Option B: Browser MCP** (if we build in MCP server)
```
/home/user/Browser_mcp/data/quotes/
├── [same structure]
```

**Option C: Both** (sync between them)

### Security

- **WordPress**: Protect directory with .htaccess
- **MCP**: Only accessible via MCP tools (not web)
- **Git**: Add to `.gitignore` (too sensitive to push publicly)

---

## Tool 4: Quote Insertion (Hot Bar Integration)

### Usage

**In WordPress GUI** (floating glass panel):
1. Open "Quote Search" tab
2. Type first 3 words: "Plaintiff here by is"
3. Select ending (period, comma, word)
4. Click "Copy" or "Insert"

**Via MCP Tool** (for models racing):
```json
{
  "tool": "search_quote",
  "params": {
    "first_three": "Plaintiff here by is",
    "end_at": ".",
    "include_citation": true
  }
}
```

**Returns**:
```json
{
  "quote": "Plaintiff here by is giving notification that he intends to exercise the option to submit the Amended Complaint within thirty days of July 15th as offered in Finding and Recommendation",
  "citation": "(ECF 11, p.1)",
  "full_output": "'Plaintiff here by is giving notification that he intends to exercise the option to submit the Amended Complaint within thirty days of July 15th as offered in Finding and Recommendation' (ECF 11, p.1)",
  "metadata": {
    "ecf": "11",
    "page": "1",
    "matter_of": "Fact",
    "position": "Positive",
    "word_count": 32
  }
}
```

---

## Tool 5: Brief Assembly with Quotes

### Workflow

**Step 1: Outline your argument**
```
I. Defendants Committed Fraud on the Court
   A. They consented to state dismissal
   B. Then opposed federal jurisdiction
   C. This is manipulation under Chambers

II. Court Lacked Jurisdiction to Dismiss
   A. AIU is prudential, not jurisdictional
   B. Parallel case didn't exist
   C. Dismissal violated Quackenbush
```

**Step 2: Insert quotes**
```
I. Defendants Committed Fraud on the Court

   A. They consented to state dismissal

   [QUOTE: "On February 13"]
   [QUOTE: "the Clackamas County Circuit Court"]
   [QUOTE: "dismissed Plaintiff's claims without prejudice"]

   B. Then opposed federal jurisdiction

   [QUOTE: "Plaintiff elected to proceed"]
   [QUOTE: "should be bound by his choice"]
```

**Step 3: Auto-fill quotes**
```
Tool: fill_quote_placeholders
Input: Brief draft with [QUOTE: "first three words"]
Output: Brief with full quotes + citations
```

**Step 4: Validate**
```
Tool: validate_all_quotes
Input: Completed brief
Output: ✅ All 47 quotes validated | ❌ 2 mismatches found
```

---

## MCP Tools (For Scoreboard / Model Racing)

### Tool 1: `quote_search`

```typescript
{
  name: "quote_search",
  description: "Search Tyler's case quotes by first 3 words, return full quote with citation",
  params: {
    first_three: string,       // First 3 words of quote
    end_at: "." | "word",      // Stop at period or specific word
    end_word?: string,         // If end_at=word, specify word
    include_citation: boolean, // Include (ECF X, p.Y)?
    filter_ecf?: string,       // Optional: only search specific ECF
    filter_position?: "Positive" | "Negative" | "Indifferent"
  }
}
```

### Tool 2: `validate_quote`

```typescript
{
  name: "validate_quote",
  description: "Validate that a quote exactly matches the source document",
  params: {
    quote_text: string,        // The quote to validate
    expected_ecf?: string,     // Expected ECF (optional, for faster search)
    strict: boolean            // Require exact match (true) or allow minor diffs (false)
  }
}
```

### Tool 3: `load_quotes_by_ecf`

```typescript
{
  name: "load_quotes_by_ecf",
  description: "Load all quotes from a specific ECF document",
  params: {
    ecf_number: string,        // e.g., "11", "34", "60"
    filter_matter?: "Fact" | "Law",
    filter_position?: "Positive" | "Negative"
  }
}
```

### Tool 4: `build_quote_chain`

```typescript
{
  name: "build_quote_chain",
  description: "Build a narrative from multiple quotes (Fact + Law + Fact pattern)",
  params: {
    quotes: [
      { first_three: "Plaintiff here by is" },
      { first_three: "The Ninth Circuit has" },
      { first_three: "On February 13" }
    ],
    add_glue: boolean          // Add minimal narrative between quotes?
  }
}
```

---

## Integration with Scoreboard

### Race Task: "Build a Brief Section"

**Task**: Build Section II.A of Tyler's appellate brief using quotes only.

**Models Compete**:
1. Claude searches quotes: `quote_search("Plaintiff elected")`
2. GPT-5 searches quotes: `quote_search("Plaintiff elected")`
3. Both build sections with quotes + minimal glue
4. Submit to scoreboard

**Judge Scores**:
- **Accuracy** (0-100): Are quotes exact? Citations correct?
- **Completeness** (0-100): All required points covered?
- **Citation Quality** (0-100): Every quote has (ECF X, p.Y)?
- **Legal Reasoning** (0-100): Quotes form 1+1=2 chain?
- **Format Compliance** (0-100): Single quotes, proper Bluebook format?

**Winner**: Most points = builds next section.

---

## File Structure

```
Browser_mcp/
├── src/
│   ├── tools/
│   │   ├── scoreboard.ts      # Already built
│   │   ├── quote-search.ts    # NEW - Quote search tool
│   │   ├── quote-validate.ts  # NEW - Validator tool
│   │   └── quote-storage.ts   # NEW - JSON storage handler
│   └── data/
│       └── quotes/
│           ├── ecf-*.json     # Tyler's 60 files
│           └── index.json     # Fast lookup index
├── SCOREBOARD_GUIDE.md        # Already built
└── QUOTE_SYSTEM_GUIDE.md      # NEW - This guide
```

---

## Tyler's 60 JSON Files - Import Process

### Step 1: Bulk Import

```typescript
Tool: import_quote_json_files
Input: Directory with 60 JSON files
Process:
  1. Read each JSON file
  2. Extract: ecf, page, line, quoted_point, matter_of, cited, position
  3. Generate first_three_words for each quote
  4. Insert into SQLite database
  5. Build search index
Output: "Imported 847 quotes from 60 files"
```

### Step 2: Index Build

```sql
-- Fast lookups
CREATE INDEX idx_first_three ON quotes(first_three_words);
CREATE INDEX idx_full_text ON quotes USING GIN (to_tsvector('english', full_text));
```

### Step 3: Validation

```
Run: validate_import()
Check:
  ✅ All ECF numbers present (8, 9, 11, 12, 17, 34, 36, 37, 42, 43, 44, 60, LOFALL-*)
  ✅ No duplicate quotes
  ✅ All first_three_words populated
  ✅ All citations present
```

---

## The "Can't Go Wrong" System

Tyler said: *"I want it so it's impossible to do the wrong moves."*

### Error-Proof Layers

**Layer 1: Quote Search**
- ✅ Fuzzy match handles typos
- ✅ Shows all matches if ambiguous
- ✅ Can't misattribute ECF (pulled from database)

**Layer 2: Quote Insertion**
- ✅ Always includes citation
- ✅ Always uses single quotes
- ✅ Always ends at period (or specified word)

**Layer 3: Exact Validation**
- ✅ Compares character-by-character before filing
- ✅ Flags any mismatch
- ✅ Won't let you file if quotes don't match

**Layer 4: Appellate Rules Check** (Future)
- ✅ Check citation format (Bluebook)
- ✅ Check quote length (block quote if >50 words?)
- ✅ Check ellipses usage ([...] for omissions)

### Result

Tyler types 3 words → System returns exact quote with citation → Tyler copies → Final validator confirms → File brief.

**No manual typing of quotes. No citation errors. No misquotes.**

---

## Next Steps

1. **Import Tyler's 60 JSON files** → Build database
2. **Build quote_search tool** → Test with "Plaintiff here by is"
3. **Build validator** → Test with brief excerpt
4. **Integrate with scoreboard** → Models race to build sections
5. **Test end-to-end** → Tyler builds a brief section using only quote search

---

## Questions for Tyler

1. **Where do you want this built?**
   - Browser MCP (MCP tools for models)?
   - WordPress plugin (GUI for you)?
   - Both (sync between them)?

2. **Do you have the 60 JSON files ready to share?**
   - Can you paste a few more complete files?
   - Or give me a path to load them?

3. **What's the priority?**
   - Quote search first (so you can use it now)?
   - Validator first (so you can check existing briefs)?
   - Storage first (so we protect the data)?

4. **Integration with "the other one"?**
   - You mentioned storage needs to fit with "the other one" - what's that?
   - Is it the WordPress plugin your other instance built?

---

**READY TO BUILD. Tell me where to start.**
