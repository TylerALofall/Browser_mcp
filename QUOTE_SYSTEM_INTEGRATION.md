# Quote System + Scoreboard Integration

## Tyler's "Can't Go Wrong" Legal Brief Builder

This system combines **exact quote validation** with **AI model racing** to build appellate briefs that are both high-quality AND factually perfect.

---

## 🎯 The Big Picture

**Quote System** (10 MCP tools) → Loads Tyler's case quotes, searches by first 3 words, validates character-by-character

**Scoreboard System** (7 MCP tools) → GPT-5, Claude x2, Gemini race to build brief sections

**Integration** → Models use quote tools to build briefs, then get scored on quality + exactness

---

## 📦 Available MCP Tools

### Quote Storage Tools (4)
1. **quote_import_json** - Import Tyler's 60 JSON files
2. **quote_load_by_ecf** - Load all quotes from specific ECF (e.g., ECF 11, ECF 34)
3. **quote_get_stats** - Get database statistics
4. **quote_export_json** - Export quotes for backup

### Quote Search Tools (2)
5. **quote_search** - Type first 3 words → get full quote with citation
6. **quote_build_chain** - Assemble multiple quotes into narrative

### Quote Validation Tools (3)
7. **quote_validate** - Character-by-character exact match (Tyler's final check)
8. **quote_validate_brief** - Validate entire brief section (all quotes)
9. **quote_find_differences** - Detailed diff showing exact character mismatches

### Scoreboard Tools (7)
10. **scoreboard_create_task** - Create task for models to compete on
11. **scoreboard_submit_work** - Model submits completed work
12. **scoreboard_judge_submission** - Judge scores submission on quality
13. **scoreboard_view_scoreboard** - See rankings (who's winning)
14. **scoreboard_view_submission** - View specific submission details
15. **scoreboard_list_tasks** - List all available tasks
16. **scoreboard_reset_scoreboard** - Reset for new competition

---

## 🏁 Model Racing Workflow

### Step 1: Tyler Sets Up the Race

```javascript
// 1. Import case quotes (Tyler's 60 JSON files)
quote_import_json({
  directory_path: "/path/to/tyler/quotes"
})
// → Returns: "Imported 847 quotes from 60 files"

// 2. Create task for models to compete on
scoreboard_create_task({
  title: "Ninth Circuit Brief - Section IV.A (Standing)",
  description: "Build argument section proving plaintiff has Article III standing. Use quotes from ECF 11 (opposition brief) and ECF 60 (reply). Must cite Lujan v. Defenders standard. Target: 500-750 words.",
  difficulty: "hard",
  max_points: 520
})
// → Returns: task_id: "task-12345"
```

### Step 2: Models Race (GPT-5, Claude x2, Gemini)

Each model uses the quote tools to build their brief section:

```javascript
// Model searches for relevant quotes
quote_search({
  first_three: "Plaintiff here by",
  end_at: "period",
  include_citation: true,
  filter_position: "Positive"
})
// → Returns: "'Plaintiff here by is giving notification...' (ECF 11, p.1)"

// Model builds a quote chain
quote_build_chain({
  quotes: [
    { first_three: "Plaintiff here by", end_at: "period" },
    { first_three: "The Court lacks", end_at: "word", end_word: "III" },
    { first_three: "Defendant's argument fails", end_at: "period" }
  ],
  add_glue: true,
  include_citations: true
})
// → Returns: Assembled narrative with citations

// Model submits work
scoreboard_submit_work({
  model_name: "claude-sonnet-4.5",
  task_id: "task-12345",
  content: "[Complete brief section with quotes and citations]",
  format: "markdown",
  metadata: {
    word_count: 623,
    quotes_used: 8,
    ecfs_cited: ["11", "60"]
  }
})
// → Returns: submission_id: "sub-67890"
```

### Step 3: Tyler (or Auto-Judge) Scores Submissions

```javascript
// Validate quotes FIRST (automatic quality check)
quote_validate_brief({
  brief_section: "[Model's submitted brief text]",
  extract_quotes_automatically: true,
  stop_on_first_error: false
})
// → Returns: { all_valid: true, valid: 8, invalid: 0 }

// Then judge on quality
scoreboard_judge_submission({
  submission_id: "sub-67890",
  judge_id: "tyler",
  scores: {
    accuracy: 98,        // Quotes exact? Citations correct?
    completeness: 95,    // Covered all required points?
    citation_quality: 100, // Proper bluebook format?
    legal_reasoning: 92, // Logical argument structure?
    format_compliance: 97 // Follows court rules?
  },
  bonus_points: 15,      // Tyler awards bonus for exceptional work
  comments: "Excellent use of ECF 11 quotes. Strong Lujan analysis."
})
// → Updates scoreboard with final score: 512/520 points
```

### Step 4: See Who Won

```javascript
scoreboard_view_scoreboard()
// → Returns:
// {
//   "rankings": [
//     {
//       "rank": 1,
//       "model_name": "claude-sonnet-4.5",
//       "total_points": 512,
//       "wins": 1,
//       "avg_accuracy": 98
//     },
//     {
//       "rank": 2,
//       "model_name": "gpt-5",
//       "total_points": 487,
//       "wins": 0,
//       "avg_accuracy": 94
//     },
//     // ... etc
//   ]
// }
```

---

## ⚠️ Tyler's "Can't Go Wrong" Validation System

### Multi-Layer Quality Control

**Layer 1: Quote Search with Fuzzy Matching**
- Models type first 3 words → system finds exact source
- Typo tolerance built in (Levenshtein distance)
- Prevents misquotes from the start

**Layer 2: Auto-Citations**
- Every quote returns with (ECF X, p.Y) citation
- Models can't forget to cite sources
- Bluebook format automatic

**Layer 3: Character-by-Character Validation**
- Before scoring, all quotes validated exactly
- ANY difference = validation fails
- Shows diff with position and context

**Layer 4: Scoreboard Judging**
- Accuracy score (0-100) based on quote exactness
- Citation quality score (0-100) based on format
- Format compliance (0-100) based on court rules

### Example: Catching a Bad Quote

```javascript
// Model submits brief with slight misquote
quote_validate({
  brief_text: "Plaintiff hereby gives notification of his opposition...",
  strict_mode: true,
  show_diff: true
})

// → Returns:
// {
//   "valid": false,
//   "message": "✗ VALIDATION FAILED - Quote does not match source",
//   "differences_found": 2,
//   "diff_display": "
//     --- Difference 1 at position 10 ---
//     Context: '...Plaintiff [HERE]here by is...'
//     Expected: 'h'
//     Actual:   'e'
//
//     --- Difference 2 at position 11 ---
//     Context: '...Plaintiff h[HERE]ere by is...'
//     Expected: 'e'
//     Actual:   'r'
//   ",
//   "source": {
//     "full_text": "Plaintiff here by is giving notification...",
//     "citation": "(ECF 11, p.1)"
//   }
// }
```

**Result**: Model loses points for inaccurate quote. Tyler doesn't file bad brief.

---

## 🚀 Quick Start for Tyler

### 1. Load Your Quotes

```bash
# Put your 60 JSON files in: src/data/quotes/
# Format each file like EXAMPLE_ECF11.json:

[
  {
    "ecf": "11",
    "page": "1",
    "line": "5",
    "quoted_point": "Plaintiff here by is giving notification...",
    "matter_of": "Fact",
    "cited": "ECF 11 Plaintiff Opposition Brief",
    "position": "Positive"
  },
  // ... more quotes
]
```

```javascript
// Then import them all:
quote_import_json({
  directory_path: "/home/user/Browser_mcp/src/data/quotes"
})
```

### 2. Test the Search

```javascript
quote_search({
  first_three: "Plaintiff here by",
  end_at: "period",
  include_citation: true
})
```

### 3. Create Your First Race

```javascript
scoreboard_create_task({
  title: "Draft Statement of Facts - Paragraph 1-5",
  description: "Use quotes from ECF 8, 11, and 34. Establish jurisdiction and standing facts. 250 words max.",
  difficulty: "medium",
  max_points: 300
})
```

### 4. Let Models Race

Each model (GPT-5, Claude x2, Gemini) independently:
1. Searches quotes using `quote_search`
2. Builds narrative using `quote_build_chain`
3. Submits using `scoreboard_submit_work`

### 5. Validate & Judge

```javascript
// Auto-validate all quotes
quote_validate_brief({ brief_section: "[model's work]" })

// Score the quality
scoreboard_judge_submission({
  submission_id: "...",
  judge_id: "tyler",
  scores: { accuracy: 100, completeness: 95, ... }
})
```

### 6. See Winner

```javascript
scoreboard_view_scoreboard()
```

Best model's work becomes your brief section. Filed with confidence because quotes are EXACT.

---

## 🎓 Advanced: Template Integration

Tyler mentioned building "scripts and placeholders that get called into templates". Here's how:

### Template Structure

```markdown
<!-- brief-template-section-4a.md -->

## IV.A Standing Under Article III

<!-- QUOTE_PLACEHOLDER: standing_notification -->
<!-- AUTO_INSERT: quote_search({ first_three: "Plaintiff here by", end_at: "period" }) -->

The plaintiff has demonstrated all three elements of Article III standing:

1. **Injury in Fact**: <!-- QUOTE_PLACEHOLDER: injury_fact -->
2. **Causation**: <!-- QUOTE_PLACEHOLDER: causation -->
3. **Redressability**: <!-- QUOTE_PLACEHOLDER: redress -->

<!-- QUOTE_CHAIN: standing_argument -->
<!-- AUTO_INSERT: quote_build_chain({ quotes: [...], add_glue: true }) -->

Therefore, the Court has jurisdiction to hear this matter.

<!-- VALIDATION_REQUIRED: ALL_QUOTES -->
```

### Script to Fill Template

```javascript
// fill-template.js
async function fillBriefTemplate(templatePath, outputPath) {
  let template = await readFile(templatePath);

  // Find all QUOTE_PLACEHOLDER markers
  const placeholders = extractPlaceholders(template);

  // For each placeholder, let models race
  for (const ph of placeholders) {
    const task = await createTask(ph.description);
    const submissions = await runModelRace(task);
    const winner = await judgeAndSelectWinner(submissions);

    // Validate winner's quotes
    const validation = await validateBrief(winner.content);
    if (!validation.all_valid) {
      throw new Error(`Validation failed for ${ph.name}`);
    }

    // Insert into template
    template = template.replace(ph.marker, winner.content);
  }

  // Final validation of entire brief
  const finalCheck = await validateBrief(template);
  if (!finalCheck.all_valid) {
    throw new Error("Final validation failed - DO NOT FILE");
  }

  await writeFile(outputPath, template);
  console.log("✓ Brief section completed and validated");
}
```

This way:
- Templates define structure
- Models race to fill sections
- Quotes auto-validated
- Tyler gets perfect brief

---

## 🔒 Why This Works for Federal Court

1. **Exact Quotes**: Character-by-character validation means zero misquotes
2. **Proper Citations**: Auto-format (ECF X, p.Y) prevents citation errors
3. **Quality Competition**: Multiple models = best argument wins
4. **Court Rules**: Scoring includes format_compliance for local rules
5. **Traceable**: Every quote links back to source ECF with page/line

Tyler can file with confidence. The quotes are EXACT. The argument is QUALITY. The format is COMPLIANT.

---

## 📊 JSON Quote File Format

Place your quote JSON files in: `/home/user/Browser_mcp/src/data/quotes/`

**Required fields:**
- `ecf` - Document number (string)
- `page` - Page number (string)
- `line` - Line number (string, use "n/a" if unknown)
- `quoted_point` - The actual quote text (string)

**Optional fields:**
- `matter_of` - "Fact" or "Law"
- `cited` - Source citation
- `position` - "Positive" (Tyler), "Negative" (Opposition/Court), or "Indifferent"

**Example:**
```json
[
  {
    "ecf": "11",
    "page": "1",
    "line": "5",
    "quoted_point": "Plaintiff here by is giving notification of his opposition to the defendant's motion to dismiss.",
    "matter_of": "Fact",
    "cited": "ECF 11 Plaintiff Opposition Brief",
    "position": "Positive"
  }
]
```

See `EXAMPLE_ECF11.json` for full example.

---

## 🏆 Model Racing Best Practices

1. **Clear Task Descriptions**: Specify ECFs to use, word count, required points
2. **Fair Judging**: Use same criteria for all models (accuracy, completeness, etc.)
3. **Bonus Points**: Award 0-20 bonus for exceptional legal reasoning
4. **Multiple Rounds**: Run several tasks, best overall model wins
5. **Validate First**: Always run `quote_validate_brief` before judging
6. **Learn from Winners**: Study high-scoring submissions to improve templates

---

## 🎯 Next Steps

1. **Load your 60 JSON files** into `src/data/quotes/`
2. **Run `quote_import_json`** to build the database
3. **Test with `quote_search`** using your actual case quotes
4. **Create first task** with `scoreboard_create_task`
5. **Let models race** and see who builds the best brief section
6. **Validate everything** before filing

You now have 17 MCP tools to build federal appellate briefs that can't go wrong.

**The big models (GPT-5, Claude, Gemini) race on quality.**
**The quote system ensures exactness.**
**Tyler files with confidence.**

🎯 Let's win this appeal.
