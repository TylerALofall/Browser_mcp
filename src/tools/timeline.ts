import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { readFile, writeFile } from "fs/promises";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import type { Tool } from "./tool";
import type { EnhancedQuote } from "./jsonl-loader";
import { getEnhancedQuoteById, getAllEnhancedQuotes } from "./jsonl-loader";

// =============================================================================
// TIMELINE DATA STRUCTURE - Master Timeline + ECF Cross-References
// =============================================================================

/**
 * Timeline Event represents a moment in the case chronology
 * Cross-referenced to ECF documents and quotes
 */
export interface TimelineEvent {
  event_id: string;
  date: string; // YYYY-MM-DD format (required)
  title: string; // Short description (e.g., "Plaintiff filed Opposition Brief")
  description: string; // Full description
  event_type: "filing" | "ruling" | "hearing" | "deadline" | "state_court" | "other";

  // ECF cross-references
  primary_ecf: string; // Main ECF this event relates to (e.g., "60")
  cross_referenced_ecfs: string[]; // Other ECFs mentioned (e.g., ["8", "10", "11", "17-1"])

  // Quote linkage
  related_quote_ids: string[]; // Quotes that support/describe this event

  // Timeline ordering
  sequence_number?: number; // Optional manual ordering within same date
  importance: "critical" | "high" | "medium" | "low";

  // Metadata
  created_at: number;
}

/**
 * Master Timeline - Chronological ordering of all case events
 * Allows overlay of Beckerman ECF 60 timeline with other ECF events
 */
export interface MasterTimeline {
  timeline_id: string;
  name: string; // e.g., "Beckerman ECF 60 Timeline" or "Master Timeline"
  description: string;
  events: TimelineEvent[];
  created_at: number;
  updated_at: number;
}

// =============================================================================
// IN-MEMORY STORAGE
// =============================================================================

const timelines: Map<string, MasterTimeline> = new Map();
const events: Map<string, TimelineEvent> = new Map();

// Indexes for fast lookup
const dateIndex: Map<string, string[]> = new Map(); // YYYY-MM-DD -> [event_ids]
const ecfIndex: Map<string, string[]> = new Map(); // ecf_number -> [event_ids]
const eventTypeIndex: Map<string, string[]> = new Map(); // event_type -> [event_ids]

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function addToTimelineIndexes(event: TimelineEvent): void {
  // Index by date
  const dateEvents = dateIndex.get(event.date) || [];
  dateEvents.push(event.event_id);
  dateIndex.set(event.date, dateEvents);

  // Index by primary ECF
  const ecfEvents = ecfIndex.get(event.primary_ecf) || [];
  ecfEvents.push(event.event_id);
  ecfIndex.set(event.primary_ecf, ecfEvents);

  // Index by cross-referenced ECFs
  event.cross_referenced_ecfs.forEach((ecf) => {
    const crossEcfEvents = ecfIndex.get(ecf) || [];
    crossEcfEvents.push(event.event_id);
    ecfIndex.set(ecf, crossEcfEvents);
  });

  // Index by event type
  const typeEvents = eventTypeIndex.get(event.event_type) || [];
  typeEvents.push(event.event_id);
  eventTypeIndex.set(event.event_type, typeEvents);
}

function sortEventsByDate(events: TimelineEvent[]): TimelineEvent[] {
  return events.sort((a, b) => {
    const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dateCompare !== 0) return dateCompare;

    // If same date, sort by sequence number
    if (a.sequence_number !== undefined && b.sequence_number !== undefined) {
      return a.sequence_number - b.sequence_number;
    }

    return 0;
  });
}

// =============================================================================
// EXPORT FUNCTIONS (for other tools to use)
// =============================================================================

export function getTimelineById(timelineId: string): MasterTimeline | undefined {
  return timelines.get(timelineId);
}

export function getAllTimelines(): MasterTimeline[] {
  return Array.from(timelines.values());
}

