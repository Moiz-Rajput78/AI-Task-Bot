import { z } from "zod";
import { generateAIResponse } from "../services/ai.service";

/*
 * =============================================================
 * INTENT CLASSIFICATION
 * =============================================================
 *
 * This service asks the LLM (Ollama Cloud) to classify a raw
 * user message into one of the application's known intents.
 *
 * Design goal: make Ollama genuinely responsible for "understanding"
 * the request (per the AI Task Bot spec's tool/function-calling
 * architecture), WITHOUT touching the existing, working, regex-based
 * extraction + execution pipeline in server.ts.
 *
 * The result of classifyIntent() is used as an ADDITIONAL trigger
 * alongside each existing isXRequest(message) regex check:
 *
 *   if (llmIntent === "TASK_CREATE" || isTaskCreationRequest(message)) { ... }
 *
 * This means:
 *   - The LLM can now catch phrasings the regex would miss.
 *   - If Ollama is unavailable, times out, or returns something
 *     that doesn't validate, we fall back to "UNKNOWN" and the
 *     existing regex cascade behaves exactly as it did before —
 *     zero regression risk.
 *   - All database writes still go through the same validated,
 *     already-reviewed backend functions. The LLM never touches
 *     the database directly.
 */

export const INTENTS = [
  "PERSON_CREATE",
  "PERSON_UPDATE",
  "PERSON_QUERY",
  "AVAILABILITY_QUERY",
  "PROJECT_MEMBER_UPDATE",
  "PROJECT_UPDATE",
  "PROJECT_CREATE",
  "PROJECT_MEMBER_QUERY",
  "PROJECT_QUERY",
  "TASK_UPDATE",
  "TASK_QUERY",
  "TASK_CREATE",
  "ASSIGNMENT_RECOMMEND",
  "GENERAL",
] as const;

export type Intent = (typeof INTENTS)[number] | "UNKNOWN";

const IntentResponseSchema = z.object({
  intent: z.enum(INTENTS),
});

const INTENT_DESCRIPTIONS: Record<(typeof INTENTS)[number], string> = {
  PERSON_CREATE:
    "Adding a brand-new team member / person to the system (e.g. 'add Ahmad as a backend developer').",
  PERSON_UPDATE:
    "Changing an existing person's department, skills, availability, role, or other attributes.",
  PERSON_QUERY:
    "Asking to see/list people, a person's details, people by department, or people by skill.",
  AVAILABILITY_QUERY:
    "Asking who is available, who has the lowest workload, or who can take on new work (no specific task ID involved).",
  PROJECT_MEMBER_UPDATE:
    "Adding or removing a person from a project's member list.",
  PROJECT_UPDATE:
    "Changing an existing project's status, due date, or manager.",
  PROJECT_CREATE: "Creating a brand-new project.",
  PROJECT_MEMBER_QUERY:
    "Asking who is on a project, or who manages a project.",
  PROJECT_QUERY:
    "Asking to see/list projects, or details of a specific project (not members/manager).",
  TASK_UPDATE:
    "Changing an existing task's status, priority, assignee, project, department, or due date. Includes short follow-ups like 'mark it completed' when a task was recently discussed.",
  TASK_QUERY:
    "Asking to see a task's details, status, or other information about a specific task.",
  TASK_CREATE: "Creating a brand-new task.",
  ASSIGNMENT_RECOMMEND:
    "Asking who should be assigned to a task, or asking for the best/most suitable person for a task.",
  GENERAL:
    "Greetings, thanks, general questions, or anything not covered above — a normal conversational reply grounded in the database context is appropriate.",
};

function buildClassificationPrompt(
  message: string,
  flags: {
    hasPendingPerson: boolean;
    hasPendingTask: boolean;
    hasPendingProject: boolean;
  }
): string {
  const intentList = INTENTS.map(
    (intent) => `- "${intent}": ${INTENT_DESCRIPTIONS[intent]}`
  ).join("\n");

  return `
You are an intent classifier for a task/team-management application.

Classify the user's message into EXACTLY ONE of the following intents:

${intentList}

Context flags (a pending action awaiting confirmation may already exist for
this conversation — if the message looks like it continues that conversation,
classify it according to what the user is actually asking for, not as GENERAL):
- hasPendingPersonAction: ${flags.hasPendingPerson}
- hasPendingTaskAction: ${flags.hasPendingTask}
- hasPendingProjectAction: ${flags.hasPendingProject}

Respond with ONLY a single-line JSON object, no markdown, no explanation, no
code fences. Exactly this shape:

{"intent": "ONE_OF_THE_INTENTS_ABOVE"}

User message:
"""
${message}
"""
`.trim();
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();

  // Strip accidental markdown code fences if the model adds them anyway.
  const withoutFences = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const firstBrace = withoutFences.indexOf("{");
  const lastBrace = withoutFences.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("No JSON object found in model response");
  }

  const jsonSlice = withoutFences.slice(firstBrace, lastBrace + 1);

  return JSON.parse(jsonSlice);
}

/**
 * Classifies a message into an Intent. NEVER throws — on any failure
 * (Ollama unavailable, invalid JSON, unexpected shape, timeout) this
 * resolves to "UNKNOWN", which callers treat as "fall back to the
 * existing regex-based cascade".
 */
export async function classifyIntent(
  message: string,
  flags: {
    hasPendingPerson: boolean;
    hasPendingTask: boolean;
    hasPendingProject: boolean;
  }
): Promise<Intent> {
  try {
    const prompt = buildClassificationPrompt(message, flags);

    const raw = await generateAIResponse(prompt);

    const parsed = extractJson(raw);

    const result = IntentResponseSchema.safeParse(parsed);

    if (!result.success) {
      return "UNKNOWN";
    }

    return result.data.intent;
  } catch (error) {
    console.error("Intent classification failed, falling back:", error);

    return "UNKNOWN";
  }
}
