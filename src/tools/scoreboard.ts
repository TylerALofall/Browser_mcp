import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "./tool";

// =============================================================================
// SCOREBOARD DATA STRUCTURE - QUALITY FOCUSED (NOT SPEED)
// =============================================================================

export interface ModelSubmission {
  submission_id: string;
  model_name: string;
  task_id: string;
  timestamp: number;
  work_product: {
    content: string;
    format: string; // "json" | "markdown" | "text"
    metadata?: Record<string, any>;
  };
  auto_metrics?: {
    completeness_score?: number; // 0-100
    citation_quality?: number; // 0-100
    format_compliance?: number; // 0-100
    word_count?: number;
    citations_count?: number;
  };
  judge_scores?: JudgeScore[];
  final_score?: number;
  status: "pending_review" | "judged" | "disqualified";
}

export interface JudgeScore {
  judge_id: string; // "human" | "claude-sonnet-4.5" | "gpt-5" | etc
  timestamp: number;
  scores: {
    accuracy: number; // 0-100
    completeness: number; // 0-100
    citation_quality: number; // 0-100
    legal_reasoning: number; // 0-100
    format_compliance: number; // 0-100
  };
  comments?: string;
  bonus_points?: number; // Judge can award 0-20 bonus points
  total_score: number; // Sum of scores + bonus
}

export interface ScoreboardEntry {
  model_name: string;
  total_points: number;
  submissions_count: number;
  wins: number;
  avg_accuracy: number;
  avg_completeness: number;
  avg_citation_quality: number;
  avg_legal_reasoning: number;
  bonus_points_earned: number;
  recent_submissions: string[]; // submission_ids
}

export interface Task {
  task_id: string;
  title: string;
  description: string;
  created_at: number;
  difficulty: "easy" | "medium" | "hard";
  max_points: number;
  status: "open" | "closed";
  winner?: string; // model_name
}

// =============================================================================
// IN-MEMORY STORAGE (Replace with DB if needed)
// =============================================================================

const submissions: Map<string, ModelSubmission> = new Map();
const scoreboard: Map<string, ScoreboardEntry> = new Map();
const tasks: Map<string, Task> = new Map();

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function calculateFinalScore(submission: ModelSubmission): number {
  if (!submission.judge_scores || submission.judge_scores.length === 0) {
    return 0;
  }

  // Average all judge scores
  const totalScore = submission.judge_scores.reduce(
    (sum, js) => sum + js.total_score,
    0,
  );
  return Math.round(totalScore / submission.judge_scores.length);
}

function updateScoreboard(submission: ModelSubmission): void {
  const modelName = submission.model_name;
  let entry = scoreboard.get(modelName);

  if (!entry) {
    entry = {
      model_name: modelName,
      total_points: 0,
      submissions_count: 0,
      wins: 0,
      avg_accuracy: 0,
      avg_completeness: 0,
      avg_citation_quality: 0,
      avg_legal_reasoning: 0,
      bonus_points_earned: 0,
      recent_submissions: [],
    };
  }

  // Update stats
  entry.submissions_count += 1;
  entry.total_points += submission.final_score || 0;
  entry.recent_submissions.unshift(submission.submission_id);
  entry.recent_submissions = entry.recent_submissions.slice(0, 10); // Keep last 10

  // Calculate averages from judge scores
  if (submission.judge_scores && submission.judge_scores.length > 0) {
    const avgJudgeScore = submission.judge_scores.reduce(
      (acc, js) => ({
        accuracy: acc.accuracy + js.scores.accuracy,
        completeness: acc.completeness + js.scores.completeness,
        citation_quality: acc.citation_quality + js.scores.citation_quality,
        legal_reasoning: acc.legal_reasoning + js.scores.legal_reasoning,
        bonus: acc.bonus + (js.bonus_points || 0),
      }),
      {
        accuracy: 0,
        completeness: 0,
        citation_quality: 0,
        legal_reasoning: 0,
        bonus: 0,
      },
    );

    const numJudges = submission.judge_scores.length;
    const count = entry.submissions_count;

    entry.avg_accuracy =
      (entry.avg_accuracy * (count - 1) +
        avgJudgeScore.accuracy / numJudges) /
      count;
    entry.avg_completeness =
      (entry.avg_completeness * (count - 1) +
        avgJudgeScore.completeness / numJudges) /
      count;
    entry.avg_citation_quality =
      (entry.avg_citation_quality * (count - 1) +
        avgJudgeScore.citation_quality / numJudges) /
      count;
    entry.avg_legal_reasoning =
      (entry.avg_legal_reasoning * (count - 1) +
        avgJudgeScore.legal_reasoning / numJudges) /
      count;
    entry.bonus_points_earned += avgJudgeScore.bonus;
  }

  scoreboard.set(modelName, entry);
}

