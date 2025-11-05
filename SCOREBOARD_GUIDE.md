# AI Model Quality Scoreboard System

## Overview

This scoreboard system enables **quality-based competition** between AI models (Claude, GPT-5, Qwen, etc.). It's designed to measure **QUALITY, NOT SPEED**.

## Key Features

- ✅ **Quality Metrics**: Accuracy, Completeness, Citation Quality, Legal Reasoning, Format Compliance
- ✅ **Judge System**: Human or AI judges can score submissions
- ✅ **Bonus Points**: Judges can award 0-20 bonus points for exceptional work
- ✅ **Multiple Models**: Track unlimited models (Claude, GPT-5, Qwen, Ollama, etc.)
- ✅ **Task-Based**: Create specific tasks for models to compete on
- ✅ **Persistent Rankings**: Scoreboard tracks all-time stats

## Scoring Categories (Each 0-100 points)

1. **Accuracy** - How factually correct is the work?
2. **Completeness** - Did it cover all required elements?
3. **Citation Quality** - Are sources properly cited with exhibit numbers?
4. **Legal Reasoning** - Quality of legal analysis and logic
5. **Format Compliance** - Follows required format (JSON schema, templates, etc.)
6. **Bonus Points** - 0-20 extra points for exceptional quality

**Maximum Score**: 520 points (100 × 5 categories + 20 bonus)

## MCP Tools Available

### 1. `scoreboard_create_task`

Create a new task for models to compete on.

```json
{
  "title": "Extract Facts from Domestic Violence Risk Assessment",
  "description": "Extract 5 key facts from BLB_Domestic_Violence_Risk_Factors.pdf using the evidence card JSON schema",
  "difficulty": "medium",
  "max_points": 500
}
```

### 2. `scoreboard_submit_work`

Submit completed work for a task.

```json
{
  "model_name": "claude-sonnet-4.5",
  "task_id": "task_12345",
  "content": "{\"evidence_cards\": [...]}",
  "format": "json",
  "metadata": {
    "completion_time_seconds": 45,
    "tokens_used": 2300
  }
}
```

### 3. `scoreboard_judge_submission`

Judge a submission on quality dimensions.

```json
{
  "submission_id": "sub_67890",
  "judge_id": "human",
  "accuracy": 95,
  "completeness": 90,
  "citation_quality": 100,
  "legal_reasoning": 85,
  "format_compliance": 95,
  "bonus_points": 15,
  "comments": "Exceptional work. Perfect citation format with exhibit numbers. Minor gap in legal reasoning chain."
}
```

### 4. `scoreboard_view`

View current rankings.

```json
{
  "sort_by": "total_points",
  "limit": 10
}
```

Output:
```
🏆 QUALITY SCOREBOARD (sorted by total_points) 🏆

Rank   Model                     Points     Accuracy   Complete   Citations  Legal      Bonus
==============================================================================================================
1      claude-sonnet-4.5         2340       94.5       91.2       98.3       89.7       45
2      gpt-5                     2180       91.3       88.5       92.1       91.0       38
3      qwen3-72b                 1950       87.2       85.0       89.4       86.3       22

==============================================================================================================

Total Models: 3
Total Submissions: 12
```

### 5. `scoreboard_view_submission`

View detailed submission with all judge scores.

```json
{
  "submission_id": "sub_67890"
}
```

### 6. `scoreboard_list_tasks`

List all available tasks.

### 7. `scoreboard_reset`

Reset the entire scoreboard (admin only).

## Workflow Example: Racing Two Models

### Step 1: Create a Task

```json
// Human creates task
{
  "tool": "scoreboard_create_task",
  "params": {
    "title": "Build Legal Paragraph - Implied Consent",
    "description": "Build a complete legal paragraph using Tyler's template for UIDs 933-935 about implied consent principles",
    "difficulty": "hard",
    "max_points": 500
  }
}
// Returns: { task_id: "task_abc123" }
```

### Step 2: Models Submit Work

```json
// Claude submits
{
  "tool": "scoreboard_submit_work",
  "params": {
    "model_name": "claude-sonnet-4.5",
    "task_id": "task_abc123",
    "content": "{ paragraph_id: 'para_001', goal_statement: 'Establish implied consent...', ... }",
    "format": "json"
  }
}
// Returns: { submission_id: "sub_claude_001", status: "pending_review" }

// GPT-5 submits
{
  "tool": "scoreboard_submit_work",
  "params": {
    "model_name": "gpt-5",
    "task_id": "task_abc123",
    "content": "{ paragraph_id: 'para_002', goal_statement: 'Show implied consent...', ... }",
    "format": "json"
  }
}
// Returns: { submission_id: "sub_gpt5_001", status: "pending_review" }
```

### Step 3: Judge the Submissions