export function getEventById(eventId: string): TimelineEvent | undefined {
  return events.get(eventId);
}

export function getAllEvents(): TimelineEvent[] {
  return Array.from(events.values());
}

export function findEventsByDate(date: string): TimelineEvent[] {
  const eventIds = dateIndex.get(date) || [];
  return eventIds.map((id) => events.get(id)!).filter(Boolean);
}

export function findEventsByDateRange(startDate: string, endDate: string): TimelineEvent[] {
  const start = new Date(startDate);
  const end = new Date(endDate);

  return getAllEvents().filter((event) => {
    const eventDate = new Date(event.date);
    return eventDate >= start && eventDate <= end;
  });
}

export function findEventsByECF(ecfNumber: string): TimelineEvent[] {
  const eventIds = ecfIndex.get(ecfNumber) || [];
  return eventIds.map((id) => events.get(id)!).filter(Boolean);
}

export function findEventsByType(
  eventType: TimelineEvent["event_type"],
): TimelineEvent[] {
  const eventIds = eventTypeIndex.get(eventType) || [];
  return eventIds.map((id) => events.get(id)!).filter(Boolean);
}

export function getTimelineStats(): {
  total_timelines: number;
  total_events: number;
  by_event_type: Record<string, number>;
  by_importance: Record<string, number>;
  date_range: { earliest: string; latest: string } | null;
  ecfs_covered: number;
} {
  const allEvents = getAllEvents();

  const byEventType: Record<string, number> = {};
  const byImportance: Record<string, number> = {};
  const dates: Date[] = [];

  allEvents.forEach((event) => {
    byEventType[event.event_type] = (byEventType[event.event_type] || 0) + 1;
    byImportance[event.importance] = (byImportance[event.importance] || 0) + 1;
    dates.push(new Date(event.date));
  });

  const dateRange =
    dates.length > 0
      ? {
          earliest: new Date(Math.min(...dates.map((d) => d.getTime())))
            .toISOString()
            .split("T")[0],
          latest: new Date(Math.max(...dates.map((d) => d.getTime())))
            .toISOString()
            .split("T")[0],
        }
      : null;

  return {
    total_timelines: timelines.size,
    total_events: allEvents.length,
    by_event_type: byEventType,
    by_importance: byImportance,
    date_range: dateRange,
    ecfs_covered: ecfIndex.size,
  };
}

// =============================================================================
// MCP TOOLS
// =============================================================================

// 1. CREATE MASTER TIMELINE
const CreateTimelineSchema = z.object({
  name: z.string().describe('Timeline name (e.g., "Beckerman ECF 60 Timeline")'),
  description: z.string().describe("Description of this timeline"),
});