// =============================================================================
// MCP TOOLS
// =============================================================================

// 1. CREATE TASK
const CreateTaskSchema = z.object({
  title: z.string().describe("Task title"),
  description: z.string().describe("Detailed task description"),
  difficulty: z
    .enum(["easy", "medium", "hard"])
    .describe("Task difficulty level"),
  max_points: z.number().describe("Maximum points for this task"),
});

export const createTask: Tool = {
  schema: {
    name: "scoreboard_create_task",
    description: "Create a new task for models to compete on",
    inputSchema: zodToJsonSchema(CreateTaskSchema),
  },
  handle: async (_context, params) => {
    const { title, description, difficulty, max_points } =
      CreateTaskSchema.parse(params);

    const task: Task = {
      task_id: generateId(),
      title,
      description,
      created_at: Date.now(),
      difficulty,
      max_points,
      status: "open",
    };

    tasks.set(task.task_id, task);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(task, null, 2),
        },
      ],
    };
  },
};

// 2. SUBMIT WORK
const SubmitWorkSchema = z.object({
  model_name: z.string().describe("Name of the model submitting work"),
  task_id: z.string().describe("ID of the task being completed"),
  content: z.string().describe("The work product content"),
  format: z
    .enum(["json", "markdown", "text"])
    .describe("Format of the content"),
  metadata: z
    .record(z.any())
    .optional()
    .describe("Additional metadata about the submission"),
});