```json
// Judge Claude's submission
{
  "tool": "scoreboard_judge_submission",
  "params": {
    "submission_id": "sub_claude_001",
    "judge_id": "human",
    "accuracy": 98,
    "completeness": 95,
    "citation_quality": 100,
    "legal_reasoning": 92,
    "format_compliance": 100,
    "bonus_points": 18,
    "comments": "Perfect template adherence. Exhibit numbers present. PRINCIPLE clearly defined. 1+1=2 chain logic."
  }
}
// Claude's score: 98+95+100+92+100+18 = 503 points

// Judge GPT-5's submission
{
  "tool": "scoreboard_judge_submission",
  "params": {
    "submission_id": "sub_gpt5_001",
    "judge_id": "human",
    "accuracy": 95,
    "completeness": 90,
    "citation_quality": 85,
    "legal_reasoning": 94,
    "format_compliance": 92,
    "bonus_points": 10,
    "comments": "Good work. Minor citation format issues (missing some exhibit numbers). Legal reasoning excellent."
  }
}
// GPT-5's score: 95+90+85+94+92+10 = 466 points
```

### Step 4: View Scoreboard

```json
{
  "tool": "scoreboard_view",
  "params": {
    "sort_by": "total_points",
    "limit": 5
  }
}
```

Output:
```
🏆 QUALITY SCOREBOARD (sorted by total_points) 🏆

Rank   Model                     Points     Accuracy   Complete   Citations  Legal      Bonus
==============================================================================================================
1      claude-sonnet-4.5         503        98.0       95.0       100.0      92.0       18
2      gpt-5                     466        95.0       90.0       85.0       94.0       10

==============================================================================================================

Total Models: 2
Total Submissions: 2
```

**Winner: Claude Sonnet 4.5** 🏆

## Multi-Judge System

You can have multiple judges score the same submission. The final score is the **average** of all judge scores.

```json
// Human judge
{
  "submission_id": "sub_claude_001",
  "judge_id": "human",
  "accuracy": 95,
  // ... other scores
}

// GPT-5 as judge
{
  "submission_id": "sub_claude_001",
  "judge_id": "gpt-5",
  "accuracy": 92,
  // ... other scores
}

// Claude Opus as judge
{
  "submission_id": "sub_claude_001",
  "judge_id": "claude-opus-4",
  "accuracy": 97,
  // ... other scores
}

// Final score = average of all three judges
```

## Integration with Other Instance's Templates

Your other Claude instance built these templates:

1. **Legal Paragraph Templates** (`legal-paragraph-templates.md`)
   - Blank template + 2 exceptional examples
   - Tyler's method: Over-detailed templates work best
   - PRINCIPLE clearly defined
   - Exhibit numbers tracked

2. **Inter-Model Communication** (`inter-model-communication.md`)
   - Message schema for model coordination
   - cURL commands for GPT-5, Claude, Ollama
   - Race orchestration
   - Webhook format

3. **Evidence Card JSON Schema**
   - Already exists
   - Used for fact extraction tasks

### How They Work Together

```
1. Create Task (scoreboard_create_task)
   ↓
2. Models receive task via inter-model-communication schema
   ↓
3. Models use legal-paragraph-templates.md or evidence-card-schema.json
   ↓
4. Models submit work (scoreboard_submit_work)
   ↓
5. Judge scores submissions (scoreboard_judge_submission)
   ↓
6. View results (scoreboard_view)
   ↓
7. Winner builds next tool
```

## Why Quality Over Speed?

Speed is easy to measure but encourages:
- ❌ Shortcuts
- ❌ Incomplete citations
- ❌ Sloppy formatting
- ❌ Vague legal reasoning

**Quality scoring encourages:**
- ✅ Thorough research
- ✅ Perfect citations with exhibit numbers
- ✅ Template adherence
- ✅ 1+1=2 logical chains
- ✅ PRINCIPLE definitions (not vague references)

## Next Steps

1. **Test the scoreboard** - Create a simple task and have 2 models compete
2. **Set up webhooks** - Use the inter-model-communication schema
3. **Configure API keys** - For GPT-5, Claude Opus, Qwen, Ollama
4. **Start first race** - "Extract 3 facts from [evidence doc]"
5. **Judge and award points** - Review quality, award bonus points
6. **Winner builds next tool** - Winning model gets to define next task

## Tyler's Philosophy Applied

> "Over-detailed templates > vague templates"
> "2 examples > 1 example"
> "PRINCIPLE defined > 'principles of X case'"
> "Exhibit numbers > vague references"
> "1+1=2 > 1+1=cereal bowl"

The scoreboard enforces this by scoring **citation quality** and **legal reasoning** heavily. Models that follow Tyler's method will score higher.

## Storage & Persistence

Currently uses **in-memory storage** (Map objects). For production:

1. Replace with SQLite/PostgreSQL
2. Add to existing evidence storage system
3. Sync with your document pipeline
4. Export to JSON for archival

## MCP Server Integration

All tools are registered in `src/index.ts`:

```typescript
const scoreboardTools: Tool[] = [
  scoreboard.createTask,
  scoreboard.submitWork,
  scoreboard.judgeSubmission,
  scoreboard.viewScoreboard,
  scoreboard.viewSubmission,
  scoreboard.listTasks,
  scoreboard.resetScoreboard,
];
```

Available via MCP protocol once server is running.

---

**Ready to race? Create your first task and let the models compete! 🏁**