export const createTimeline: Tool = {
  schema: {
    name: "timeline_create",
    description: "Create a new master timeline for organizing case events",
    inputSchema: zodToJsonSchema(CreateTimelineSchema),
  },
  handle: async (_context, params) => {
    const { name, description } = CreateTimelineSchema.parse(params);

    const timelineId = generateId();

    const timeline: MasterTimeline = {
      timeline_id: timelineId,
      name,
      description,
      events: [],
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    timelines.set(timelineId, timeline);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              timeline_id: timelineId,
              timeline,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

// 2. ADD EVENT TO TIMELINE
const AddEventSchema = z.object({
  timeline_id: z.string().optional().describe("Timeline ID (optional if only one exists)"),
  date: z.string().describe("Event date in YYYY-MM-DD format"),
  title: z.string().describe("Short event title"),
  description: z.string().describe("Full event description"),
  event_type: z
    .enum(["filing", "ruling", "hearing", "deadline", "state_court", "other"])
    .describe("Type of event"),
  primary_ecf: z.string().describe("Primary ECF document for this event"),
  cross_referenced_ecfs: z
    .array(z.string())
    .optional()
    .describe("Array of other ECF numbers referenced"),
  related_quote_ids: z.array(z.string()).optional().describe("Array of quote IDs"),
  sequence_number: z.number().optional().describe("Manual ordering within same date"),
  importance: z.enum(["critical", "high", "medium", "low"]).default("medium"),
});

export const addEvent: Tool = {
  schema: {
    name: "timeline_add_event",
    description: "Add an event to the timeline with ECF cross-references",
    inputSchema: zodToJsonSchema(AddEventSchema),
  },
  handle: async (_context, params) => {
    const parsed = AddEventSchema.parse(params);

    // Find timeline
    let timelineId = parsed.timeline_id;
    if (!timelineId) {
      const allTimelines = getAllTimelines();
      if (allTimelines.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "Error: No timeline exists. Create one first with timeline_create.",
            },
          ],
          isError: true,
        };
      }
      timelineId = allTimelines[0].timeline_id;
    }

    const timeline = timelines.get(timelineId);
    if (!timeline) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Timeline ${timelineId} not found.`,
          },
        ],
        isError: true,
      };
    }

    const eventId = generateId();

    const event: TimelineEvent = {
      event_id: eventId,
      date: parsed.date,
      title: parsed.title,
      description: parsed.description,
      event_type: parsed.event_type,
      primary_ecf: parsed.primary_ecf,
      cross_referenced_ecfs: parsed.cross_referenced_ecfs || [],
      related_quote_ids: parsed.related_quote_ids || [],
      sequence_number: parsed.sequence_number,
      importance: parsed.importance,
      created_at: Date.now(),
    };

    events.set(eventId, event);
    addToTimelineIndexes(event);

    timeline.events.push(event);
    timeline.events = sortEventsByDate(timeline.events);
    timeline.updated_at = Date.now();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              event_id: eventId,
              timeline_id: timelineId,
              event,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

// 3. IMPORT EVENTS FROM JSONL
const ImportTimelineJSONLSchema = z.object({
  file_path: z.string().describe("Path to JSONL file with timeline events"),
  timeline_id: z.string().optional().describe("Timeline to add events to"),
  preview_only: z.boolean().optional().describe("Preview without importing"),
});

export const importTimelineJSONL: Tool = {
  schema: {
    name: "timeline_import_jsonl",
    description: "Import timeline events from JSONL file (Beckerman ECF 60 format)",
    inputSchema: zodToJsonSchema(ImportTimelineJSONLSchema),
  },
  handle: async (_context, params) => {
    const { file_path, timeline_id, preview_only } = ImportTimelineJSONLSchema.parse(params);

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

        if (!line.trim()) continue;

        try {
          const data = JSON.parse(line);

          if (preview_only && preview.length < 20) {
            preview.push({
              line: lineNumber,
              date: data.date,
              title: data.title,
              primary_ecf: data.primary_ecf || data.ecf,
              cross_refs: data.cross_referenced_ecfs || [],
              event_type: data.event_type || "other",
            });
          }

          if (!preview_only) {
            const eventId = generateId();
            const event: TimelineEvent = {
              event_id: eventId,
              date: data.date,
              title: data.title,
              description: data.description || data.quoted_point || "",
              event_type: data.event_type || "other",
              primary_ecf: data.primary_ecf || data.ecf,
              cross_referenced_ecfs: data.cross_referenced_ecfs || [],
              related_quote_ids: data.related_quote_ids || [],
              sequence_number: data.sequence_number,
              importance: data.importance || "medium",
              created_at: Date.now(),
            };

            events.set(eventId, event);
            addToTimelineIndexes(event);

            if (timeline_id) {
              const timeline = timelines.get(timeline_id);
              if (timeline) {
                timeline.events.push(event);
                timeline.updated_at = Date.now();
              }
            }

            importedCount++;
          }
        } catch (err) {
          errors.push(`Line ${lineNumber}: ${err}`);
        }
      }

      if (preview_only) {
        // Format as table
        const headers = ["Line", "Date", "Title", "Primary ECF", "Cross Refs", "Type"];
        const rows = preview.map(
          (e) =>
            `| ${e.line} | ${e.date} | ${e.title.substring(0, 40)}... | ${e.primary_ecf} | ${e.cross_refs.join(", ")} | ${e.event_type} |`,
        );
        const table = [
          `| ${headers.join(" | ")} |`,
          `| ${headers.map(() => "---").join(" | ")} |`,
          ...rows,
        ].join("\n");

        return {
          content: [
            {
              type: "text",
              text: `# Timeline Preview: ${file_path}\n\n${table}\n\n**Total lines:** ${lineNumber}\n**Entries shown:** ${preview.length}`,
            },
          ],
        };
      }

      const stats = getTimelineStats();

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
            text: `Error importing timeline JSONL: ${error}`,
          },
        ],
        isError: true,
      };
    }
  },
};