export const submitWork: Tool = {
  schema: {
    name: "scoreboard_submit_work",
    description:
      "Submit completed work for a task. This creates a submission pending judge review.",
    inputSchema: zodToJsonSchema(SubmitWorkSchema),
  },
  handle: async (_context, params) => {
    const parsed = SubmitWorkSchema.parse(params);
    const { model_name, task_id, content, format, metadata } = parsed;

    // Verify task exists
    const task = tasks.get(task_id);
    if (!task) {
      throw new Error(`Task ${task_id} not found`);
    }

    if (task.status !== "open") {
      throw new Error(`Task ${task_id} is not open for submissions`);
    }

    const submission: ModelSubmission = {
      submission_id: generateId(),
      model_name,
      task_id,
      timestamp: Date.now(),
      work_product: {
        content,
        format,
        metadata,
      },
      status: "pending_review",
    };

    submissions.set(submission.submission_id, submission);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              submission_id: submission.submission_id,
              status: "pending_review",
              message: "Submission received. Awaiting judge review.",
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

// 3. JUDGE SUBMISSION
const JudgeSubmissionSchema = z.object({
  submission_id: z.string().describe("ID of the submission to judge"),
  judge_id: z.string().describe("ID of the judge (human, claude, gpt-5, etc)"),
  accuracy: z
    .number()
    .min(0)
    .max(100)
    .describe("Accuracy score (0-100): How factually correct is the work?"),
  completeness: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "Completeness score (0-100): Did it cover all required elements?",
    ),
  citation_quality: z
    .number()
    .min(0)
    .max(100)
    .describe("Citation quality score (0-100): Are sources properly cited?"),
  legal_reasoning: z
    .number()
    .min(0)
    .max(100)
    .describe("Legal reasoning score (0-100): Quality of legal analysis"),
  format_compliance: z
    .number()
    .min(0)
    .max(100)
    .describe("Format compliance score (0-100): Follows required format?"),
  bonus_points: z
    .number()
    .min(0)
    .max(20)
    .optional()
    .describe("Bonus points (0-20) for exceptional quality"),
  comments: z.string().optional().describe("Judge's comments"),
});

export const judgeSubmission: Tool = {
  schema: {
    name: "scoreboard_judge_submission",
    description:
      "Judge a submission by scoring it on multiple quality dimensions. This is NOT about speed - only QUALITY matters.",
    inputSchema: zodToJsonSchema(JudgeSubmissionSchema),
  },
  handle: async (_context, params) => {
    const parsed = JudgeSubmissionSchema.parse(params);
    const {
      submission_id,
      judge_id,
      accuracy,
      completeness,
      citation_quality,
      legal_reasoning,
      format_compliance,
      bonus_points,
      comments,
    } = parsed;

    const submission = submissions.get(submission_id);
    if (!submission) {
      throw new Error(`Submission ${submission_id} not found`);
    }

    const judgeScore: JudgeScore = {
      judge_id,
      timestamp: Date.now(),
      scores: {
        accuracy,
        completeness,
        citation_quality,
        legal_reasoning,
        format_compliance,
      },
      comments,
      bonus_points: bonus_points || 0,
      total_score:
        accuracy +
        completeness +
        citation_quality +
        legal_reasoning +
        format_compliance +
        (bonus_points || 0),
    };

    if (!submission.judge_scores) {
      submission.judge_scores = [];
    }
    submission.judge_scores.push(judgeScore);

    // Calculate final score
    submission.final_score = calculateFinalScore(submission);
    submission.status = "judged";

    // Update scoreboard
    updateScoreboard(submission);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              submission_id,
              model_name: submission.model_name,
              judge_score: judgeScore,
              final_score: submission.final_score,
              message: "Submission judged successfully",
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

// 4. VIEW SCOREBOARD
const ViewScoreboardSchema = z.object({
  sort_by: z
    .enum([
      "total_points",
      "accuracy",
      "completeness",
      "citation_quality",
      "legal_reasoning",
    ])
    .optional()
    .describe("Sort scoreboard by this metric (default: total_points)"),
  limit: z.number().optional().describe("Limit results (default: 10)"),
});

export const viewScoreboard: Tool = {
  schema: {
    name: "scoreboard_view",
    description:
      "View the current scoreboard rankings. Shows quality metrics, NOT speed.",
    inputSchema: zodToJsonSchema(ViewScoreboardSchema),
  },
  handle: async (_context, params) => {
    const { sort_by = "total_points", limit = 10 } =
      ViewScoreboardSchema.parse(params || {});

    const entries = Array.from(scoreboard.values());

    // Sort by requested metric
    entries.sort((a, b) => {
      switch (sort_by) {
        case "accuracy":
          return b.avg_accuracy - a.avg_accuracy;
        case "completeness":
          return b.avg_completeness - a.avg_completeness;
        case "citation_quality":
          return b.avg_citation_quality - a.avg_citation_quality;
        case "legal_reasoning":
          return b.avg_legal_reasoning - a.avg_legal_reasoning;
        default:
          return b.total_points - a.total_points;
      }
    });

    const topEntries = entries.slice(0, limit);

    // Format as table
    let output = `\n🏆 QUALITY SCOREBOARD (sorted by ${sort_by}) 🏆\n\n`;
    output += `${"Rank".padEnd(6)} ${"Model".padEnd(25)} ${"Points".padEnd(10)} ${"Accuracy".padEnd(10)} ${"Complete".padEnd(10)} ${"Citations".padEnd(10)} ${"Legal".padEnd(10)} ${"Bonus".padEnd(10)}\n`;
    output += "=".repeat(110) + "\n";

    topEntries.forEach((entry, index) => {
      output += `${(index + 1).toString().padEnd(6)} `;
      output += `${entry.model_name.padEnd(25)} `;
      output += `${entry.total_points.toFixed(0).padEnd(10)} `;
      output += `${entry.avg_accuracy.toFixed(1).padEnd(10)} `;
      output += `${entry.avg_completeness.toFixed(1).padEnd(10)} `;
      output += `${entry.avg_citation_quality.toFixed(1).padEnd(10)} `;
      output += `${entry.avg_legal_reasoning.toFixed(1).padEnd(10)} `;
      output += `${entry.bonus_points_earned.toFixed(0).padEnd(10)}\n`;
    });

    output += "\n" + "=".repeat(110) + "\n";
    output += `\nTotal Models: ${entries.length}\n`;
    output += `Total Submissions: ${Array.from(submissions.values()).length}\n`;

    return {
      content: [
        {
          type: "text",
          text: output,
        },
      ],
    };
  },
};

// 5. VIEW SUBMISSION DETAILS
const ViewSubmissionSchema = z.object({
  submission_id: z.string().describe("ID of the submission to view"),
});

export const viewSubmission: Tool = {
  schema: {
    name: "scoreboard_view_submission",
    description:
      "View detailed information about a specific submission including all judge scores",
    inputSchema: zodToJsonSchema(ViewSubmissionSchema),
  },
  handle: async (_context, params) => {
    const { submission_id } = ViewSubmissionSchema.parse(params);

    const submission = submissions.get(submission_id);
    if (!submission) {
      throw new Error(`Submission ${submission_id} not found`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(submission, null, 2),
        },
      ],
    };
  },
};

// 6. LIST TASKS
export const listTasks: Tool = {
  schema: {
    name: "scoreboard_list_tasks",
    description: "List all available tasks",
    inputSchema: zodToJsonSchema(z.object({})),
  },
  handle: async (_context, _params) => {
    const taskList = Array.from(tasks.values());

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(taskList, null, 2),
        },
      ],
    };
  },
};

// 7. RESET SCOREBOARD (Admin function)
export const resetScoreboard: Tool = {
  schema: {
    name: "scoreboard_reset",
    description: "Reset the entire scoreboard (admin only)",
    inputSchema: zodToJsonSchema(z.object({})),
  },
  handle: async (_context, _params) => {
    submissions.clear();
    scoreboard.clear();
    tasks.clear();

    return {
      content: [
        {
          type: "text",
          text: "Scoreboard reset successfully",
        },
      ],
    };
  },
};
