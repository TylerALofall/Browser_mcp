# JSONL Loader & Timeline System - Usage Guide

## Overview

This system provides advanced quote management with:
1. **JSONL Format Support** - Streaming import of large datasets
2. **Source Attribution** - Automatic detection of nested quotes (when you're quoting someone else from an exhibit)
3. **Timeline Management** - Chronological event tracking with ECF cross-references
4. **Preview System** - Review data in tables before importing

---

## Quick Start

### 1. Preview Your JSONL File

Before importing, preview to ensure correct format:

```typescript
// Preview first 20 entries as a table
jsonl_preview_table({
  file_path: "/path/to/your/quotes.jsonl",
  max_entries: 20
})
```

**Output:** Markdown table showing:
- Line number
- ECF number
- Page
- Quote start (first 80 chars)
- Author (who is speaking)
- Is nested? (YES if you're quoting someone else)
- Original source
- Date
- Matter of fact/law
- Position
- Cross-references

### 2. Import JSONL Quotes

```typescript
// Import all quotes
jsonl_import_quotes({
  file_path: "/path/to/your/quotes.jsonl",
  preview_only: false
})
```

**Returns:**
```json
{
  "success": true,
  "imported": 1247,
  "total_lines": 1250,
  "stats": {
    "total_quotes": 1247,
    "by_source": {
      "tyler": 900,
      "beckerman": 120,
      "dda": 80,
      "west_linn": 60,
      "exhibit": 87
    },
    "nested_quotes": 247,
    "quotes_with_dates": 1100,
    "quotes_with_cross_refs": 450
  }
}
```

### 3. Create a Timeline

```typescript
// Create master timeline
timeline_create({
  name: "Beckerman ECF 60 Timeline",
  description: "Master timeline with Beckerman's ECF 60 events cross-referenced to ECF 8, 10, 11, 13, 15, 17, 17-1, 17-2, 38, Sur reply, and 59e motion"
})
```

**Returns:** `timeline_id` for use in other operations

### 4. Add Events to Timeline

```typescript
// Manually add an event
timeline_add_event({
  date: "2024-07-15",
  title: "Plaintiff filed Opposition to F&R",
  description: "Plaintiff filed response opposing Magistrate Beckerman's Findings and Recommendations",
  event_type: "filing",
  primary_ecf: "11",
  cross_referenced_ecfs: ["8", "10", "15"],
  importance: "critical"
})
```

**Or import from JSONL:**

```typescript
timeline_import_jsonl({
  file_path: "/path/to/timeline_events.jsonl",
  timeline_id: "your-timeline-id",
  preview_only: false
})
```

---

## JSONL File Format

### Quote Format

Each line is a separate JSON object:

```jsonl
{"ecf": "11", "page": "1", "line": "[n/a]", "quoted_point": "Full quote text here", "matter_of": "Fact", "cited": "Source citation", "position": "Positive", "author": "tyler", "date": "2024-07-15", "event_type": "filing", "cross_references": ["8", "10"]}
{"ecf": "43", "page": "3", "line": "8", "quoted_point": "Quote from DDA response", "matter_of": "Fact", "position": "Negative", "author": "dda", "original_source": "ECF 36", "date": "2024-08-20"}
```

### Field Descriptions

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `ecf` | Yes | ECF document number | `"11"`, `"17-1"`, `"60"` |
| `page` | Yes | Page number | `"1"`, `"5"`, `"[n/a]"` |
| `line` | Yes | Line number | `"12"`, `"[n/a]"` |
| `quoted_point` | Yes | Full quote text | `"Plaintiff filed..."` |
| `matter_of` | No | "Fact" or "Law" | `"Fact"` |
| `cited` | No | Citation/source | `"ECF 11 Opposition"` |
| `position` | No | "Positive", "Negative", "Indifferent" | `"Positive"` |
| `author` | No | Who is speaking | `"tyler"`, `"beckerman"`, `"dda"` |
| `original_source` | No | If nested quote, where from | `"Exhibit A"`, `"ECF 17-1"` |
| `date` | No | Event date (YYYY-MM-DD) | `"2024-07-15"` |
| `event_type` | No | "filing", "ruling", "hearing", etc. | `"filing"` |
| `cross_references` | No | Array of related ECF numbers | `["8", "10", "11"]` |

---

## Source Attribution (Nested Quotes)

### What is a Nested Quote?

When **you (Tyler)** quote **someone else** from an exhibit, the system detects this as a "nested quote."

**Examples:**

#### Tyler's Direct Quote (NOT nested):
```jsonl
{"ecf": "11", "quoted_point": "Plaintiff requests the court to...", "author": "tyler"}
```
Result: `is_nested_quote: false`

#### Tyler Quoting DDA (NESTED):
```jsonl
{"ecf": "43", "quoted_point": "\"We find no evidence of misconduct\"", "author": "dda", "original_source": "ECF 36"}
```
Result: `is_nested_quote: true`

#### Tyler Quoting from Exhibit (NESTED):
```jsonl
{"ecf": "17-1", "quoted_point": "\"The defendant failed to appear\"", "author": "exhibit", "original_source": "Exhibit A - Court Record"}
```
Result: `is_nested_quote: true`

### Automatic Detection

The system automatically detects nested quotes based on:
1. `author` field != "tyler"
2. Presence of quotation marks within the text
3. Citations to exhibits (e.g., "ECF 17-1", "Exhibit A")

### Searching Nested Quotes

```typescript
// Find all quotes where Tyler is quoting someone else
jsonl_search_by_source({
  author: "dda",  // or "beckerman", "west_linn", "exhibit", etc.
  include_nested_only: true
})
```

**Use case:** When building your brief, you can distinguish between:
- Your own arguments
- What the opposition said
- What exhibits show

---

## Timeline & Cross-Referencing

### The Problem You're Solving

Beckerman's ECF 60 has events in a specific order. You want to:
1. **Release events from ECF 60's order** → Put them in chronological order
2. **Cross-reference each event** → Show which ECFs support/relate to each event
3. **Build a master timeline** → Overlay ECF 60 + your own ECF submissions

### Example: ECF 60 Cross-References

According to your request, ECF 60 events should be cross-referenced to:
- ECF 8, 10, 11, 13, 15, 17, 17-1, 17-2, 38
- Sur reply
- 59e motion

**In JSONL format:**

```jsonl
{"ecf": "60", "page": "1", "date": "2024-09-15", "title": "Beckerman Order Event 1", "description": "...", "event_type": "ruling", "primary_ecf": "60", "cross_referenced_ecfs": ["8", "10", "11", "17-1"]}
{"ecf": "60", "page": "2", "date": "2024-09-16", "title": "Beckerman Order Event 2", "description": "...", "event_type": "ruling", "primary_ecf": "60", "cross_referenced_ecfs": ["13", "15", "38"]}
```

### Find All Cross-References for an ECF

```typescript
// Find all events that reference ECF 60
timeline_find_ecf_cross_refs({
  ecf_number: "60"
})
```

**Returns:** All events where ECF 60 is either:
- The `primary_ecf`
- In the `cross_referenced_ecfs` array

### Build Chronological Narrative

```typescript
// Build narrative from timeline
timeline_build_narrative({
  timeline_id: "your-timeline-id",
  start_date: "2024-01-01",
  end_date: "2024-12-31",
  ecf_filter: ["60", "8", "10", "11"],  // Optional: only these ECFs
  include_quotes: true  // Include related quotes in narrative
})
```

**Output:** Markdown narrative like:

```markdown
# Timeline Narrative

## 2024-07-15 - Plaintiff filed Opposition to F&R

**Type:** filing
**Primary ECF:** 11
**Cross-References:** 8, 10, 15

Plaintiff filed response opposing Magistrate Beckerman's Findings and Recommendations dated July 15, 2024.

### Related Quotes:

> **ECF 11, Page 1:** Plaintiff here by is giving notification that he intends to exercise the option to submit the Amended Complaint within thirty days...

---

## 2024-08-20 - DDA Response Filed

**Type:** filing
**Primary ECF:** 43
**Cross-References:** 36

DDA filed response to Plaintiff's opposition...

### Related Quotes:

> **ECF 43, Page 3:** "We find no evidence of misconduct"
```

### Overlay Multiple Timelines

```typescript
// Overlay Beckerman ECF 60 timeline with your master timeline
timeline_overlay({
  primary_timeline_id: "beckerman-ecf-60-timeline",
  overlay_timeline_id: "master-timeline",
  merge_duplicate_dates: true
})
```

**Use case:**
- Primary timeline: Events from Beckerman's ECF 60
- Overlay timeline: Your ECF filings and state court events
- Result: Combined chronological view

---

## State Court ECF 35 Integration

You mentioned ECF 35 (1-15) from the state claim shows they were already aware of things.

### Add State Court Events

```jsonl
{"ecf": "35-1", "page": "1", "date": "2022-10-15", "quoted_point": "State court was already aware of...", "matter_of": "Fact", "event_type": "state_court", "position": "Positive", "author": "tyler"}
{"ecf": "35-2", "page": "2", "date": "2022-11-20", "quoted_point": "Defendant knew about...", "matter_of": "Fact", "event_type": "state_court", "position": "Positive"}
```

### Search State Court Quotes

```typescript
// Find all state court events
jsonl_search_by_date_range({
  start_date: "2022-01-01",
  end_date: "2022-12-31"
})

// Or filter by ECF
jsonl_import_quotes({
  file_path: "/path/to/state_court_ecf35.jsonl"
})
```

---

## Advanced Workflows

### Workflow 1: Building a Brief Section

**Goal:** Write a section about events from July 2024, using only Positive quotes from Tyler, with citations.

```typescript
// 1. Find quotes in date range
jsonl_search_by_date_range({
  start_date: "2024-07-01",
  end_date: "2024-07-31"
})

// 2. Filter to Tyler's positive quotes
jsonl_search_by_source({
  author: "tyler"
})

// 3. Build timeline narrative
timeline_build_narrative({
  start_date: "2024-07-01",
  end_date: "2024-07-31",
  include_quotes: true
})
```

### Workflow 2: Responding to Opposition

**Goal:** Find all negative quotes from DDA and West Linn to respond to.

```typescript
// 1. Find DDA quotes
jsonl_search_by_source({
  author: "dda"
})

// 2. Find West Linn quotes
jsonl_search_by_source({
  author: "west_linn"
})

// 3. Find what they're referencing
jsonl_find_cross_references({
  ecf_number: "36"  // If DDA is responding to your ECF 36
})
```

### Workflow 3: ECF 60 Breakdown

**Goal:** Take Beckerman's ECF 60, break down each event, and cross-reference to your ECFs.

```typescript
// 1. Import ECF 60 events
timeline_import_jsonl({
  file_path: "/path/to/ecf60_events.jsonl"
})

// 2. Find all events from ECF 60
timeline_find_ecf_cross_refs({
  ecf_number: "60"
})

// 3. Build narrative showing cross-references
timeline_build_narrative({
  ecf_filter: ["60", "8", "10", "11", "13", "15", "17", "17-1", "17-2", "38"]
})
```

---

## Data Organization Recommendations

### File Structure

```
/home/user/Browser_mcp/src/data/quotes/
├── tyler_ecf_quotes.jsonl          # All your ECF quotes
├── opposition_ecf_quotes.jsonl     # Quotes from opposition
├── beckerman_ecf60_events.jsonl    # ECF 60 timeline events
├── state_court_ecf35.jsonl         # State court quotes
└── master_timeline.jsonl           # Combined timeline
```

### Naming Convention for `author`

Use consistent names:
- `"tyler"` - Your quotes
- `"beckerman"` - Magistrate Beckerman
- `"dda"` - DDA responses
- `"west_linn"` - West Linn responses
- `"exhibit"` - Quotes from exhibits
- `"state_court"` - State court records

### ECF Number Format

Use consistent format:
- Single ECF: `"11"`, `"34"`, `"60"`
- Sub-documents: `"17-1"`, `"17-2"`, `"35-1"`

---

## Tools Reference

### JSONL Tools (7 total)

| Tool | Description |
|------|-------------|
| `jsonl_import_quotes` | Import quotes from JSONL file (streaming) |
| `jsonl_export_quotes` | Export quotes to JSONL format |
| `jsonl_preview_table` | Preview JSONL as table before importing |
| `jsonl_search_by_source` | Find quotes by who said them |
| `jsonl_search_by_date_range` | Find quotes in date range |
| `jsonl_find_cross_references` | Find quotes referencing an ECF |
| `jsonl_get_stats` | Get database statistics |

### Timeline Tools (8 total)

| Tool | Description |
|------|-------------|
| `timeline_create` | Create a new timeline |
| `timeline_add_event` | Add event to timeline |
| `timeline_import_jsonl` | Import events from JSONL |
| `timeline_build_narrative` | Build chronological narrative |
| `timeline_find_ecf_cross_refs` | Find events referencing an ECF |
| `timeline_overlay` | Overlay two timelines |
| `timeline_get_stats` | Get timeline statistics |
| `timeline_export_jsonl` | Export timeline to JSONL |

---

## Example: Complete Setup

Here's a complete example workflow:

```typescript
// 1. Preview your data
jsonl_preview_table({
  file_path: "/home/user/Browser_mcp/src/data/quotes/EXAMPLE_ECF11.jsonl",
  max_entries: 10
})

// 2. Import all quotes
jsonl_import_quotes({
  file_path: "/home/user/Browser_mcp/src/data/quotes/EXAMPLE_ECF11.jsonl",
  preview_only: false
})

// 3. Create Beckerman ECF 60 timeline
timeline_create({
  name: "Beckerman ECF 60 Timeline",
  description: "Cross-references to ECF 8, 10, 11, 13, 15, 17, 17-1, 17-2, 38, Sur reply, 59e"
})
// Returns: timeline_id = "abc123"

// 4. Import timeline events
timeline_import_jsonl({
  file_path: "/path/to/beckerman_ecf60_timeline.jsonl",
  timeline_id: "abc123"
})

// 5. Build narrative with all cross-references
timeline_build_narrative({
  timeline_id: "abc123",
  include_quotes: true
})

// 6. Find nested quotes (where you're quoting opposition)
jsonl_search_by_source({
  author: "dda",
  include_nested_only: true
})

// 7. Get stats
jsonl_get_stats()
timeline_get_stats()
```

---

## Next Steps

1. **Prepare your JSONL files** - Convert your existing quote data to JSONL format
2. **Preview before importing** - Use `jsonl_preview_table` to check format
3. **Import quotes** - Use `jsonl_import_quotes` with `preview_only: false`
4. **Create timelines** - Build master timeline with `timeline_create`
5. **Cross-reference ECF 60** - Import Beckerman's events and overlay with your timeline
6. **Build narratives** - Generate chronological briefs with `timeline_build_narrative`

---

## FAQ

**Q: How many quotes can this handle?**
A: The JSONL loader streams data, so it can handle millions of quotes. It processes one line at a time without loading the entire file into memory.

**Q: How does nested quote detection work?**
A: The system looks for:
1. `author` field set to someone other than "tyler"
2. Quotation marks within the quote text
3. References to exhibits in the `original_source` field

**Q: Can I have multiple timelines?**
A: Yes! You can create:
- Master timeline (all events)
- Beckerman ECF 60 timeline
- State court timeline
- Then overlay them with `timeline_overlay`

**Q: What if I don't have dates for all quotes?**
A: Dates are optional. Quotes without dates won't appear in timeline narratives, but you can still search them by ECF number or source.

**Q: How do I handle ECF sub-documents (17-1, 17-2, etc.)?**
A: Use the format `"17-1"`, `"17-2"` as strings. The system treats these as separate ECF numbers for indexing and cross-referencing.

---

## Support

For issues or questions:
1. Check this guide
2. Use `jsonl_get_stats` and `timeline_get_stats` to debug
3. Use `jsonl_preview_table` to validate your JSONL format
4. Check the console for error messages during import

---

**End of Guide**