// 4. BUILD NARRATIVE FROM TIMELINE
const BuildNarrativeSchema = z.object({
  timeline_id: z.string().optional().describe("Timeline ID"),
  start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  end_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
  ecf_filter: z.array(z.string()).optional().describe("Filter by ECF numbers"),
  include_quotes: z.boolean().optional().describe("Include related quotes in narrative"),
});

export const buildNarrative: Tool = {
  schema: {
    name: "timeline_build_narrative",
    description:
      "Build chronological narrative from timeline events with quotes and cross-references",
    inputSchema: zodToJsonSchema(BuildNarrativeSchema),
  },
  handle: async (_context, params) => {
    const { timeline_id, start_date, end_date, ecf_filter, include_quotes } =
      BuildNarrativeSchema.parse(params);

    let eventsToInclude: TimelineEvent[] = [];

    if (timeline_id) {
      const timeline = timelines.get(timeline_id);
      if (timeline) {
        eventsToInclude = timeline.events;
      }
    } else {
      eventsToInclude = getAllEvents();
    }

    // Filter by date range
    if (start_date || end_date) {
      const start = start_date ? new Date(start_date) : new Date("1900-01-01");
      const end = end_date ? new Date(end_date) : new Date("2100-12-31");
      eventsToInclude = eventsToInclude.filter((event) => {
        const eventDate = new Date(event.date);
        return eventDate >= start && eventDate <= end;
      });
    }

    // Filter by ECF
    if (ecf_filter && ecf_filter.length > 0) {
      eventsToInclude = eventsToInclude.filter(
        (event) =>
          ecf_filter.includes(event.primary_ecf) ||
          event.cross_referenced_ecfs.some((ecf) => ecf_filter.includes(ecf)),
      );
    }

    // Sort by date
    eventsToInclude = sortEventsByDate(eventsToInclude);

    // Build narrative
    const narrative = eventsToInclude.map((event) => {
      let section = `## ${event.date} - ${event.title}\n\n`;
      section += `**Type:** ${event.event_type}\n`;
      section += `**Primary ECF:** ${event.primary_ecf}\n`;

      if (event.cross_referenced_ecfs.length > 0) {
        section += `**Cross-References:** ${event.cross_referenced_ecfs.join(", ")}\n`;
      }

      section += `\n${event.description}\n`;

      if (include_quotes && event.related_quote_ids.length > 0) {
        section += `\n### Related Quotes:\n\n`;
        event.related_quote_ids.forEach((quoteId) => {
          const quote = getEnhancedQuoteById(quoteId);
          if (quote) {
            section += `> **ECF ${quote.ecf_number}, Page ${quote.page}:** ${quote.full_text}\n\n`;
          }
        });
      }

      return section;
    });

    return {
      content: [
        {
          type: "text",
          text: `# Timeline Narrative\n\n${narrative.join("\n---\n\n")}`,
        },
      ],
    };
  },
};

// 5. FIND CROSS-REFERENCES BY ECF
const FindECFCrossRefsSchema = z.object({
  ecf_number: z.string().describe("ECF number to find cross-references for"),
});

export const findECFCrossReferences: Tool = {
  schema: {
    name: "timeline_find_ecf_cross_refs",
    description:
      "Find all timeline events that reference a specific ECF (e.g., find all events that cite ECF 60)",
    inputSchema: zodToJsonSchema(FindECFCrossRefsSchema),
  },
  handle: async (_context, params) => {
    const { ecf_number } = FindECFCrossRefsSchema.parse(params);

    const events = findEventsByECF(ecf_number);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ecf_number,
              total_events: events.length,
              events: sortEventsByDate(events),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

// 6. OVERLAY TIMELINES (e.g., Beckerman ECF 60 + Master Timeline)
const OverlayTimelinesSchema = z.object({
  primary_timeline_id: z.string().describe("Primary timeline ID"),
  overlay_timeline_id: z.string().describe("Timeline to overlay"),
  merge_duplicate_dates: z
    .boolean()
    .optional()
    .describe("Merge events on same date"),
});

export const overlayTimelines: Tool = {
  schema: {
    name: "timeline_overlay",
    description:
      "Overlay two timelines (e.g., Beckerman ECF 60 timeline + Master timeline) showing all events chronologically",
    inputSchema: zodToJsonSchema(OverlayTimelinesSchema),
  },
  handle: async (_context, params) => {
    const { primary_timeline_id, overlay_timeline_id, merge_duplicate_dates } =
      OverlayTimelinesSchema.parse(params);

    const primaryTimeline = timelines.get(primary_timeline_id);
    const overlayTimeline = timelines.get(overlay_timeline_id);

    if (!primaryTimeline || !overlayTimeline) {
      return {
        content: [
          {
            type: "text",
            text: "Error: One or both timelines not found.",
          },
        ],
        isError: true,
      };
    }

    let combinedEvents = [...primaryTimeline.events, ...overlayTimeline.events];

    // Remove duplicates if merging
    if (merge_duplicate_dates) {
      const seen = new Map<string, TimelineEvent>();
      combinedEvents = combinedEvents.filter((event) => {
        const key = `${event.date}-${event.title}`;
        if (seen.has(key)) return false;
        seen.set(key, event);
        return true;
      });
    }

    combinedEvents = sortEventsByDate(combinedEvents);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              primary_timeline: primaryTimeline.name,
              overlay_timeline: overlayTimeline.name,
              total_events: combinedEvents.length,
              combined_events: combinedEvents,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

// 7. GET TIMELINE STATS
export const getStatsTools: Tool = {
  schema: {
    name: "timeline_get_stats",
    description: "Get statistics about timeline database",
    inputSchema: zodToJsonSchema(z.object({})),
  },
  handle: async (_context, _params) => {
    const stats = getTimelineStats();

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

// 8. EXPORT TIMELINE TO JSONL
const ExportTimelineSchema = z.object({
  output_path: z.string().describe("Path to save JSONL file"),
  timeline_id: z.string().optional().describe("Timeline ID (or all events if omitted)"),
});

export const exportTimelineJSONL: Tool = {
  schema: {
    name: "timeline_export_jsonl",
    description: "Export timeline events to JSONL format",
    inputSchema: zodToJsonSchema(ExportTimelineSchema),
  },
  handle: async (_context, params) => {
    const { output_path, timeline_id } = ExportTimelineSchema.parse(params);

    try {
      let eventsToExport: TimelineEvent[] = [];

      if (timeline_id) {
        const timeline = timelines.get(timeline_id);
        if (timeline) {
          eventsToExport = timeline.events;
        }
      } else {
        eventsToExport = getAllEvents();
      }

      eventsToExport = sortEventsByDate(eventsToExport);

      const lines = eventsToExport.map((event) => JSON.stringify(event));
      await writeFile(output_path, lines.join("\n"));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                exported: eventsToExport.length,
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
            text: `Error exporting timeline: ${error}`,
          },
        ],
        isError: true,
      };
    }
  },
};
