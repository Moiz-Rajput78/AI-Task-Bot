import "dotenv/config";

import cors from "cors";

import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";

import prisma from "./lib/prisma";

import type {
  Availability,
  Priority,
  TaskStatus,
  ProjectStatus,
} from "@prisma/client";

import departmentsRouter from "./routes/departments.routes";
import skillsRouter from "./routes/skills.routes";
import peopleRouter from "./routes/people.routes";
import tasksRouter from "./routes/tasks.routes";
import assignmentRouter from "./routes/assignment.routes";
import projectsRouter from "./routes/projects.routes";

import { generateAIResponse } from "./services/ai.service";

const app = express();

const PORT = Number(process.env.PORT || 5000);

/* -------------------------------------------------------------------------- */
/* MIDDLEWARE                                                                 */
/* -------------------------------------------------------------------------- */

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));

/* -------------------------------------------------------------------------- */
/* BASIC ROUTES                                                               */
/* -------------------------------------------------------------------------- */

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Backend is running",
  });
});

app.get("/api/test-db", async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      success: true,
      message: "Database connection successful",
    });
  } catch (error) {
    console.error("Database test failed:", error);

    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

/* -------------------------------------------------------------------------- */
/* API ROUTES                                                                 */
/* -------------------------------------------------------------------------- */

app.use("/api/departments", departmentsRouter);
app.use("/api/skills", skillsRouter);
app.use("/api/people", peopleRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/assignments", assignmentRouter);
app.use("/api/projects", projectsRouter);

/* -------------------------------------------------------------------------- */
/* GENERAL HELPERS                                                            */
/* -------------------------------------------------------------------------- */

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/* -------------------------------------------------------------------------- */
/* TASK ID EXTRACTION                                                         */
/* -------------------------------------------------------------------------- */

function extractTaskId(message: string): number | null {
  const patterns = [
    /\btask\s*(?:id\s*)?#?\s*(\d+)\b/i,
    /\btask\s*#\s*(\d+)\b/i,
    /\bid\s*[:#]?\s*(\d+)\b/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match) {
      const id = Number(match[1]);

      if (Number.isInteger(id) && id > 0) {
        return id;
      }
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* ASSIGNMENT REQUEST DETECTION                                               */
/* -------------------------------------------------------------------------- */

function isAssignmentRequest(message: string): boolean {
  const text = message.toLowerCase();

  const assignmentWords = [
    "assign",
    "assignment",
    "assignee",
    "recommend",
    "recommendation",
    "best person",
    "best developer",
    "best team member",
    "who should",
    "who is best",
    "suitable person",
    "suitable developer",
    "suitable team member",
  ];

  const taskWords = [
    "task",
    "work",
    "project",
    "developer",
    "person",
    "member",
    "team",
  ];

  return (
    assignmentWords.some((word) => text.includes(word)) &&
    taskWords.some((word) => text.includes(word))
  );
}

/* -------------------------------------------------------------------------- */
/* AVAILABILITY REQUEST DETECTION                                             */
/* -------------------------------------------------------------------------- */

function isAvailabilityRequest(message: string): boolean {
  const text = message.toLowerCase();

  const availabilityWords = [
    "available",
    "availability",
    "free",
    "least busy",
    "least workload",
    "lowest workload",
    "who can take",
    "who can handle",
    "who has capacity",
    "who has time",
    "capacity",
    "workload",
    "overloaded",
    "overload",
    "busy",
  ];

  return availabilityWords.some((word) => text.includes(word));
}

/* -------------------------------------------------------------------------- */
/* CONFIRMATION / CANCELLATION                                                */
/* -------------------------------------------------------------------------- */

function isConfirmation(message: string): boolean {
  const text = message.toLowerCase().trim();

  return [
    "yes",
    "yes please",
    "confirm",
    "confirmed",
    "create",
    "create it",
    "create him",
    "create her",
    "add him",
    "add her",
    "do it",
    "go ahead",
    "proceed",
    "okay",
    "ok",
    "sure",
    "assign",
    "assign it",
    "assign him",
    "assign her",
    "assign them",
  ].includes(text);
}

function isCancellation(message: string): boolean {
  const text = message.toLowerCase().trim();

  return [
    "no",
    "no thanks",
    "cancel",
    "cancel it",
    "stop",
    "don't",
    "do not",
    "never mind",
    "nevermind",
  ].includes(text);
}

/* -------------------------------------------------------------------------- */
/* ASSIGNMENT RECOMMENDATION                                                  */
/* -------------------------------------------------------------------------- */

async function getAssignmentRecommendation(taskId: number) {
  const response = await fetch(
    `http://localhost:${PORT}/api/assignments/task/${taskId}`
  );

  const data = await response.json();

  if (!response.ok || !data?.success) {
    throw new Error(
      data?.message || "Unable to get assignment recommendation."
    );
  }

  return data.data;
}

/* -------------------------------------------------------------------------- */
/* PENDING PERSON CREATION                                                    */
/* -------------------------------------------------------------------------- */

type PendingPersonAction = {
  intent: "CREATE_PERSON";

  personName: string;

  data?: {
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
    departmentId?: number;
    departmentName?: string;
    jobTitle?: string;
    role?: string;
    experience?: number;
    employmentType?: string;
    availability?: string;
    bio?: string;
    notes?: string;
    preferredTaskTypes?: string;
    skillIds?: number[];
    skillNames?: string[];
  };
};

/* -------------------------------------------------------------------------- */
/* PENDING TASK CREATION                                                      */
/* -------------------------------------------------------------------------- */

type PendingTaskAction = {
  intent: "CREATE_TASK";

  data: {
    title: string;
    description?: string;
    projectId?: number;
    projectName?: string;
    departmentId?: number;
    departmentName?: string;
    taskType?: string;
    priority: Priority;
    status: TaskStatus;
    startDate?: string;
    dueDate?: string;
    estimatedHours?: number;
    actualHours?: number;
    labels?: string;
    skillIds: number[];
    skillNames: string[];
    missingSkillNames: string[];
  };
};

/* -------------------------------------------------------------------------- */
/* PENDING PROJECT CREATION                                                   */
/* -------------------------------------------------------------------------- */

type PendingProjectAction = {
  intent: "CREATE_PROJECT";
  projectName: string;
};

/* -------------------------------------------------------------------------- */
/* PENDING TASK UPDATE                                                        */
/* -------------------------------------------------------------------------- */

type TaskUpdateField =
  | "status"
  | "priority"
  | "assignee"
  | "project"
  | "department"
  | "dueDate";

type PendingTaskUpdateAction = {
  intent: "UPDATE_TASK";
  taskId: number;
  field: TaskUpdateField;
  value: string | number | null;
  displayValue: string;
  oldValue: string;
  personId?: number;
  personName?: string;
  projectId?: number;
  projectName?: string;
  departmentId?: number;
  departmentName?: string;
};

/* -------------------------------------------------------------------------- */
/* PENDING PERSON UPDATE                                                      */
/* -------------------------------------------------------------------------- */

type PersonUpdateField =
  | "skills_add"
  | "skills_remove"
  | "department"
  | "availability"
  | "active";

type PendingPersonUpdateAction = {
  intent: "UPDATE_PERSON";
  personId: number;
  personName: string;
  field: PersonUpdateField;
  value: string | number | boolean;
  displayValue: string;
  oldValue: string;
  skillId?: number;
  skillName?: string;
  departmentId?: number;
  departmentName?: string;
};

/* -------------------------------------------------------------------------- */
/* PENDING ACTION MAPS                                                        */
/* -------------------------------------------------------------------------- */

const pendingPersonActions = new Map<
  string,
  PendingPersonAction
>();

const pendingTaskActions = new Map<
  string,
  PendingTaskAction
>();

const pendingProjectActions = new Map<
  string,
  PendingProjectAction
>();

type ProjectUpdateField =
  | "status"
  | "dueDate"
  | "manager";

type PendingProjectUpdateAction = {
  intent: "UPDATE_PROJECT";
  projectId: number;
  field: ProjectUpdateField;
  value: string | number | null;
  displayValue: string;
  oldValue: string;
  personId?: number;
  personName?: string;
};

type PendingProjectMemberAction = {
  intent: "UPDATE_PROJECT_MEMBER";
  projectId: number;
  personId: number;
  projectName: string;
  personName: string;
  operation: "ADD" | "REMOVE";
};

const pendingProjectUpdateActions = new Map<
  string,
  PendingProjectUpdateAction
>();

const pendingProjectMemberActions = new Map<
  string,
  PendingProjectMemberAction
>();

const pendingTaskUpdateActions = new Map<
  string,
  PendingTaskUpdateAction
>();

const pendingPersonUpdateActions = new Map<
  string,
  PendingPersonUpdateAction
>();

/* -------------------------------------------------------------------------- */
/* CONVERSATION KEY                                                           */
/* -------------------------------------------------------------------------- */

function getConversationKey(req: Request): string {
  return (
    normalizeText(req.body?.conversationId) ||
    normalizeText(req.headers["x-conversation-id"]) ||
    "default"
  );
}

/* -------------------------------------------------------------------------- */
/* PERSON CREATION HELPERS                                                    */
/* -------------------------------------------------------------------------- */

function isPersonCreationRequest(message: string): boolean {
  const text = message.toLowerCase();

  const personWords = [
    "person",
    "people",
    "team member",
    "member",
    "employee",
    "developer",
    "designer",
    "tester",
    "hire",
  ];

  const creationWords = [
    "add",
    "create",
    "register",
    "onboard",
  ];

  return (
    creationWords.some((word) => text.includes(word)) &&
    personWords.some((word) => text.includes(word))
  );
}

function extractPersonName(message: string): string | null {
  const patterns = [
    /\badd\s+([a-zA-Z][a-zA-Z\s'-]{1,50}?)(?:\s+in\s+(?:people|team)|\s+to\s+(?:people|team)|\s*)$/i,
    /\bcreate\s+(?:a\s+)?(?:person|team member)\s+(?:named\s+)?([a-zA-Z][a-zA-Z\s'-]{1,50})/i,
    /\badd\s+(?:a\s+)?(?:person|team member)\s+(?:named\s+)?([a-zA-Z][a-zA-Z\s'-]{1,50})/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function isAutoFillPersonRequest(message: string): boolean {
  const text = message.toLowerCase();

  return (
    text.includes("fill") ||
    text.includes("fill the other") ||
    text.includes("fill requirements") ||
    text.includes("fill the requirements") ||
    text.includes("by yourself") ||
    text.includes("test the page") ||
    text.includes("use your own") ||
    text.includes("make up")
  );
}

async function createPersonThroughAPI(
  data: PendingPersonAction["data"]
) {
  const response = await fetch(
    `http://localhost:${PORT}/api/people`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName: data?.fullName,
        email: data?.email,
        phone: data?.phone || undefined,
        location: data?.location || undefined,
        departmentId: data?.departmentId,
        jobTitle: data?.jobTitle,
        role: data?.role,
        experience: data?.experience,
        employmentType: data?.employmentType,
        availability: data?.availability,
        bio: data?.bio,
        notes: data?.notes,
        preferredTaskTypes: data?.preferredTaskTypes,
        skillIds: data?.skillIds || [],
      }),
    }
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success) {
    throw new Error(
      payload?.message ||
        payload?.error ||
        "Unable to create the team member."
    );
  }

  return payload.data;
}

/* -------------------------------------------------------------------------- */
/* PERSON SEARCH                                                              */
/* -------------------------------------------------------------------------- */

async function findPersonByName(
  personName: string,
  includeInactive = false
) {
  const normalized = personName.trim().toLowerCase();

  const people = await prisma.person.findMany({
    where: includeInactive
      ? undefined
      : {
          isActive: true,
        },
    orderBy: {
      fullName: "asc",
    },
  });

  return (
    people.find(
      (person) =>
        person.fullName.trim().toLowerCase() === normalized
    ) ||
    people.find((person) =>
      person.fullName.toLowerCase().includes(normalized)
    ) ||
    null
  );
}

/* -------------------------------------------------------------------------- */
/* PERSON QUERY DETECTION                                                     */
/* -------------------------------------------------------------------------- */

function isAllPeopleQueryRequest(message: string): boolean {
  const text = message
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const normalized = text
    .replace(/^[?!.]+|[?!.]+$/g, "")
    .trim();

  const patterns = [
    /^(?:show|list|display) (?:me |us )?(?:our |the |all )?(?:team )?(?:members|people|employees|staff)$/,
    /^(?:show|list|display) (?:me |us )?(?:all )?(?:the )?(?:team )?(?:members|people|employees|staff)$/,
    /^(?:who are|who is) (?:all )?(?:our |the )?(?:team )?(?:members|people|employees|staff)$/,
    /^(?:who are|who is) (?:all )?(?:the )?(?:members|people|employees|staff) (?:on|in) (?:the )?team$/,
    /^(?:show|list|display) (?:all )?(?:the )?(?:members|people|employees|staff) (?:present )?(?:in|on) (?:the )?team$/,
    /^(?:show|list|display) (?:all )?(?:the )?(?:team )?(?:members|people|employees|staff) (?:present|available)$/,
  ];

  return patterns.some((pattern) => pattern.test(normalized));
}

function isTeamSkillsQueryRequest(message: string): boolean {
  const text = message
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    /\b(?:show|list|display|give|tell)(?:\s+me)?\s+(?:our|the)?\s*team(?:'s|’s)?\s+skills\b/i,
    /\bwhat\s+skills\s+(?:does|do)\s+(?:our|the)\s+team\s+have\b/i,
    /\bwhat\s+are\s+(?:our|the)\s+team(?:'s|’s)?\s+skills\b/i,
    /\bskills\s+(?:of|for)\s+(?:our|the)\s+team\b/i,
    /\b(?:our|the)\s+team(?:'s|’s)?\s+skills\b/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function isPersonQueryRequest(message: string): boolean {
  const text = message
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (isPersonCreationRequest(message)) {
    return false;
  }

  if (isTeamSkillsQueryRequest(message)) {
    return false;
  }

  if (isAvailabilityRequest(message) && !extractTaskId(message)) {
    return false;
  }

  if (isAssignmentRequest(message)) {
    return false;
  }

  if (isTaskUpdateRequest(message)) {
    return false;
  }

  const personWords = [
    "person",
    "people",
    "team",
    "team member",
    "team members",
    "employee",
    "employees",
    "developer",
    "developers",
    "member",
    "members",
  ];

  const queryWords = [
    "show",
    "list",
    "details",
    "detail",
    "information",
    "info",
    "who",
    "which",
    "what",
    "how many",
    "skills",
    "skill",
    "department",
    "works",
    "working",
    "has",
    "have",
  ];

  return (
    personWords.some((word) => text.includes(word)) &&
    queryWords.some((word) => text.includes(word))
  );
}

/* -------------------------------------------------------------------------- */
/* PERSON NAME EXTRACTION FOR QUERIES                                         */
/* -------------------------------------------------------------------------- */

function extractPersonQueryName(
  message: string
): string | null {
  const patterns = [
    /\b(?:details|detail|information|info)\s+(?:of|about|for)\s+(.+?)(?:\?|$)/i,
    /\b(?:show|tell me about)\s+(?:(?:me|us)\s+)?(?:(?:our|the|all)\s+)?(.+?)(?:'s|\s+details|\s+information)?(?:\?|$)/i,
    /\bwhat\s+skills\s+(?:does|do)\s+(.+?)\s+have(?:\?|$)/i,
    /\bwhich\s+department\s+is\s+(.+?)\s+in(?:\?|$)/i,
    /\bwho\s+works\s+in\s+(.+?)(?:\?|$)/i,
    /\bteam\s+members\s+in\s+(.+?)(?:\?|$)/i,
    /\bpeople\s+in\s+(.+?)(?:\?|$)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match?.[1]) {
      return match[1]
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/['’]s$/i, "")
        .replace(/[?!.]+$/, "")
        .trim();
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* SKILL EXTRACTION FOR PERSON OPERATIONS                                     */
/* -------------------------------------------------------------------------- */

function extractPersonSkillName(
  message: string
): string | null {
  const patterns = [
    /\badd\s+(.+?)\s+to\s+(.+?)['’]?s?\s+skills(?:\?|$)/i,
    /\bremove\s+(.+?)\s+from\s+(.+?)['’]?s?\s+skills(?:\?|$)/i,
    /\badd\s+skill\s+(.+?)\s+to\s+(.+?)(?:\?|$)/i,
    /\bremove\s+skill\s+(.+?)\s+from\s+(.+?)(?:\?|$)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match?.[1]) {
      return match[1]
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/[?!.]+$/, "")
        .trim();
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* PERSON NAME EXTRACTION FOR UPDATES                                         */
/* -------------------------------------------------------------------------- */

function extractPersonUpdateName(
  message: string
): string | null {
  const patterns = [
    /\badd\s+.+?\s+to\s+(.+?)['’]?s?\s+skills(?:\?|$)/i,
    /\bremove\s+.+?\s+from\s+(.+?)['’]?s?\s+skills(?:\?|$)/i,
    /\bchange\s+(.+?)['’]?s?\s+department\s+to\s+.+?(?:\?|$)/i,
    /\bset\s+(.+?)['’]?s?\s+department\s+to\s+.+?(?:\?|$)/i,
    /\bupdate\s+(.+?)['’]?s?\s+department\s+to\s+.+?(?:\?|$)/i,
    /\bmark\s+(.+?)\s+as\s+(?:available|unavailable|busy|on leave|partially available)(?:\?|$)/i,
    /\bmake\s+(.+?)\s+(?:available|unavailable|inactive|active)(?:\?|$)/i,
    /\bdeactivate\s+(.+?)(?:\?|$)/i,
    /\bactivate\s+(.+?)(?:\?|$)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match?.[1]) {
      return match[1]
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/['’]s$/i, "")
        .replace(/[?!.]+$/, "")
        .trim();
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* PERSON UPDATE DETECTION                                                    */
/* -------------------------------------------------------------------------- */

function isPersonUpdateRequest(message: string): boolean {
  const text = message
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (isPersonCreationRequest(message)) {
    return false;
  }

  const updatePatterns = [
    /\badd\s+.+?\s+to\s+.+?['’]?s?\s+skills\b/i,
    /\bremove\s+.+?\s+from\s+.+?['’]?s?\s+skills\b/i,
    /\bchange\s+.+?['’]?s?\s+department\s+to\b/i,
    /\bset\s+.+?['’]?s?\s+department\s+to\b/i,
    /\bupdate\s+.+?['’]?s?\s+department\s+to\b/i,
    /\bmark\s+.+?\s+as\s+(?:available|unavailable|busy|on leave|partially available)\b/i,
    /\bmake\s+.+?\s+(?:available|unavailable|inactive|active)\b/i,
    /\bdeactivate\s+.+/i,
    /\bactivate\s+.+/i,
  ];

  return updatePatterns.some((pattern) =>
    pattern.test(text)
  );
}

/* -------------------------------------------------------------------------- */
/* FIND SKILL                                                                 */
/* -------------------------------------------------------------------------- */

async function findSkillByName(skillName: string) {
  const normalized = skillName.trim().toLowerCase();

  const skills = await prisma.skill.findMany({
    orderBy: {
      name: "asc",
    },
  });

  return (
    skills.find(
      (skill) =>
        skill.name.trim().toLowerCase() === normalized
    ) ||
    skills.find((skill) =>
      skill.name.toLowerCase().includes(normalized)
    ) ||
    null
  );
}

/* -------------------------------------------------------------------------- */
/* PERSON UPDATE PREPARATION                                                  */
/* -------------------------------------------------------------------------- */

async function preparePersonUpdate(
  message: string
): Promise<PendingPersonUpdateAction> {
  const personName =
    extractPersonUpdateName(message);

  if (!personName) {
    throw new Error(
      "Please provide the team member's name."
    );
  }

  const person = await findPersonByName(personName);

  if (!person) {
    throw new Error(
      `I couldn't find an active team member named **${personName}**.`
    );
  }

  const text = message.toLowerCase();

  /* ---------------------------------------------------------------------- */
  /* ADD SKILL                                                              */
  /* ---------------------------------------------------------------------- */

  if (
    /\badd\s+.+?\s+to\s+.+?['’]?s?\s+skills\b/i.test(text)
  ) {
    const skillName =
      extractPersonSkillName(message);

    if (!skillName) {
      throw new Error(
        "Please provide the skill you want to add."
      );
    }

    const skill =
      await findSkillByName(skillName);

    if (!skill) {
      throw new Error(
        `I couldn't find a skill named **${skillName}** in the skill catalog.`
      );
    }

    const existingRelation =
      await prisma.personSkill.findUnique({
        where: {
          personId_skillId: {
            personId: person.id,
            skillId: skill.id,
          },
        },
      });

    if (existingRelation) {
      throw new Error(
        `**${person.fullName}** already has the **${skill.name}** skill.`
      );
    }

    const currentSkills =
      await prisma.personSkill.findMany({
        where: {
          personId: person.id,
        },
        include: {
          skill: true,
        },
      });

    const currentSkillText =
      currentSkills.length > 0
        ? currentSkills
            .map((item) => item.skill.name)
            .join(", ")
        : "No skills";

    return {
      intent: "UPDATE_PERSON",
      personId: person.id,
      personName: person.fullName,
      field: "skills_add",
      value: skill.id,
      displayValue: skill.name,
      oldValue: currentSkillText,
      skillId: skill.id,
      skillName: skill.name,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* REMOVE SKILL                                                           */
  /* ---------------------------------------------------------------------- */

  if (
    /\bremove\s+.+?\s+from\s+.+?['’]?s?\s+skills\b/i.test(text)
  ) {
    const skillName =
      extractPersonSkillName(message);

    if (!skillName) {
      throw new Error(
        "Please provide the skill you want to remove."
      );
    }

    const skill =
      await findSkillByName(skillName);

    if (!skill) {
      throw new Error(
        `I couldn't find a skill named **${skillName}**.`
      );
    }

    const existingRelation =
      await prisma.personSkill.findUnique({
        where: {
          personId_skillId: {
            personId: person.id,
            skillId: skill.id,
          },
        },
      });

    if (!existingRelation) {
      throw new Error(
        `**${person.fullName}** does not currently have the **${skill.name}** skill.`
      );
    }

    const currentSkills =
      await prisma.personSkill.findMany({
        where: {
          personId: person.id,
        },
        include: {
          skill: true,
        },
      });

    const currentSkillText =
      currentSkills.length > 0
        ? currentSkills
            .map((item) => item.skill.name)
            .join(", ")
        : "No skills";

    return {
      intent: "UPDATE_PERSON",
      personId: person.id,
      personName: person.fullName,
      field: "skills_remove",
      value: skill.id,
      displayValue: skill.name,
      oldValue: currentSkillText,
      skillId: skill.id,
      skillName: skill.name,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* DEPARTMENT                                                             */
  /* ---------------------------------------------------------------------- */

  if (
    text.includes("department")
  ) {
    const patterns = [
      /\bchange\s+.+?['’]?s?\s+department\s+to\s+(.+?)(?:\?|$)/i,
      /\bset\s+.+?['’]?s?\s+department\s+to\s+(.+?)(?:\?|$)/i,
      /\bupdate\s+.+?['’]?s?\s+department\s+to\s+(.+?)(?:\?|$)/i,
    ];

    let departmentName: string | null = null;

    for (const pattern of patterns) {
      const match = message.match(pattern);

      if (match?.[1]) {
        departmentName = match[1]
          .trim()
          .replace(/[?!.]+$/, "")
          .trim();
        break;
      }
    }

    if (!departmentName) {
      throw new Error(
        "Please provide the new department name."
      );
    }

    const department =
      await findDepartmentByName(
        departmentName
      );

    if (!department) {
      throw new Error(
        `I couldn't find a department matching **${departmentName}**.`
      );
    }

    return {
      intent: "UPDATE_PERSON",
      personId: person.id,
      personName: person.fullName,
      field: "department",
      value: department.id,
      displayValue: department.name,
      oldValue:
        person.departmentId
          ? (
              await prisma.department.findUnique({
                where: {
                  id: person.departmentId,
                },
              })
            )?.name || "No department"
          : "No department",
      departmentId: department.id,
      departmentName: department.name,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* AVAILABILITY                                                            */
  /* ---------------------------------------------------------------------- */

  const availabilityMap: Array<{
    pattern: RegExp;
    value: Availability;
  }> = [
    {
      pattern:
        /\b(?:mark|make)\s+.+?\s+as\s+available\b/i,
      value: "AVAILABLE",
    },
    {
      pattern:
        /\b(?:mark|make)\s+.+?\s+as\s+unavailable\b/i,
      value: "INACTIVE",
    },
    {
      pattern:
        /\b(?:mark|make)\s+.+?\s+as\s+busy\b/i,
      value: "BUSY",
    },
    {
      pattern:
        /\b(?:mark|make)\s+.+?\s+as\s+on\s+leave\b/i,
      value: "ON_LEAVE",
    },
    {
      pattern:
        /\b(?:mark|make)\s+.+?\s+as\s+partially\s+available\b/i,
      value: "PARTIALLY_AVAILABLE",
    },
    {
      pattern:
        /\bmake\s+.+?\s+available\b/i,
      value: "AVAILABLE",
    },
    {
      pattern:
        /\bmake\s+.+?\s+unavailable\b/i,
      value: "INACTIVE",
    },
  ];

  for (const item of availabilityMap) {
    if (item.pattern.test(message)) {
      return {
        intent: "UPDATE_PERSON",
        personId: person.id,
        personName: person.fullName,
        field: "availability",
        value: item.value,
        displayValue: item.value,
        oldValue: person.availability,
      };
    }
  }

  /* ---------------------------------------------------------------------- */
  /* ACTIVE / INACTIVE                                                       */
  /* ---------------------------------------------------------------------- */

  if (
    /\bdeactivate\s+/i.test(text) ||
    /\bmake\s+.+?\s+inactive\b/i.test(text)
  ) {
    return {
      intent: "UPDATE_PERSON",
      personId: person.id,
      personName: person.fullName,
      field: "active",
      value: false,
      displayValue: "Inactive",
      oldValue: person.isActive
        ? "Active"
        : "Inactive",
    };
  }

  if (
    /\bactivate\s+/i.test(text) ||
    /\bmake\s+.+?\s+active\b/i.test(text)
  ) {
    return {
      intent: "UPDATE_PERSON",
      personId: person.id,
      personName: person.fullName,
      field: "active",
      value: true,
      displayValue: "Active",
      oldValue: person.isActive
        ? "Active"
        : "Inactive",
    };
  }

  throw new Error(
    "I couldn't determine which team member field you want to update."
  );
}

/* -------------------------------------------------------------------------- */
/* APPLY PERSON UPDATE                                                        */
/* -------------------------------------------------------------------------- */

async function applyPersonUpdate(
  action: PendingPersonUpdateAction
) {
  const person =
    await prisma.person.findUnique({
      where: {
        id: action.personId,
      },
    });

  if (!person) {
    throw new Error(
      `Team member #${action.personId} no longer exists.`
    );
  }

  let updatedPerson;

  /* ---------------------------------------------------------------------- */
  /* ADD SKILL                                                              */
  /* ---------------------------------------------------------------------- */

  if (
    action.field === "skills_add"
  ) {
    if (!action.skillId) {
      throw new Error(
        "No skill was selected."
      );
    }

    await prisma.personSkill.create({
      data: {
        personId: action.personId,
        skillId: action.skillId,
      },
    });

    updatedPerson =
      await prisma.person.findUnique({
        where: {
          id: action.personId,
        },
        include: {
          department: true,
          skills: {
            include: {
              skill: true,
            },
          },
        },
      });
  }

  /* ---------------------------------------------------------------------- */
  /* REMOVE SKILL                                                           */
  /* ---------------------------------------------------------------------- */

  else if (
    action.field === "skills_remove"
  ) {
    if (!action.skillId) {
      throw new Error(
        "No skill was selected."
      );
    }

    await prisma.personSkill.delete({
      where: {
        personId_skillId: {
          personId: action.personId,
          skillId: action.skillId,
        },
      },
    });

    updatedPerson =
      await prisma.person.findUnique({
        where: {
          id: action.personId,
        },
        include: {
          department: true,
          skills: {
            include: {
              skill: true,
            },
          },
        },
      });
  }

  /* ---------------------------------------------------------------------- */
  /* DEPARTMENT                                                             */
  /* ---------------------------------------------------------------------- */

  else if (
    action.field === "department"
  ) {
    updatedPerson =
      await prisma.person.update({
        where: {
          id: action.personId,
        },
        data: {
          departmentId:
            action.departmentId ??
            null,
        },
        include: {
          department: true,
          skills: {
            include: {
              skill: true,
            },
          },
        },
      });
  }

  /* ---------------------------------------------------------------------- */
  /* AVAILABILITY                                                           */
  /* ---------------------------------------------------------------------- */

  else if (
    action.field === "availability"
  ) {
    updatedPerson =
      await prisma.person.update({
        where: {
          id: action.personId,
        },
        data: {
          availability:
            String(
              action.value
            ) as Availability,
        },
        include: {
          department: true,
          skills: {
            include: {
              skill: true,
            },
          },
        },
      });
  }

  /* ---------------------------------------------------------------------- */
  /* ACTIVE                                                                  */
  /* ---------------------------------------------------------------------- */

  else if (
    action.field === "active"
  ) {
    updatedPerson =
      await prisma.person.update({
        where: {
          id: action.personId,
        },
        data: {
          isActive:
            Boolean(action.value),
        },
        include: {
          department: true,
          skills: {
            include: {
              skill: true,
            },
          },
        },
      });
  }

  else {
    throw new Error(
      "Unsupported person update."
    );
  }

  /* ---------------------------------------------------------------------- */
  /* ACTIVITY LOG                                                           */
  /* ---------------------------------------------------------------------- */

  await prisma.activityLog.create({
    data: {
      action: "PERSON_UPDATED",
      entity: "Person",
      details:
        `Person ${person.fullName} ${action.field} changed from "${action.oldValue}" to "${action.displayValue}" through AI`,
      personId: person.id,
      isAI: true,
      aiReason:
        "Team member information was updated through the AI Task Bot.",
    },
  });

  return updatedPerson;
}

/* -------------------------------------------------------------------------- */
/* FORMAT PERSON UPDATE PREVIEW                                               */
/* -------------------------------------------------------------------------- */

function formatPersonUpdatePreview(
  action: PendingPersonUpdateAction
): string {
  const labels: Record<
    PersonUpdateField,
    string
  > = {
    skills_add: "Add Skill",
    skills_remove: "Remove Skill",
    department: "Department",
    availability: "Availability",
    active: "Account Status",
  };

  return [
    `### ✏️ Update Team Member`,
    "",
    `I can update **${action.personName}**.`,
    "",
    "| Field | Current | New |",
    "| --- | --- | --- |",
    `| ${labels[action.field]} | ${action.oldValue} | ${action.displayValue} |`,
    "",
    "This is a preview only — **no changes have been made yet**.",
    "",
    "Would you like me to apply this change?",
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* PERSON DETAILS                                                             */
/* -------------------------------------------------------------------------- */

async function getPersonDetails(
  personId: number
) {
  return prisma.person.findUnique({
    where: {
      id: personId,
    },
    include: {
      department: true,
      skills: {
        include: {
          skill: true,
        },
      },
      assignedTasks: {
        include: {
          task: true,
        },
      },
      managedProjects: true,
      projectMembers: {
        include: {
          project: true,
        },
      },
    },
  });
}

function formatPersonDetails(
  person: any
): string {
  const skills =
    person.skills?.length > 0
      ? person.skills
          .map(
            (item: any) =>
              item.skill.name
          )
          .join(", ")
      : "None";

  const activeTasks =
    person.assignedTasks?.filter(
      (assignment: any) =>
        assignment.task.status !==
        "COMPLETED"
    ).length || 0;

  const projects =
    person.projectMembers?.length > 0
      ? person.projectMembers
          .map(
            (member: any) =>
              member.project.name
          )
          .join(", ")
      : "None";

  return [
    `### 👤 ${person.fullName}`,
    "",
    "| Team Member Information | Value |",
    "| --- | --- |",
    `| ID | ${person.id} |`,
    `| Name | ${person.fullName} |`,
    `| Email | ${person.email} |`,
    `| Phone | ${person.phone || "Not specified"} |`,
    `| Location | ${person.location || "Not specified"} |`,
    `| Job Title | ${person.jobTitle || "Not specified"} |`,
    `| Role | ${person.role || "Not specified"} |`,
    `| Department | ${person.department?.name || "Not specified"} |`,
    `| Experience | ${person.experience} year(s) |`,
    `| Employment Type | ${person.employmentType} |`,
    `| Availability | ${person.availability} |`,
    `| Account Status | ${person.isActive ? "Active" : "Inactive"} |`,
    `| Skills | ${skills} |`,
    `| Active Tasks | ${activeTasks} |`,
    `| Projects | ${projects} |`,
    `| Preferred Task Types | ${person.preferredTaskTypes || "Not specified"} |`,
    `| Bio | ${person.bio || "Not specified"} |`,
    `| Notes | ${person.notes || "Not specified"} |`,
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* PROJECT CREATION HELPERS                                                   */
/* -------------------------------------------------------------------------- */

function isProjectCreationRequest(
  message: string
): boolean {
  const text = message
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    /\bcreate\s+(?:a\s+)?project\b/i,
    /\badd\s+(?:a\s+)?project\b/i,
    /\bmake\s+(?:a\s+)?project\b/i,
    /\bnew\s+project\s+(?:called|named|titled)\b/i,
  ];

  return patterns.some((pattern) =>
    pattern.test(text)
  );
}

function extractProjectCreationName(
  message: string
): string | null {
  const patterns = [
    /\bcreate\s+(?:a\s+)?project\s+(?:called|named|titled)\s+["']?(.+?)["']?$/i,
    /\badd\s+(?:a\s+)?project\s+(?:called|named|titled)\s+["']?(.+?)["']?$/i,
    /\bmake\s+(?:a\s+)?project\s+(?:called|named|titled)\s+["']?(.+?)["']?$/i,
    /\bnew\s+project\s+(?:called|named|titled)\s+["']?(.+?)["']?$/i,
    /\bcreate\s+(?:a\s+)?project\s*[:\-]\s*["']?(.+?)["']?$/i,
    /\badd\s+(?:a\s+)?project\s*[:\-]\s*["']?(.+?)["']?$/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match?.[1]) {
      const name = match[1]
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/[.!?]+$/, "")
        .trim();

      if (name) {
        return name;
      }
    }
  }

  return null;
}

async function findProjectExactByName(
  projectName: string
) {
  const normalized =
    projectName.trim().toLowerCase();

  const projects =
    await prisma.project.findMany({
      orderBy: {
        name: "asc",
      },
    });

  return (
    projects.find(
      (project) =>
        project.name.trim().toLowerCase() ===
        normalized
    ) || null
  );
}

async function findProjectByName(
  projectName: string
) {
  const normalized =
    projectName.trim().toLowerCase();

  const projects =
    await prisma.project.findMany({
      orderBy: {
        name: "asc",
      },
    });

  return (
    projects.find(
      (project) =>
        project.name.trim().toLowerCase() ===
        normalized
    ) ||
    projects.find((project) =>
      project.name
        .toLowerCase()
        .includes(normalized)
    ) ||
    null
  );
}

async function createProject(
  projectName: string
) {
  const existingProject =
    await findProjectExactByName(
      projectName
    );

  if (existingProject) {
    return {
      created: false,
      project: existingProject,
    };
  }

  const project =
    await prisma.project.create({
      data: {
        name: projectName.trim(),
      },
    });

  return {
    created: true,
    project,
  };
}

/* -------------------------------------------------------------------------- */
/* PROJECT MANAGEMENT HELPERS                                                 */
/* -------------------------------------------------------------------------- */

function isProjectUpdateRequest(message: string): boolean {
  const text = message.toLowerCase().replace(/\s+/g, " ").trim();

  if (isProjectCreationRequest(message)) {
    return false;
  }

  return [
    /\b(change|update|set|make|put)\b.+\b(status|state)\b.+/i,
    /\b(status|state)\b.+\b(to|as)\b.+/i,
    /\bput\b.+\bon hold\b/i,
    /\b(change|update|set)\b.+\bdue date\b.+/i,
    /\bset\b.+\bdue\b.+/i,
    /\b(change|update|set)\b.+\b(manager|project manager)\b.+/i,
    /\bset\b.+\bas manager of\b/i,
  ].some((pattern) => pattern.test(text));
}

function isProjectMemberRequest(message: string): boolean {
  const text = message.toLowerCase().replace(/\s+/g, " ").trim();

  if (
    isProjectCreationRequest(message) ||
    isTaskCreationRequest(message) ||
    isTaskUpdateRequest(message) ||
    isPersonCreationRequest(message) ||
    /\bskills?\b/i.test(text)
  ) {
    return false;
  }

  const patterns = [
    /\badd\b.+\b(?:to|into)\b(?:\s+the)?\s+(?:project\s+)?[^?!.]+(?:\s+project)?[?!.]?$/i,
    /\badd\b.+\bas\s+(?:a\s+)?member\s+of\b.+$/i,
    /\bremove\b.+\bfrom\b(?:\s+the)?\s+(?:project\s+)?[^?!.]+(?:\s+project)?[?!.]?$/i,
    /\bremove\b.+\bas\s+(?:a\s+)?member\s+of\b.+$/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function isProjectManagerQueryRequest(message: string): boolean {
  const text = message.toLowerCase().replace(/\s+/g, " ").trim();
  return /\bwho\s+(?:is\s+)?(?:the\s+)?manager\s+(?:of|for)\b/i.test(text) ||
    /\bwho\s+manages\b/i.test(text) ||
    /\bproject\s+manager\s+(?:of|for)\b/i.test(text);
}

function isProjectMemberQueryRequest(message: string): boolean {
  const text = message.toLowerCase().replace(/\s+/g, " ").trim();
  return /\b(?:show|list|get|who\s+are)\b.+\b(?:members|team members)\b.+/i.test(text) ||
    /\bmembers\s+(?:of|for)\b/i.test(text) ||
    /\bteam\s+members\s+(?:of|for)\b/i.test(text);
}

function extractProjectManagementName(message: string): string | null {
  const patterns = [
    /\b(?:change|update|set)\s+(.+?)\s+(?:status|state)\s+to\s+/i,
    /\b(?:status|state)\s+of\s+(.+?)\s+to\s+/i,
    /\bput\s+(.+?)\s+on\s+hold\b/i,
    /\b(?:change|update|set)\s+(.+?)\s+due\s+date\s+to\s+/i,
    /\b(?:change|update|set)\s+(?:the\s+)?manager\s+of\s+(.+?)\s+to\s+/i,
    /\bset\s+(.+?)\s+as\s+manager\s+of\s+(.+?)(?:\?|$)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const value = match[2] || match[1];
      return value
        .trim()
        .replace(/^the\s+/i, "")
        .replace(/\s+project$/i, "")
        .replace(/^['"]|['"]$/g, "")
        .replace(/[?!.]+$/, "")
        .trim();
    }
  }

  return null;
}

function cleanProjectReference(value: string): string {
  return value
    .trim()
    .replace(/^the\s+/i, "")
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+project$/i, "")
    .replace(/[?!.]+$/, "")
    .trim();
}

function extractProjectMemberParts(
  message: string
): { personName: string; projectName: string } | null {
  const patterns = [
    /\badd\s+(.+?)\s+(?:to|into)\s+(?:the\s+)?(?:project\s+)?(.+?)(?:\s+project)?[?!.]?$/i,
    /\bremove\s+(.+?)\s+from\s+(?:the\s+)?(?:project\s+)?(.+?)(?:\s+project)?[?!.]?$/i,
    /\badd\s+(.+?)\s+as\s+(?:a\s+)?member\s+of\s+(?:the\s+)?(?:project\s+)?(.+?)[?!.]?$/i,
    /\bremove\s+(.+?)\s+as\s+(?:a\s+)?member\s+of\s+(?:the\s+)?(?:project\s+)?(.+?)[?!.]?$/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1] && match?.[2]) {
      const personName = cleanProjectReference(match[1]);
      const projectName = cleanProjectReference(match[2]);
      if (personName && projectName) {
        return { personName, projectName };
      }
    }
  }

  return null;
}

function extractProjectMemberPersonName(message: string): string | null {
  return extractProjectMemberParts(message)?.personName || null;
}

function extractProjectMemberProjectName(message: string): string | null {
  return extractProjectMemberParts(message)?.projectName || null;
}

function extractProjectManagerPersonName(message: string): string | null {
  const patterns = [
    /\b(?:change|update|set)\s+(?:the\s+)?manager\s+of\s+.+?\s+to\s+(.+?)(?:\?|$)/i,
    /\bset\s+(.+?)\s+as\s+(?:the\s+)?manager\s+of\s+.+?(?:\?|$)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1]
        .trim()
        .replace(/^['"]|['"]$/g, "")
        .replace(/[?!.]+$/, "")
        .trim();
    }
  }

  return null;
}

function extractProjectStatus(message: string): ProjectStatus | null {
  const text = message.toLowerCase();

  if (/\b(on hold|hold)\b/i.test(text)) return "ON_HOLD";
  if (/\bplanning\b/i.test(text)) return "PLANNING";
  if (/\bactive\b/i.test(text)) return "ACTIVE";
  if (/\bcompleted\b/i.test(text)) return "COMPLETED";
  if (/\bcancelled\b|\bcanceled\b/i.test(text)) return "CANCELLED";

  return null;
}

function extractProjectDueDate(message: string): Date | null {
  const patterns = [
    /\bdue\s+date\s+(?:to|as)\s+(.+?)(?:\?|$)/i,
    /\bdue\s+(?:to|on)\s+(.+?)(?:\?|$)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const raw = match[1].trim().replace(/[?!.]+$/, "").trim();
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }

  return null;
}

function formatProjectDate(value: Date | null | undefined): string {
  return value ? new Date(value).toLocaleDateString() : "Not specified";
}

async function getProjectForManagement(projectId: number) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      manager: true,
      members: {
        include: { person: true },
      },
    },
  });
}

async function prepareProjectUpdate(
  message: string
): Promise<PendingProjectUpdateAction> {
  const projectName = extractProjectManagementName(message);

  if (!projectName) {
    throw new Error("Please provide the project name.");
  }

  const project = await findProjectByName(projectName);

  if (!project) {
    throw new Error(`I couldn't find a project matching **${projectName}**.`);
  }

  const text = message.toLowerCase();

  if (text.includes("manager") && !/\bwho\b/i.test(text)) {
    const personName = extractProjectManagerPersonName(message);
    if (!personName) {
      throw new Error("Please provide the team member who should manage the project.");
    }

    const person = await findPersonByName(personName);
    if (!person) {
      throw new Error(`I couldn't find an active team member named **${personName}**.`);
    }

    return {
      intent: "UPDATE_PROJECT",
      projectId: project.id,
      field: "manager",
      value: person.id,
      displayValue: person.fullName,
      oldValue: project.managerId
        ? ((await prisma.person.findUnique({
            where: { id: project.managerId },
          }))?.fullName || "No manager assigned")
        : "No manager assigned",
      personId: person.id,
      personName: person.fullName,
    };
  }

  const status = extractProjectStatus(message);
  if (status) {
    return {
      intent: "UPDATE_PROJECT",
      projectId: project.id,
      field: "status",
      value: status,
      displayValue: status,
      oldValue: project.status,
    };
  }

  if (text.includes("due")) {
    const dueDate = extractProjectDueDate(message);
    if (!dueDate) {
      throw new Error("Please provide a valid project due date, for example: September 30, 2026.");
    }

    return {
      intent: "UPDATE_PROJECT",
      projectId: project.id,
      field: "dueDate",
      value: dueDate.toISOString(),
      displayValue: dueDate.toLocaleDateString(),
      oldValue: formatProjectDate(project.dueDate),
    };
  }

  throw new Error("I couldn't determine which project field you want to update.");
}

async function applyProjectUpdate(action: PendingProjectUpdateAction) {
  const project = await getProjectForManagement(action.projectId);
  if (!project) {
    throw new Error(`Project #${action.projectId} no longer exists.`);
  }

  let updatedProject;

  if (action.field === "status") {
    updatedProject = await prisma.project.update({
      where: { id: action.projectId },
      data: { status: String(action.value) as ProjectStatus },
      include: { manager: true, members: { include: { person: true } } },
    });
  } else if (action.field === "dueDate") {
    updatedProject = await prisma.project.update({
      where: { id: action.projectId },
      data: { dueDate: action.value ? new Date(String(action.value)) : null },
      include: { manager: true, members: { include: { person: true } } },
    });
  } else if (action.field === "manager") {
    updatedProject = await prisma.project.update({
      where: { id: action.projectId },
      data: { managerId: action.personId ?? null },
      include: { manager: true, members: { include: { person: true } } },
    });
  } else {
    throw new Error("Unsupported project update.");
  }

  await prisma.activityLog.create({
    data: {
      action: action.field === "manager" ? "PROJECT_MANAGER_UPDATED" : "PROJECT_UPDATED",
      entity: "Project",
      details: `Project ${project.name} ${action.field} changed from "${action.oldValue}" to "${action.displayValue}" through AI`,
      isAI: true,
      aiReason: "Project was updated through the AI Task Bot.",
    },
  });

  return updatedProject;
}

function formatProjectUpdatePreview(action: PendingProjectUpdateAction): string {
  const labels: Record<ProjectUpdateField, string> = {
    status: "Status",
    dueDate: "Due Date",
    manager: "Manager",
  };

  return [
    `### ✏️ Update Project`,
    "",
    `I can update the **${labels[action.field]}** for project **${action.field === "manager" ? "this project" : "the selected project"}**.`,
    "",
    "| Field | Current | New |",
    "| --- | --- | --- |",
    `| ${labels[action.field]} | ${action.oldValue} | ${action.displayValue} |`,
    "",
    "This is a preview only — **no changes have been made yet**.",
    "",
    "Would you like me to apply this change?",
  ].join("\n");
}

async function prepareProjectMemberAction(
  message: string
): Promise<PendingProjectMemberAction> {
  const personName = extractProjectMemberPersonName(message);
  const projectName = extractProjectMemberProjectName(message);

  if (!personName || !projectName) {
    throw new Error("Please provide both the team member and project name.");
  }

  const person = await findPersonByName(personName);
  if (!person) {
    throw new Error(`I couldn't find an active team member named **${personName}**.`);
  }

  const project = await findProjectByName(projectName);
  if (!project) {
    throw new Error(`I couldn't find a project matching **${projectName}**.`);
  }

  const operation: "ADD" | "REMOVE" = /\bremove\b/i.test(message) ? "REMOVE" : "ADD";
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_personId: { projectId: project.id, personId: person.id } },
  });

  if (operation === "ADD" && existing) {
    throw new Error(`**${person.fullName}** is already a member of **${project.name}**.`);
  }

  if (operation === "REMOVE" && !existing) {
    throw new Error(`**${person.fullName}** is not a member of **${project.name}**.`);
  }

  return {
    intent: "UPDATE_PROJECT_MEMBER",
    projectId: project.id,
    personId: person.id,
    projectName: project.name,
    personName: person.fullName,
    operation,
  };
}

async function applyProjectMemberAction(action: PendingProjectMemberAction) {
  if (action.operation === "ADD") {
    await prisma.projectMember.create({
      data: { projectId: action.projectId, personId: action.personId },
    });
  } else {
    await prisma.projectMember.delete({
      where: {
        projectId_personId: {
          projectId: action.projectId,
          personId: action.personId,
        },
      },
    });
  }

  await prisma.activityLog.create({
    data: {
      action: action.operation === "ADD" ? "PROJECT_MEMBER_ADDED" : "PROJECT_MEMBER_REMOVED",
      entity: "Project",
      details: `${action.personName} was ${action.operation === "ADD" ? "added to" : "removed from"} project ${action.projectName} through AI`,
      personId: action.personId,
      isAI: true,
      aiReason: "Project membership was changed through the AI Task Bot.",
    },
  });

  return getProjectForManagement(action.projectId);
}

/* -------------------------------------------------------------------------- */
/* PROJECT QUERY HELPERS                                                      */
/* -------------------------------------------------------------------------- */

function isProjectQueryRequest(
  message: string
): boolean {
  const text = message
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (isProjectCreationRequest(message)) {
    return false;
  }

  if (isProjectUpdateRequest(message) || isProjectMemberRequest(message)) {
    return false;
  }

  const projectWords = [
    "project",
    "projects",
  ];

  const queryWords = [
    "show",
    "list",
    "details",
    "detail",
    "information",
    "info",
    "tasks",
    "task",
    "progress",
    "status",
    "working",
    "members",
    "team",
    "who",
    "how many",
    "what",
  ];

  return (
    projectWords.some((word) =>
      text.includes(word)
    ) &&
    queryWords.some((word) =>
      text.includes(word)
    )
  );
}

function extractProjectQueryName(
  message: string
): string | null {
  const patterns = [
    /\b(?:details|detail|information|info)\s+(?:of|about|for)\s+(.+?)(?:\?|$)/i,
    /\b(?:show|tell me about)\s+(.+?)\s+project(?:\s+details)?(?:\?|$)/i,
    /\b(?:tasks|task)\s+(?:in|for|under)\s+(.+?)(?:\?|$)/i,
    /\b(?:who is working on|who works on|team working on)\s+(.+?)(?:\?|$)/i,
    /\b(?:progress|status)\s+(?:of|for)\s+(.+?)(?:\?|$)/i,
    /\b(?:members|team members)\s+(?:of|for)\s+(.+?)(?:\?|$)/i,
    /\b(?:show|list|get)\s+(?:me\s+)?(?:the\s+)?(?:members|team members)\s+(?:of|for)\s+(.+?)(?:\?|$)/i,
    /\b(?:who)\s+manages\s+(.+?)(?:\?|$)/i,
    /\bwho\s+is\s+(?:the\s+)?manager\s+(?:of|for)\s+(.+?)(?:\?|$)/i,
    /\bproject\s+manager\s+(?:of|for)\s+(.+?)(?:\?|$)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match?.[1]) {
      return match[1]
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/[?!.]+$/, "")
        .trim();
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* TASK CREATION HELPERS                                                      */
/* -------------------------------------------------------------------------- */

function isTaskCreationRequest(
  message: string
): boolean {
  const text = message
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    /\bcreate\s+(?:a\s+)?task\b/i,
    /\badd\s+(?:a\s+)?task\b/i,
    /\bmake\s+(?:a\s+)?task\b/i,
    /\bcreate\s+(?:a\s+)?todo\b/i,
    /\badd\s+(?:a\s+)?todo\b/i,
    /\bcreate\s+(?:a\s+)?to-do\b/i,
    /\badd\s+(?:a\s+)?to-do\b/i,
    /\bcreate\s+(?:a\s+)?work item\b/i,
    /\badd\s+(?:a\s+)?work item\b/i,
    /\bnew\s+task\s+(?:called|named|titled)\b/i,
    /\bnew\s+(?:todo|to-do|work item)\s+(?:called|named|titled)\b/i,
  ];

  return patterns.some((pattern) =>
    pattern.test(text)
  );
}

function extractTaskTitle(
  message: string
): string | null {
  const patterns = [
    /\bcreate\s+(?:a\s+)?task\s+(?:called|named|titled)\s+["']?(.+?)["']?$/i,
    /\bcreate\s+(?:a\s+)?task\s+(?:for|to)\s+["']?([^"'.]+)["']?/i,
    /\badd\s+(?:a\s+)?task\s+(?:called|named|titled)\s+["']?(.+?)["']?$/i,
    /\bcreate\s+["']([^"']+)["']\s+task/i,
    /\bnew\s+task\s+(?:called|named|titled)\s+["']?(.+?)["']?$/i,
    /\bcreate\s+(?:a\s+)?task\s*[:\-]\s*["']?(.+?)["']?$/i,
    /\badd\s+(?:a\s+)?task\s*[:\-]\s*["']?(.+?)["']?$/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match?.[1]) {
      return match[1]
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/[.,!?]+$/, "")
        .trim();
    }
  }

  return null;
}

function extractPriority(
  message: string
): Priority {
  const text =
    message.toLowerCase();

  if (text.includes("urgent")) {
    return "URGENT";
  }

  if (
    text.includes("high priority") ||
    text.includes("priority high")
  ) {
    return "HIGH";
  }

  if (
    text.includes("medium priority") ||
    text.includes("priority medium")
  ) {
    return "MEDIUM";
  }

  if (
    text.includes("low priority") ||
    text.includes("priority low")
  ) {
    return "LOW";
  }

  return "MEDIUM";
}

function extractProjectName(
  message: string
): string | null {
  const patterns = [
    /\bfor\s+the\s+([a-zA-Z0-9][a-zA-Z0-9\s&_-]{1,80}?)\s+project\b/i,
    /\bin\s+the\s+([a-zA-Z0-9][a-zA-Z0-9\s&_-]{1,80}?)\s+project\b/i,
    /\bproject\s*[:\-]\s*([a-zA-Z0-9][a-zA-Z0-9\s&_-]{1,80})/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function extractDepartmentName(
  message: string
): string | null {
  const patterns = [
    /\bfor\s+the\s+([a-zA-Z0-9][a-zA-Z0-9\s&_-]{1,60}?)\s+department\b/i,
    /\bin\s+the\s+([a-zA-Z0-9][a-zA-Z0-9\s&_-]{1,60}?)\s+department\b/i,
    /\bdepartment\s*[:\-]\s*([a-zA-Z0-9][a-zA-Z0-9\s&_-]{1,60})/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function extractRequiredSkillNames(
  message: string
): string[] {
  const knownSkills = [
    "Node.js",
    "Express.js",
    "MongoDB",
    "PostgreSQL",
    "React",
    "Next.js",
    "TypeScript",
    "JavaScript",
    "Tailwind CSS",
    "Docker",
    "Python",
    "Flask",
    "SQL",
    "Prisma",
    "REST API",
  ];

  const found =
    knownSkills.filter((skill) => {
      const escaped = skill.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      return new RegExp(
        `\\b${escaped}\\b`,
        "i"
      ).test(message);
    });

  return [...new Set(found)];
}

async function findDepartmentByName(
  departmentName: string
) {
  const departments =
    await prisma.department.findMany({
      orderBy: {
        name: "asc",
      },
    });

  const normalized =
    departmentName.trim().toLowerCase();

  return (
    departments.find(
      (department) =>
        department.name
          .toLowerCase() ===
        normalized
    ) ||
    departments.find((department) =>
      department.name
        .toLowerCase()
        .includes(normalized)
    ) ||
    null
  );
}

async function findOrCreateSkills(
  skillNames: string[]
) {
  const results: Array<{
    id: number;
    name: string;
  }> = [];

  for (const skillName of skillNames) {
    const normalizedName =
      skillName.trim();

    if (!normalizedName) {
      continue;
    }

    let skill =
      await prisma.skill.findFirst({
        where: {
          name: normalizedName,
        },
      });

    if (!skill) {
      skill =
        await prisma.skill.create({
          data: {
            name: normalizedName,
            description:
              "Created by AI Task Bot because it was required for a task.",
          },
        });
    }

    results.push({
      id: skill.id,
      name: skill.name,
    });
  }

  return results;
}

async function prepareTaskCreation(
  message: string
): Promise<PendingTaskAction["data"]> {
  const title =
    extractTaskTitle(message);

  if (!title) {
    throw new Error(
      "I couldn't determine the task title. Please provide a task name."
    );
  }

  const projectName =
    extractProjectName(message);

  let projectId:
    | number
    | undefined;

  if (projectName) {
    const project =
      await findProjectByName(
        projectName
      );

    if (!project) {
      throw new Error(
        `I couldn't find a project named "${projectName}". Please create the project first or provide an existing project name.`
      );
    }

    projectId = project.id;
  }

  const departmentName =
    extractDepartmentName(message);

  let departmentId:
    | number
    | undefined;

  if (departmentName) {
    const department =
      await findDepartmentByName(
        departmentName
      );

    if (!department) {
      throw new Error(
        `I couldn't find a department named "${departmentName}".`
      );
    }

    departmentId = department.id;
  }

  const requestedSkillNames =
    extractRequiredSkillNames(
      message
    );

  const existingSkills =
    await prisma.skill.findMany({
      orderBy: {
        name: "asc",
      },
    });

  const existingSkillMatches =
    requestedSkillNames.filter(
      (requested) =>
        existingSkills.some(
          (skill) =>
            skill.name.toLowerCase() ===
            requested.toLowerCase()
        )
    );

  const missingSkillNames =
    requestedSkillNames.filter(
      (requested) =>
        !existingSkills.some(
          (skill) =>
            skill.name.toLowerCase() ===
            requested.toLowerCase()
        )
    );

  const skillIds =
    existingSkills
      .filter((skill) =>
        existingSkillMatches.some(
          (requested) =>
            requested.toLowerCase() ===
            skill.name.toLowerCase()
        )
      )
      .map((skill) => skill.id);

  const skillNames =
    existingSkills
      .filter((skill) =>
        skillIds.includes(skill.id)
      )
      .map((skill) => skill.name);

  return {
    title,
    description:
      `Task created through the AI Task Bot: ${title}`,
    projectId,
    projectName:
      projectName || undefined,
    departmentId,
    departmentName:
      departmentName || undefined,
    taskType:
      "Development",
    priority:
      extractPriority(message),
    status:
      "TODO",
    skillIds,
    skillNames,
    missingSkillNames,
  };
}

async function createTaskFromPendingAction(
  data: PendingTaskAction["data"]
) {
  let skillIds = [
    ...data.skillIds,
  ];

  if (
    data.missingSkillNames.length > 0
  ) {
    const createdSkills =
      await findOrCreateSkills(
        data.missingSkillNames
      );

    skillIds = [
      ...skillIds,
      ...createdSkills.map(
        (skill) => skill.id
      ),
    ];
  }

  skillIds = [
    ...new Set(skillIds),
  ];

  const task =
    await prisma.task.create({
      data: {
        title:
          data.title.trim(),
        description:
          data.description?.trim() ||
          null,
        status:
          data.status,
        priority:
          data.priority,
        taskType:
          data.taskType?.trim() ||
          null,
        startDate:
          data.startDate
            ? new Date(
                data.startDate
              )
            : null,
        dueDate:
          data.dueDate
            ? new Date(
                data.dueDate
              )
            : null,
        estimatedHours:
          data.estimatedHours ??
          null,
        actualHours:
          data.actualHours ??
          null,
        labels:
          data.labels?.trim() ||
          null,
        projectId:
          data.projectId ??
          null,
        departmentId:
          data.departmentId ??
          null,
        completed:
          data.status ===
          "COMPLETED",
        skills:
          skillIds.length > 0
            ? {
                create:
                  skillIds.map(
                    (skillId) => ({
                      skillId,
                    })
                  ),
              }
            : undefined,
      },
      include: {
        project: true,
        department: true,
        skills: {
          include: {
            skill: true,
          },
        },
        assignees: {
          include: {
            person: true,
          },
        },
      },
    });

  await prisma.activityLog.create({
    data: {
      action:
        "TASK_CREATED",
      entity:
        "Task",
      details:
        `Task ${task.title} was created through AI`,
      taskId:
        task.id,
      isAI: true,
      aiReason:
        "Task was created through the AI Task Bot.",
    },
  });

  return task;
}

/* -------------------------------------------------------------------------- */
/* TEAM AVAILABILITY                                                           */
/* -------------------------------------------------------------------------- */

async function getAvailableTeamMembers() {
  const people =
    await prisma.person.findMany({
      where: {
        isActive: true,
      },
      include: {
        department: true,
        skills: {
          include: {
            skill: true,
          },
        },
        assignedTasks: {
          include: {
            task: true,
          },
        },
      },
      orderBy: {
        fullName: "asc",
      },
    });

  const members =
    people.map((person) => {
      const activeTaskCount =
        person.assignedTasks.filter(
          (assignment) =>
            assignment.task.status !==
            "COMPLETED"
        ).length;

      return {
        id:
          person.id,
        name:
          person.fullName,
        department:
          person.department?.name ||
          null,
        role:
          person.role,
        jobTitle:
          person.jobTitle,
        availability:
          person.availability,
        experience:
          person.experience,
        skills:
          person.skills.map(
            (item) =>
              item.skill.name
          ),
        activeTaskCount,
      };
    });

  return members.sort(
    (a, b) =>
      a.activeTaskCount -
        b.activeTaskCount ||
      a.name.localeCompare(b.name)
  );
}

/* -------------------------------------------------------------------------- */
/* TASK UPDATE HELPERS                                                         */
/* -------------------------------------------------------------------------- */

function isExplicitAssigneeUpdate(
  message: string
): boolean {
  const text = message
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const taskId =
    extractTaskId(message);

  if (!taskId) {
    return false;
  }

  if (
    text.includes("who should") ||
    text.includes("who is best") ||
    text.includes("recommend") ||
    text.includes("best person") ||
    text.includes("suitable person")
  ) {
    return false;
  }

  return (
    /\bassign\s+task\s+\d+\s+to\s+.+/i.test(text) ||
    /\breassign\s+task\s+\d+\s+to\s+.+/i.test(text) ||
    /\btask\s+\d+\s+(?:should\s+be|is)\s+assigned\s+to\s+.+/i.test(
      text
    ) ||
    /\bchange\s+(?:the\s+)?assignee\s+(?:of\s+)?task\s+\d+\s+to\s+.+/i.test(
      text
    ) ||
    /\bchange\s+task\s+\d+\s+assignee\s+to\s+.+/i.test(
      text
    )
  );
}

function isTaskUpdateRequest(
  message: string
): boolean {
  const text = message
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const taskId =
    extractTaskId(message);

  if (!taskId) {
    return false;
  }

  if (isTaskCreationRequest(message)) {
    return false;
  }

  if (
    isExplicitAssigneeUpdate(message)
  ) {
    return true;
  }

  const updateWords = [
    "change",
    "update",
    "set",
    "modify",
    "move",
    "reassign",
    "mark",
    "make",
  ];

  const fieldWords = [
    "status",
    "priority",
    "assignee",
    "assigned",
    "project",
    "department",
    "due date",
    "duedate",
  ];

  const hasUpdateWord =
    updateWords.some((word) =>
      text.includes(word)
    );

  const hasFieldWord =
    fieldWords.some((word) =>
      text.includes(word)
    );

  return (
    hasUpdateWord &&
    hasFieldWord
  );
}

/* -------------------------------------------------------------------------- */
/* STATUS EXTRACTION                                                           */
/* -------------------------------------------------------------------------- */

function extractTaskStatus(
  message: string
): TaskStatus | null {
  const text = message
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (
    text.includes("completed") ||
    text.includes("complete") ||
    text.includes("done") ||
    text.includes("finished")
  ) {
    return "COMPLETED";
  }

  if (
    text.includes("in progress") ||
    text.includes("in-progress") ||
    text.includes("started") ||
    text.includes("working")
  ) {
    return "IN_PROGRESS";
  }

  if (
    text.includes("todo") ||
    text.includes("to do") ||
    text.includes("to-do") ||
    text.includes("pending")
  ) {
    return "TODO";
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* PRIORITY EXTRACTION                                                        */
/* -------------------------------------------------------------------------- */

function extractUpdatedPriority(
  message: string
): Priority | null {
  const text = message
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (text.includes("urgent")) {
    return "URGENT";
  }

  if (
    text.includes("high priority") ||
    text.includes("priority high") ||
    /\bto high\b/i.test(text) ||
    /\bset.*\bhigh\b/i.test(text)
  ) {
    return "HIGH";
  }

  if (
    text.includes("medium priority") ||
    text.includes("priority medium") ||
    /\bto medium\b/i.test(text) ||
    /\bset.*\bmedium\b/i.test(text)
  ) {
    return "MEDIUM";
  }

  if (
    text.includes("low priority") ||
    text.includes("priority low") ||
    /\bto low\b/i.test(text) ||
    /\bset.*\blow\b/i.test(text)
  ) {
    return "LOW";
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* TASK UPDATE NAME EXTRACTION                                                */
/* -------------------------------------------------------------------------- */

function extractAssigneeName(
  message: string
): string | null {
  const patterns = [
    /\bassign\s+task\s+\d+\s+to\s+(.+?)(?:\?|$)/i,
    /\breassign\s+task\s+\d+\s+to\s+(.+?)(?:\?|$)/i,
    /\btask\s+\d+\s+(?:should\s+be|is)\s+assigned\s+to\s+(.+?)(?:\?|$)/i,
    /\bchange\s+(?:the\s+)?assignee\s+(?:of\s+)?task\s+\d+\s+to\s+(.+?)(?:\?|$)/i,
    /\bchange\s+task\s+\d+\s+assignee\s+to\s+(.+?)(?:\?|$)/i,
  ];

  for (const pattern of patterns) {
    const match =
      message.match(pattern);

    if (match?.[1]) {
      return match[1]
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/[.!?]+$/, "")
        .trim();
    }
  }

  return null;
}

function extractTaskUpdateProjectName(
  message: string
): string | null {
  const patterns = [
    /\bchange\s+task\s+\d+\s+project\s+to\s+(.+?)(?:\?|$)/i,
    /\bmove\s+task\s+\d+\s+to\s+(?:the\s+)?(.+?)(?:\s+project)?(?:\?|$)/i,
    /\bset\s+task\s+\d+\s+project\s+to\s+(.+?)(?:\?|$)/i,
    /\bupdate\s+task\s+\d+\s+project\s+to\s+(.+?)(?:\?|$)/i,
  ];

  for (const pattern of patterns) {
    const match =
      message.match(pattern);

    if (match?.[1]) {
      return match[1]
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/[.!?]+$/, "")
        .replace(/\s+project$/i, "")
        .trim();
    }
  }

  return null;
}

function extractTaskUpdateDepartmentName(
  message: string
): string | null {
  const patterns = [
    /\bchange\s+task\s+\d+\s+department\s+to\s+(.+?)(?:\?|$)/i,
    /\bset\s+task\s+\d+\s+department\s+to\s+(.+?)(?:\?|$)/i,
    /\bupdate\s+task\s+\d+\s+department\s+to\s+(.+?)(?:\?|$)/i,
  ];

  for (const pattern of patterns) {
    const match =
      message.match(pattern);

    if (match?.[1]) {
      return match[1]
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/[.!?]+$/, "")
        .replace(/\s+department$/i, "")
        .trim();
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* DATE EXTRACTION                                                             */
/* -------------------------------------------------------------------------- */

function parseTaskDueDate(
  message: string
): Date | null {
  const patterns = [
    /\b(?:due date|duedate)\s+(?:to\s+)?([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
    /\bdue\s+(?:on|by)\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
    /\b(?:due date|duedate)\s+(?:to\s+)?(\d{4}-\d{2}-\d{2})/i,
    /\bdue\s+(?:on|by)\s+(\d{4}-\d{2}-\d{2})/i,
    /\b(?:due date|duedate)\s+(?:to\s+)?(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /\bdue\s+(?:on|by)\s+(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /\b(?:due date|duedate)\s+(?:to\s+)?([A-Za-z]+\s+\d{1,2})\b/i,
    /\bdue\s+(?:on|by)\s+([A-Za-z]+\s+\d{1,2})\b/i,
  ];

  for (const pattern of patterns) {
    const match =
      message.match(pattern);

    if (match?.[1]) {
      let dateText =
        match[1].trim();

      if (
        /^[A-Za-z]+\s+\d{1,2}$/i.test(
          dateText
        )
      ) {
        dateText = `${dateText}, ${new Date().getFullYear()}`;
      }

      const date =
        new Date(dateText);

      if (
        !Number.isNaN(
          date.getTime()
        )
      ) {
        return date;
      }
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* TASK UPDATE PREPARATION                                                     */
/* -------------------------------------------------------------------------- */

async function prepareTaskUpdate(
  message: string
): Promise<PendingTaskUpdateAction> {
  const taskId =
    extractTaskId(message);

  if (!taskId) {
    throw new Error(
      "Please provide a task ID."
    );
  }

  const task =
    await prisma.task.findUnique({
      where: {
        id: taskId,
      },
      include: {
        project: true,
        department: true,
        assignees: {
          include: {
            person: true,
          },
        },
      },
    });

  if (!task) {
    throw new Error(
      `I couldn't find task #${taskId} in the database.`
    );
  }

  const text =
    message.toLowerCase();

  if (
    text.includes("status") ||
    text.includes("mark task") ||
    text.includes("mark the task")
  ) {
    const newStatus =
      extractTaskStatus(message);

    if (!newStatus) {
      throw new Error(
        "Please specify a valid task status such as TODO, IN_PROGRESS, COMPLETED, or BLOCKED."
      );
    }

    return {
      intent: "UPDATE_TASK",
      taskId,
      field: "status",
      value: newStatus,
      displayValue: newStatus,
      oldValue: task.status,
    };
  }

  if (
    text.includes("priority")
  ) {
    const newPriority =
      extractUpdatedPriority(
        message
      );

    if (!newPriority) {
      throw new Error(
        "Please specify a priority such as LOW, MEDIUM, HIGH, or URGENT."
      );
    }

    return {
      intent: "UPDATE_TASK",
      taskId,
      field: "priority",
      value: newPriority,
      displayValue:
        newPriority,
      oldValue:
        task.priority,
    };
  }

  if (
    isExplicitAssigneeUpdate(
      message
    ) ||
    text.includes("assignee") ||
    text.includes("assigned to")
  ) {
    const personName =
      extractAssigneeName(
        message
      );

    if (!personName) {
      throw new Error(
        "Please provide the team member's name, for example: Assign task 3 to Ali."
      );
    }

    const person =
      await findPersonByName(
        personName
      );

    if (!person) {
      throw new Error(
        `I couldn't find an active team member named **${personName}**.`
      );
    }

    const currentAssignee =
      task.assignees?.length > 0
        ? task.assignees
            .map(
              (assignment) =>
                assignment.person.fullName
            )
            .join(", ")
        : "Unassigned";

    return {
      intent: "UPDATE_TASK",
      taskId,
      field: "assignee",
      value: person.id,
      displayValue:
        person.fullName,
      oldValue:
        currentAssignee,
      personId:
        person.id,
      personName:
        person.fullName,
    };
  }

  if (
    text.includes("project") ||
    text.includes("move task")
  ) {
    const projectName =
      extractTaskUpdateProjectName(
        message
      );

    if (!projectName) {
      throw new Error(
        "Please provide the project name, for example: Move task 3 to Website Redesign."
      );
    }

    const project =
      await findProjectByName(
        projectName
      );

    if (!project) {
      throw new Error(
        `I couldn't find a project matching **${projectName}**.`
      );
    }

    return {
      intent: "UPDATE_TASK",
      taskId,
      field: "project",
      value: project.id,
      displayValue:
        project.name,
      oldValue:
        task.project?.name ||
        "No project",
      projectId:
        project.id,
      projectName:
        project.name,
    };
  }

  if (
    text.includes("department")
  ) {
    const departmentName =
      extractTaskUpdateDepartmentName(
        message
      );

    if (!departmentName) {
      throw new Error(
        "Please provide the department name."
      );
    }

    const department =
      await findDepartmentByName(
        departmentName
      );

    if (!department) {
      throw new Error(
        `I couldn't find a department matching **${departmentName}**.`
      );
    }

    return {
      intent: "UPDATE_TASK",
      taskId,
      field: "department",
      value: department.id,
      displayValue:
        department.name,
      oldValue:
        task.department?.name ||
        "No department",
      departmentId:
        department.id,
      departmentName:
        department.name,
    };
  }

  if (
    text.includes("due date") ||
    text.includes("duedate") ||
    text.includes("due on") ||
    text.includes("due by")
  ) {
    const dueDate =
      parseTaskDueDate(
        message
      );

    if (!dueDate) {
      throw new Error(
        "I couldn't understand the date. Please use a format such as September 15, 2026, September 15, or 2026-09-15."
      );
    }

    return {
      intent: "UPDATE_TASK",
      taskId,
      field: "dueDate",
      value:
        dueDate.toISOString(),
      displayValue:
        dueDate.toLocaleDateString(),
      oldValue:
        task.dueDate
          ? new Date(
              task.dueDate
            ).toLocaleDateString()
          : "No due date",
    };
  }

  throw new Error(
    "I couldn't determine which task field you want to update."
  );
}

/* -------------------------------------------------------------------------- */
/* APPLY TASK UPDATE                                                          */
/* -------------------------------------------------------------------------- */

async function applyTaskUpdate(
  action: PendingTaskUpdateAction
) {
  const task =
    await prisma.task.findUnique({
      where: {
        id: action.taskId,
      },
    });

  if (!task) {
    throw new Error(
      `Task #${action.taskId} no longer exists.`
    );
  }

  let updatedTask;

  if (
    action.field === "status"
  ) {
    const status =
      String(
        action.value
      ) as TaskStatus;

    updatedTask =
      await prisma.task.update({
        where: {
          id: action.taskId,
        },
        data: {
          status,
          completed:
            status ===
            "COMPLETED",
        },
        include: {
          project: true,
          department: true,
          assignees: {
            include: {
              person: true,
            },
          },
          skills: {
            include: {
              skill: true,
            },
          },
        },
      });
  }

  else if (
    action.field === "priority"
  ) {
    const priority =
      String(
        action.value
      ) as Priority;

    updatedTask =
      await prisma.task.update({
        where: {
          id: action.taskId,
        },
        data: {
          priority,
        },
        include: {
          project: true,
          department: true,
          assignees: {
            include: {
              person: true,
            },
          },
          skills: {
            include: {
              skill: true,
            },
          },
        },
      });
  }

  else if (
    action.field === "project"
  ) {
    updatedTask =
      await prisma.task.update({
        where: {
          id: action.taskId,
        },
        data: {
          projectId:
            action.projectId ??
            null,
        },
        include: {
          project: true,
          department: true,
          assignees: {
            include: {
              person: true,
            },
          },
          skills: {
            include: {
              skill: true,
            },
          },
        },
      });
  }

  else if (
    action.field === "department"
  ) {
    updatedTask =
      await prisma.task.update({
        where: {
          id: action.taskId,
        },
        data: {
          departmentId:
            action.departmentId ??
            null,
        },
        include: {
          project: true,
          department: true,
          assignees: {
            include: {
              person: true,
            },
          },
          skills: {
            include: {
              skill: true,
            },
          },
        },
      });
  }

  else if (
    action.field === "dueDate"
  ) {
    updatedTask =
      await prisma.task.update({
        where: {
          id: action.taskId,
        },
        data: {
          dueDate:
            action.value
              ? new Date(
                  String(
                    action.value
                  )
                )
              : null,
        },
        include: {
          project: true,
          department: true,
          assignees: {
            include: {
              person: true,
            },
          },
          skills: {
            include: {
              skill: true,
            },
          },
        },
      });
  }

  else if (
    action.field === "assignee"
  ) {
    if (!action.personId) {
      throw new Error(
        "No team member was selected for this assignment."
      );
    }

    updatedTask =
      await prisma.task.update({
        where: {
          id: action.taskId,
        },
        data: {
          assignees: {
            deleteMany: {},
            create: [
              {
                personId:
                  action.personId,
              },
            ],
          },
        },
        include: {
          project: true,
          department: true,
          assignees: {
            include: {
              person: true,
            },
          },
          skills: {
            include: {
              skill: true,
            },
          },
        },
      });
  }

  else {
    throw new Error(
      "Unsupported task update."
    );
  }

  await prisma.activityLog.create({
    data: {
      action:
        "TASK_UPDATED",
      entity:
        "Task",
      details:
        `Task #${action.taskId} ${action.field} changed from "${action.oldValue}" to "${action.displayValue}" through AI`,
      taskId:
        action.taskId,
      isAI: true,
      aiReason:
        "Task was updated through the AI Task Bot.",
    },
  });

  return updatedTask;
}

/* -------------------------------------------------------------------------- */
/* TASK UPDATE PREVIEW                                                        */
/* -------------------------------------------------------------------------- */

function formatTaskUpdatePreview(
  action: PendingTaskUpdateAction
): string {
  const fieldLabels: Record<
    TaskUpdateField,
    string
  > = {
    status: "Status",
    priority: "Priority",
    assignee: "Assignee",
    project: "Project",
    department: "Department",
    dueDate: "Due Date",
  };

  return [
    `### ✏️ Update Task #${action.taskId}`,
    "",
    `I can update the **${fieldLabels[action.field]}** for task **#${action.taskId}**.`,
    "",
    "| Field | Current | New |",
    "| --- | --- | --- |",
    `| ${fieldLabels[action.field]} | ${action.oldValue} | ${action.displayValue} |`,
    "",
    "This is a preview only — **no changes have been made yet**.",
    "",
    "Would you like me to apply this change?",
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* TASK QUERY HELPERS                                                         */
/* -------------------------------------------------------------------------- */

function isTaskQueryRequest(
  message: string
): boolean {
  const text = message
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (isTaskCreationRequest(message)) {
    return false;
  }

  if (isAssignmentRequest(message)) {
    return false;
  }

  if (isTaskUpdateRequest(message)) {
    return false;
  }

  const taskId =
    extractTaskId(message);

  if (!taskId) {
    return false;
  }

  const queryWords = [
    "show",
    "details",
    "detail",
    "information",
    "info",
    "status",
    "priority",
    "assigned",
    "assignee",
    "assignees",
    "who",
    "skills",
    "skill",
    "required",
    "requirements",
    "project",
    "department",
    "description",
    "about",
    "task",
  ];

  return queryWords.some((word) =>
    text.includes(word)
  );
}

/* -------------------------------------------------------------------------- */
/* FORMAT TASK DETAILS                                                        */
/* -------------------------------------------------------------------------- */

function formatTaskDetails(
  task: any
) {
  const assignees =
    task.assignees?.length > 0
      ? task.assignees
          .map(
            (assignment: any) =>
              assignment.person.fullName
          )
          .join(", ")
      : "Unassigned";

  const skills =
    task.skills?.length > 0
      ? task.skills
          .map(
            (item: any) =>
              item.skill.name
          )
          .join(", ")
      : "None";

  return [
    `### 📋 Task #${task.id} — ${task.title}`,
    "",
    "| Task Information | Value |",
    "| --- | --- |",
    `| Task ID | ${task.id} |`,
    `| Title | ${task.title} |`,
    `| Description | ${task.description || "No description"} |`,
    `| Status | ${task.status} |`,
    `| Priority | ${task.priority} |`,
    `| Task Type | ${task.taskType || "Not specified"} |`,
    `| Project | ${task.project?.name || "Not specified"} |`,
    `| Department | ${task.department?.name || "Not specified"} |`,
    `| Assignee | ${assignees} |`,
    `| Required Skills | ${skills} |`,
    `| Start Date | ${
      task.startDate
        ? new Date(
            task.startDate
          ).toLocaleDateString()
        : "Not specified"
    } |`,
    `| Due Date | ${
      task.dueDate
        ? new Date(
            task.dueDate
          ).toLocaleDateString()
        : "Not specified"
    } |`,
    `| Estimated Hours | ${
      task.estimatedHours ??
      "Not specified"
    } |`,
    `| Actual Hours | ${
      task.actualHours ??
      "Not specified"
    } |`,
    `| Labels | ${
      task.labels ||
      "None"
    } |`,
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* AI ROUTE                                                                  */
/* -------------------------------------------------------------------------- */

app.post(
  "/api/ai",
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const message =
        normalizeText(
          req.body?.message ||
            req.body?.prompt
        );

      if (!message) {
        return res.status(400).json({
          success: false,
          message:
            "Message or prompt is required.",
        });
      }

      const conversationKey =
        getConversationKey(req);

      const pendingPerson =
        pendingPersonActions.get(
          conversationKey
        );

      const pendingTask =
        pendingTaskActions.get(
          conversationKey
        );

      const pendingProject =
        pendingProjectActions.get(
          conversationKey
        );

      const pendingProjectUpdate =
        pendingProjectUpdateActions.get(
          conversationKey
        );

      const pendingProjectMember =
        pendingProjectMemberActions.get(
          conversationKey
        );

      const pendingTaskUpdate =
        pendingTaskUpdateActions.get(
          conversationKey
        );

      const pendingPersonUpdate =
        pendingPersonUpdateActions.get(
          conversationKey
        );

      /* ------------------------------------------------------------------ */
      /* CANCELLATION                                                       */
      /* ------------------------------------------------------------------ */

      if (isCancellation(message)) {
        pendingPersonActions.delete(
          conversationKey
        );

        pendingTaskActions.delete(
          conversationKey
        );

        pendingProjectActions.delete(
          conversationKey
        );

        pendingProjectUpdateActions.delete(
          conversationKey
        );

        pendingProjectMemberActions.delete(
          conversationKey
        );

        pendingTaskUpdateActions.delete(
          conversationKey
        );

        pendingPersonUpdateActions.delete(
          conversationKey
        );

        return res.json({
          success: true,
          data: {
            reply:
              "Cancelled. No changes were made.",
            requiresConfirmation:
              false,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* CONFIRM PERSON UPDATE                                              */
      /* ------------------------------------------------------------------ */

      if (
        pendingPersonUpdate &&
        pendingPersonUpdate.intent ===
          "UPDATE_PERSON" &&
        isConfirmation(message)
      ) {
        const updatedPerson =
          await applyPersonUpdate(
            pendingPersonUpdate
          );

        pendingPersonUpdateActions.delete(
          conversationKey
        );

        let successMessage =
          `✅ **${updatedPerson?.fullName || pendingPersonUpdate.personName}** has been updated successfully.`;

        if (
          pendingPersonUpdate.field ===
          "skills_add"
        ) {
          successMessage +=
            `\n\n**Skill added:** ${pendingPersonUpdate.skillName}`;
        }

        else if (
          pendingPersonUpdate.field ===
          "skills_remove"
        ) {
          successMessage +=
            `\n\n**Skill removed:** ${pendingPersonUpdate.skillName}`;
        }

        else if (
          pendingPersonUpdate.field ===
          "department"
        ) {
          successMessage +=
            `\n\n**New department:** ${pendingPersonUpdate.displayValue}`;
        }

        else if (
          pendingPersonUpdate.field ===
          "availability"
        ) {
          successMessage +=
            `\n\n**New availability:** ${pendingPersonUpdate.displayValue}`;
        }

        else if (
          pendingPersonUpdate.field ===
          "active"
        ) {
          successMessage +=
            `\n\n**New account status:** ${pendingPersonUpdate.displayValue}`;
        }

        return res.json({
          success: true,
          data: {
            reply:
              successMessage,
            intent:
              "UPDATE_PERSON",
            requiresConfirmation:
              false,
            person:
              updatedPerson,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* CONFIRM TASK UPDATE                                                */
      /* ------------------------------------------------------------------ */

      if (
        pendingTaskUpdate &&
        pendingTaskUpdate.intent ===
          "UPDATE_TASK" &&
        isConfirmation(message)
      ) {
        const updatedTask =
          await applyTaskUpdate(
            pendingTaskUpdate
          );

        pendingTaskUpdateActions.delete(
          conversationKey
        );

        let successMessage =
          `✅ Task **#${updatedTask.id} — ${updatedTask.title}** has been updated successfully.`;

        if (
          pendingTaskUpdate.field ===
          "status"
        ) {
          successMessage +=
            `\n\n**New status:** ${updatedTask.status}`;
        }

        else if (
          pendingTaskUpdate.field ===
          "priority"
        ) {
          successMessage +=
            `\n\n**New priority:** ${updatedTask.priority}`;
        }

        else if (
          pendingTaskUpdate.field ===
          "assignee"
        ) {
          successMessage +=
            `\n\n**New assignee:** ${pendingTaskUpdate.displayValue}`;
        }

        else if (
          pendingTaskUpdate.field ===
          "project"
        ) {
          successMessage +=
            `\n\n**New project:** ${pendingTaskUpdate.displayValue}`;
        }

        else if (
          pendingTaskUpdate.field ===
          "department"
        ) {
          successMessage +=
            `\n\n**New department:** ${pendingTaskUpdate.displayValue}`;
        }

        else if (
          pendingTaskUpdate.field ===
          "dueDate"
        ) {
          successMessage +=
            `\n\n**New due date:** ${pendingTaskUpdate.displayValue}`;
        }

        return res.json({
          success: true,
          data: {
            reply:
              successMessage,
            intent:
              "UPDATE_TASK",
            requiresConfirmation:
              false,
            task:
              updatedTask,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* PERSON AUTO-FILL                                                   */
      /* ------------------------------------------------------------------ */

      if (
        pendingPerson &&
        pendingPerson.intent ===
          "CREATE_PERSON" &&
        isAutoFillPersonRequest(
          message
        )
      ) {
        const [
          departments,
          skills,
        ] = await Promise.all([
          prisma.department.findMany({
            orderBy: {
              name: "asc",
            },
          }),

          prisma.skill.findMany({
            orderBy: {
              name: "asc",
            },
          }),
        ]);

        const engineering =
          departments.find(
            (department) =>
              department.name
                .toLowerCase() ===
              "engineering"
          ) ||
          departments[0];

        const preferredSkillNames = [
          "React",
          "Next.js",
          "TypeScript",
          "JavaScript",
          "Node.js",
        ];

        const selectedSkills =
          skills.filter((skill) =>
            preferredSkillNames.some(
              (preferred) =>
                preferred.toLowerCase() ===
                skill.name.toLowerCase()
            )
          );

        const safeName =
          pendingPerson.personName
            .trim()
            .replace(/\s+/g, " ");

        const emailName =
          safeName
            .toLowerCase()
            .replace(
              /[^a-z0-9]+/g,
              "."
            )
            .replace(
              /^\.+|\.+$/g,
              ""
            );

        const generatedData:
          PendingPersonAction["data"] =
          {
            fullName:
              safeName,
            email:
              `${emailName}@example.com`,
            phone: "",
            location:
              "Rawalpindi, Pakistan",
            departmentId:
              engineering?.id,
            departmentName:
              engineering?.name,
            jobTitle:
              "Frontend Developer",
            role:
              "Developer",
            experience:
              2,
            employmentType:
              "FULL_TIME",
            availability:
              "AVAILABLE",
            bio:
              `Test team member added through AI for ${safeName}.`,
            notes:
              "Created as a test team member through the AI Task Bot.",
            preferredTaskTypes:
              "Frontend development, UI development, testing",
            skillIds:
              selectedSkills.map(
                (skill) =>
                  skill.id
              ),
            skillNames:
              selectedSkills.map(
                (skill) =>
                  skill.name
              ),
          };

        pendingPersonActions.set(
          conversationKey,
          {
            ...pendingPerson,
            data:
              generatedData,
          }
        );

        const skillText =
          generatedData.skillNames
            ?.length
            ? generatedData.skillNames.join(
                ", "
              )
            : "No existing skills selected";

        const reply = [
          `I can add **${generatedData.fullName}** as a test team member.`,
          "",
          "Here is the information I filled in:",
          "",
          "| Field | Value |",
          "| --- | --- |",
          `| Name | ${generatedData.fullName} |`,
          `| Email | ${generatedData.email} |`,
          `| Location | ${generatedData.location} |`,
          `| Department | ${
            generatedData.departmentName ||
            "Not available"
          } |`,
          `| Job Title | ${generatedData.jobTitle} |`,
          `| Role | ${generatedData.role} |`,
          `| Experience | ${generatedData.experience} years |`,
          `| Employment Type | ${generatedData.employmentType} |`,
          `| Availability | ${generatedData.availability} |`,
          `| Skills | ${skillText} |`,
          "",
          "This is a preview only — I have **not created the person yet**.",
          "",
          `Would you like me to create **${generatedData.fullName}**?`,
        ].join("\n");

        return res.json({
          success: true,
          data: {
            reply,
            intent:
              "CREATE_PERSON",
            requiresConfirmation:
              true,
            preview:
              generatedData,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* CONFIRM PERSON CREATION                                            */
      /* ------------------------------------------------------------------ */

      if (
        pendingPerson &&
        pendingPerson.intent ===
          "CREATE_PERSON" &&
        pendingPerson.data &&
        isConfirmation(message)
      ) {
        const existingPerson =
          await prisma.person.findFirst({
            where: {
              OR: [
                {
                  email:
                    pendingPerson.data
                      .email,
                },
                {
                  fullName:
                    pendingPerson.data
                      .fullName,
                },
              ],
            },
          });

        if (existingPerson) {
          pendingPersonActions.delete(
            conversationKey
          );

          return res.json({
            success: true,
            data: {
              reply:
                `A team member named **${existingPerson.fullName}** already exists. I did not create a duplicate.`,
              intent:
                "CREATE_PERSON",
              requiresConfirmation:
                false,
            },
          });
        }

        const createdPerson =
          await createPersonThroughAPI(
            pendingPerson.data
          );

        pendingPersonActions.delete(
          conversationKey
        );

        return res.json({
          success: true,
          data: {
            reply:
              `✅ **${createdPerson?.fullName || pendingPerson.personName}** has been added to the team successfully.`,
            intent:
              "CREATE_PERSON",
            requiresConfirmation:
              false,
            person:
              createdPerson,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* START PERSON CREATION                                              */
      /* ------------------------------------------------------------------ */

      if (
        isPersonCreationRequest(
          message
        )
      ) {
        const personName =
          extractPersonName(
            message
          );

        if (personName) {
          pendingPersonActions.set(
            conversationKey,
            {
              intent:
                "CREATE_PERSON",
              personName,
            }
          );

          return res.json({
            success: true,
            data: {
              reply: [
                `Sure — I can add **${personName}** to the team.`,
                "",
                "I have started the team-member creation process.",
                "",
                "You can provide the remaining details yourself, or tell me something like:",
                "",
                '> "fill the other requirements by yourself"',
                "",
                "I'll prepare a preview using the existing departments and skills, then ask for your confirmation before creating the person.",
              ].join("\n"),
              intent:
                "CREATE_PERSON",
              requiresConfirmation:
                false,
              personName,
            },
          });
        }
      }

      /* ------------------------------------------------------------------ */
      /* START PERSON UPDATE                                                */
      /* ------------------------------------------------------------------ */

      if (
        isPersonUpdateRequest(
          message
        )
      ) {
        const personUpdate =
          await preparePersonUpdate(
            message
          );

        pendingPersonUpdateActions.set(
          conversationKey,
          personUpdate
        );

        return res.json({
          success: true,
          data: {
            reply:
              formatPersonUpdatePreview(
                personUpdate
              ),
            intent:
              "UPDATE_PERSON",
            requiresConfirmation:
              true,
            preview:
              personUpdate,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* TEAM SKILLS QUERY                                                  */
      /* ------------------------------------------------------------------ */

      if (isTeamSkillsQueryRequest(message)) {
        const teamMembers = await prisma.person.findMany({
          where: { isActive: true },
          include: {
            skills: {
              include: { skill: true },
            },
          },
          orderBy: { fullName: "asc" },
        });

        const skillMap = new Map<number, {
          id: number;
          name: string;
          members: string[];
        }>();

        for (const person of teamMembers) {
          for (const personSkill of person.skills) {
            const skill = personSkill.skill;
            let entry = skillMap.get(skill.id);

            if (!entry) {
              entry = { id: skill.id, name: skill.name, members: [] };
              skillMap.set(skill.id, entry);
            }

            if (!entry.members.includes(person.fullName)) {
              entry.members.push(person.fullName);
            }
          }
        }

        const teamSkills = Array.from(skillMap.values()).sort((a, b) =>
          a.name.localeCompare(b.name)
        );

        if (teamSkills.length === 0) {
          return res.json({
            success: true,
            data: {
              reply: teamMembers.length === 0
                ? "There are currently no active team members with skills in the system."
                : "No skills are currently assigned to the active team members.",
              intent: "TEAM_SKILLS_QUERY",
              requiresConfirmation: false,
              skills: [],
            },
          });
        }

        const rows = teamSkills.map(
          (skill) =>
            `| ${skill.name} | ${skill.members.length} | ${skill.members.join(", ")} |`
        );

        const reply = [
          "### 🧩 Team Skills",
          "",
          `I found **${teamSkills.length}** skill(s) across the active team.`,
          "",
          "| Skill | Team Members | Members |",
          "| --- | ---: | --- |",
          ...rows,
        ].join("\n");

        return res.json({
          success: true,
          data: {
            reply,
            intent: "TEAM_SKILLS_QUERY",
            requiresConfirmation: false,
            skills: teamSkills,
          },
        });
      }

      /* PERSON QUERIES                                                      */
      /* ------------------------------------------------------------------ */

      if (
        isPersonQueryRequest(
          message
        )
      ) {
        const text =
          message.toLowerCase();

        const allPeopleQuery = isAllPeopleQueryRequest(message);

        const personName = allPeopleQuery
          ? null
          : extractPersonQueryName(message);

        /* -------------------------------------------------------------- */
        /* ALL PEOPLE                                                       */
        /* -------------------------------------------------------------- */

        if (
          !personName &&
          (
            allPeopleQuery ||
            text.includes("all team") ||
            text.includes("all people") ||
            text.includes("all members") ||
            text.includes("show me the team") ||
            text.includes("show the team") ||
            text.includes("list team") ||
            text.includes("list people") ||
            text.includes("list members")
          )
        ) {
          const allPeople =
            await prisma.person.findMany({
              include: {
                department: true,
                skills: {
                  include: {
                    skill: true,
                  },
                },
                assignedTasks: {
                  include: {
                    task: true,
                  },
                },
              },
              orderBy: {
                fullName: "asc",
              },
            });

          if (
            allPeople.length === 0
          ) {
            return res.json({
              success: true,
              data: {
                reply:
                  "There are currently no team members in the system.",
                intent:
                  "PEOPLE_QUERY",
                requiresConfirmation:
                  false,
                people: [],
              },
            });
          }

          const rows =
            allPeople.map(
              (person) => {
                const activeTaskCount =
                  person.assignedTasks.filter(
                    (assignment) =>
                      assignment.task.status !==
                      "COMPLETED"
                  ).length;

                const skills =
                  person.skills.length > 0
                    ? person.skills
                        .map(
                          (item) =>
                            item.skill.name
                        )
                        .join(", ")
                    : "None";

                return `| ${person.fullName} | ${
                  person.department?.name ||
                  "Not specified"
                } | ${person.jobTitle || "Not specified"} | ${
                  person.availability
                } | ${activeTaskCount} | ${skills} |`;
              }
            );

          const reply = [
            "### 👥 Team Members",
            "",
            `I found **${allPeople.length}** team member(s).`,
            "",
            "| Team Member | Department | Job Title | Availability | Active Tasks | Skills |",
            "| --- | --- | --- | --- | ---: | --- |",
            ...rows,
          ].join("\n");

          return res.json({
            success: true,
            data: {
              reply,
              intent:
                "PEOPLE_QUERY",
              requiresConfirmation:
                false,
              people:
                allPeople,
            },
          });
        }

        /* -------------------------------------------------------------- */
        /* PEOPLE BY DEPARTMENT                                             */
        /* -------------------------------------------------------------- */

        if (
          text.includes("department") &&
          (
            text.includes("how many") ||
            text.includes("who works") ||
            text.includes("people in") ||
            text.includes("members in")
          )
        ) {
          let departmentName =
            personName;

          if (!departmentName) {
            const patterns = [
              /\bhow many (?:people|members|employees)\s+(?:are\s+)?(?:in|within)\s+(.+?)(?:\?|$)/i,
              /\bwho works in\s+(.+?)(?:\?|$)/i,
              /\bpeople in\s+(.+?)(?:\?|$)/i,
              /\bmembers in\s+(.+?)(?:\?|$)/i,
            ];

            for (
              const pattern of patterns
            ) {
              const match =
                message.match(
                  pattern
                );

              if (match?.[1]) {
                departmentName =
                  match[1]
                    .trim()
                    .replace(
                      /department$/i,
                      ""
                    )
                    .replace(
                      /[?!.]+$/,
                      ""
                    )
                    .trim();
                break;
              }
            }
          }

          if (
            departmentName
          ) {
            const department =
              await findDepartmentByName(
                departmentName
              );

            if (!department) {
              return res.json({
                success: true,
                data: {
                  reply:
                    `I couldn't find a department matching **${departmentName}**.`,
                  intent:
                    "PEOPLE_QUERY",
                  requiresConfirmation:
                    false,
                },
              });
            }

            const departmentPeople =
              await prisma.person.findMany({
                where: {
                  departmentId:
                    department.id,
                },
                include: {
                  skills: {
                    include: {
                      skill: true,
                    },
                  },
                },
                orderBy: {
                  fullName: "asc",
                },
              });

            const rows =
              departmentPeople.map(
                (person) => {
                  const skills =
                    person.skills.length > 0
                      ? person.skills
                          .map(
                            (item) =>
                              item.skill.name
                          )
                          .join(", ")
                      : "None";

                  return `| ${person.fullName} | ${
                    person.jobTitle ||
                    "Not specified"
                  } | ${
                    person.availability
                  } | ${skills} |`;
                }
              );

            const reply = [
              `### 🏢 ${department.name}`,
              "",
              `There are **${departmentPeople.length}** team member(s) in **${department.name}**.`,
              "",
              "| Team Member | Job Title | Availability | Skills |",
              "| --- | --- | --- | --- |",
              ...(
                rows.length > 0
                  ? rows
                  : [
                      "| — | No members | — | — |",
                    ]
              ),
            ].join("\n");

            return res.json({
              success: true,
              data: {
                reply,
                intent:
                  "PEOPLE_QUERY",
                requiresConfirmation:
                  false,
                department,
                people:
                  departmentPeople,
              },
            });
          }
        }

        /* -------------------------------------------------------------- */
        /* PEOPLE BY SKILL                                                  */
        /* -------------------------------------------------------------- */

        if (
          text.includes("skill") &&
          (
            text.includes("who") ||
            text.includes("which people") ||
            text.includes("which members")
          )
        ) {
          const knownSkills =
            await prisma.skill.findMany({
              orderBy: {
                name: "asc",
              },
            });

          const requestedSkill =
            knownSkills.find(
              (skill) =>
                text.includes(
                  skill.name.toLowerCase()
                )
            );

          if (
            requestedSkill
          ) {
            const peopleWithSkill =
              await prisma.person.findMany({
                where: {
                  isActive: true,
                  skills: {
                    some: {
                      skillId:
                        requestedSkill.id,
                    },
                  },
                },
                include: {
                  department: true,
                },
                orderBy: {
                  fullName: "asc",
                },
              });

            const names =
              peopleWithSkill.length > 0
                ? peopleWithSkill
                    .map(
                      (person) =>
                        `- **${person.fullName}** — ${
                          person.department?.name ||
                          "No department"
                        }`
                    )
                    .join("\n")
                : "No active team members currently have this skill.";

            return res.json({
              success: true,
              data: {
                reply: [
                  `### 🛠️ ${requestedSkill.name}`,
                  "",
                  `Team members with **${requestedSkill.name}**:`,
                  "",
                  names,
                ].join("\n"),
                intent:
                  "PEOPLE_QUERY",
                requiresConfirmation:
                  false,
                people:
                  peopleWithSkill,
              },
            });
          }
        }

        /* -------------------------------------------------------------- */
        /* SPECIFIC PERSON                                                  */
        /* -------------------------------------------------------------- */

        if (
          personName
        ) {
          const person =
            await findPersonByName(
              personName,
              true
            );

          if (!person) {
            return res.json({
              success: true,
              data: {
                reply:
                  `I couldn't find a team member matching **${personName}**.`,
                intent:
                  "PEOPLE_QUERY",
                requiresConfirmation:
                  false,
              },
            });
          }

          const fullPerson =
            await getPersonDetails(
              person.id
            );

          if (!fullPerson) {
            return res.json({
              success: true,
              data: {
                reply:
                  `I couldn't load the details for **${person.fullName}**.`,
                intent:
                  "PEOPLE_QUERY",
                requiresConfirmation:
                  false,
              },
            });
          }

          if (
            text.includes("skill")
          ) {
            const skills =
              fullPerson.skills.length > 0
                ? fullPerson.skills
                    .map(
                      (item) =>
                        item.skill.name
                    )
                    .join(", ")
                : "No skills listed";

            return res.json({
              success: true,
              data: {
                reply:
                  `### 🛠️ ${fullPerson.fullName}\n\n**${fullPerson.fullName}** has the following skills:\n\n${skills
                    .split(", ")
                    .map(
                      (skill) =>
                        `- ${skill}`
                    )
                    .join("\n")}`,
                intent:
                  "PEOPLE_QUERY",
                requiresConfirmation:
                  false,
                person:
                  fullPerson,
              },
            });
          }

          if (
            text.includes("department")
          ) {
            return res.json({
              success: true,
              data: {
                reply:
                  fullPerson.department
                    ? `### 🏢 ${fullPerson.fullName}\n\n**${fullPerson.fullName}** is in the **${fullPerson.department.name}** department.`
                    : `### 🏢 ${fullPerson.fullName}\n\n**${fullPerson.fullName}** is not currently assigned to a department.`,
                intent:
                  "PEOPLE_QUERY",
                requiresConfirmation:
                  false,
                person:
                  fullPerson,
              },
            });
          }

          return res.json({
            success: true,
            data: {
              reply:
                formatPersonDetails(
                  fullPerson
                ),
              intent:
                "PEOPLE_QUERY",
              requiresConfirmation:
                false,
              person:
                fullPerson,
            },
          });
        }
      }

      /* ------------------------------------------------------------------ */
      /* CONFIRM PROJECT UPDATE                                             */
      /* ------------------------------------------------------------------ */

      if (
        pendingProjectUpdate &&
        pendingProjectUpdate.intent === "UPDATE_PROJECT" &&
        isConfirmation(message)
      ) {
        const updatedProject = await applyProjectUpdate(
          pendingProjectUpdate
        );

        pendingProjectUpdateActions.delete(
          conversationKey
        );

        const label =
          pendingProjectUpdate.field === "status"
            ? "Status"
            : pendingProjectUpdate.field === "dueDate"
              ? "Due Date"
              : "Manager";

        return res.json({
          success: true,
          data: {
            reply: [
              `✅ Project **${updatedProject?.name || ""}** has been updated successfully.`,
              "",
              `**${label}:** ${pendingProjectUpdate.displayValue}`,
            ].join("\n"),
            intent: "UPDATE_PROJECT",
            requiresConfirmation: false,
            project: updatedProject,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* CONFIRM PROJECT MEMBER UPDATE                                      */
      /* ------------------------------------------------------------------ */

      if (
        pendingProjectMember &&
        pendingProjectMember.intent === "UPDATE_PROJECT_MEMBER" &&
        isConfirmation(message)
      ) {
        const updatedProject = await applyProjectMemberAction(
          pendingProjectMember
        );

        pendingProjectMemberActions.delete(
          conversationKey
        );

        return res.json({
          success: true,
          data: {
            reply:
              pendingProjectMember.operation === "ADD"
                ? `✅ **${pendingProjectMember.personName}** has been added to **${pendingProjectMember.projectName}**.`
                : `✅ **${pendingProjectMember.personName}** has been removed from **${pendingProjectMember.projectName}**.`,
            intent: "UPDATE_PROJECT_MEMBER",
            requiresConfirmation: false,
            project: updatedProject,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* CONFIRM PROJECT                                                    */
      /* ------------------------------------------------------------------ */

      if (
        pendingProject &&
        pendingProject.intent ===
          "CREATE_PROJECT" &&
        isConfirmation(message)
      ) {
        const result =
          await createProject(
            pendingProject.projectName
          );

        pendingProjectActions.delete(
          conversationKey
        );

        if (!result.created) {
          return res.json({
            success: true,
            data: {
              reply: [
                `A project named **${result.project.name}** already exists.`,
                "",
                "I did not create a duplicate project.",
              ].join("\n"),
              intent:
                "CREATE_PROJECT",
              requiresConfirmation:
                false,
              project:
                result.project,
            },
          });
        }

        await prisma.activityLog.create({
          data: {
            action:
              "PROJECT_CREATED",
            entity:
              "Project",
            details:
              `Project ${result.project.name} was created through AI`,
            isAI: true,
            aiReason:
              "Project was created through the AI Task Bot.",
          },
        });

        return res.json({
          success: true,
          data: {
            reply: [
              `✅ Project **${result.project.name}** has been created successfully.`,
              "",
              "| Field | Value |",
              "| --- | --- |",
              `| Project ID | ${result.project.id} |`,
              `| Project Name | ${result.project.name} |`,
              "",
              "The project is now available in your Projects section.",
            ].join("\n"),
            intent:
              "CREATE_PROJECT",
            requiresConfirmation:
              false,
            project:
              result.project,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* TEAM AVAILABILITY                                                  */
      /* ------------------------------------------------------------------ */

      if (
        isAvailabilityRequest(
          message
        ) &&
        !extractTaskId(message)
      ) {
        const members =
          await getAvailableTeamMembers();

        if (
          members.length === 0
        ) {
          return res.json({
            success: true,
            data: {
              reply:
                "I couldn't find any active team members in the database.",
              intent:
                "TEAM_AVAILABILITY",
              requiresConfirmation:
                false,
              members: [],
            },
          });
        }

        const explicitlyAvailable =
          members.filter(
            (person) =>
              String(
                person.availability ||
                  ""
              ).toUpperCase() ===
              "AVAILABLE"
          );

        const candidates =
          explicitlyAvailable.length > 0
            ? explicitlyAvailable
            : members;

        const topCandidates =
          candidates.slice(0, 10);

        const rows =
          topCandidates.map(
            (person) => {
              const skills =
                person.skills.length > 0
                  ? person.skills.join(
                      ", "
                    )
                  : "No skills listed";

              return `| ${person.name} | ${
                person.department ||
                "Not specified"
              } | ${
                person.availability ||
                "Not specified"
              } | ${
                person.activeTaskCount
              } | ${skills} |`;
            }
          );

        const reply = [
          "### 👥 Team Availability",
          "",
          explicitlyAvailable.length > 0
            ? `I found **${explicitlyAvailable.length}** team member(s) currently marked as available.`
            : "No team member is explicitly marked as AVAILABLE, so I listed the active team members with the lowest workload.",
          "",
          "| Team Member | Department | Availability | Active Tasks | Skills |",
          "| --- | --- | --- | ---: | --- |",
          ...rows,
          "",
          "Members are ordered by current active workload, with the lowest workload first.",
        ].join("\n");

        return res.json({
          success: true,
          data: {
            reply,
            intent:
              "TEAM_AVAILABILITY",
            requiresConfirmation:
              false,
            members:
              topCandidates,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* PROJECT MANAGER / MEMBER UPDATES                                   */
      /* ------------------------------------------------------------------ */

      if (isProjectMemberRequest(message)) {
        const action = await prepareProjectMemberAction(message);

        pendingProjectMemberActions.set(
          conversationKey,
          action
        );

        const verb = action.operation === "ADD" ? "add" : "remove";

        return res.json({
          success: true,
          data: {
            reply: [
              "### 👥 Project Member Update",
              "",
              `I can ${verb} **${action.personName}** ${action.operation === "ADD" ? "to" : "from"} **${action.projectName}**.`,
              "",
              "| Action | Team Member | Project |",
              "| --- | --- | --- |",
              `| ${action.operation === "ADD" ? "Add" : "Remove"} | ${action.personName} | ${action.projectName} |`,
              "",
              "This is a preview only — **no changes have been made yet**.",
              "",
              "Would you like me to apply this change?",
            ].join("\n"),
            intent: "UPDATE_PROJECT_MEMBER",
            requiresConfirmation: true,
            preview: action,
          },
        });
      }

      if (isProjectUpdateRequest(message)) {
        const action = await prepareProjectUpdate(message);

        const project = await getProjectForManagement(
          action.projectId
        );

        pendingProjectUpdateActions.set(
          conversationKey,
          action
        );

        const label =
          action.field === "status"
            ? "Status"
            : action.field === "dueDate"
              ? "Due Date"
              : "Manager";

        return res.json({
          success: true,
          data: {
            reply: [
              `### ✏️ Update Project — ${project?.name || "Project"}`,
              "",
              `I can update the **${label}** for project **${project?.name || "Project"}**.`,
              "",
              "| Field | Current | New |",
              "| --- | --- | --- |",
              `| ${label} | ${action.oldValue} | ${action.displayValue} |`,
              "",
              "This is a preview only — **no changes have been made yet**.",
              "",
              "Would you like me to apply this change?",
            ].join("\n"),
            intent: "UPDATE_PROJECT",
            requiresConfirmation: true,
            preview: action,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* START PROJECT CREATION                                             */
      /* ------------------------------------------------------------------ */

      if (
        isProjectCreationRequest(
          message
        )
      ) {
        const projectName =
          extractProjectCreationName(
            message
          );

        if (!projectName) {
          return res.json({
            success: true,
            data: {
              reply:
                "Sure. What would you like to name the project?",
              intent:
                "CREATE_PROJECT",
              requiresConfirmation:
                false,
            },
          });
        }

        const existingProject =
          await findProjectExactByName(
            projectName
          );

        if (existingProject) {
          return res.json({
            success: true,
            data: {
              reply: [
                `A project named **${existingProject.name}** already exists.`,
                "",
                "I did not create a duplicate project.",
              ].join("\n"),
              intent:
                "CREATE_PROJECT",
              requiresConfirmation:
                false,
              project:
                existingProject,
            },
          });
        }

        const pendingProjectAction:
          PendingProjectAction =
          {
            intent:
              "CREATE_PROJECT",
            projectName,
          };

        pendingProjectActions.set(
          conversationKey,
          pendingProjectAction
        );

        const reply = [
          `I can create the **${projectName}** project.`,
          "",
          "### Project Preview",
          "",
          "| Field | Value |",
          "| --- | --- |",
          `| Project Name | ${projectName} |`,
          "",
          "This is a preview only — the project has **not been created yet**.",
          "",
          `Would you like me to create **${projectName}**?`,
        ].join("\n");

        return res.json({
          success: true,
          data: {
            reply,
            intent:
              "CREATE_PROJECT",
            requiresConfirmation:
              true,
            preview:
              pendingProjectAction,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* PROJECT MEMBER / MANAGER QUERIES                                   */
      /* ------------------------------------------------------------------ */

      if (
        isProjectMemberQueryRequest(message) ||
        isProjectManagerQueryRequest(message)
      ) {
        const projectName = extractProjectQueryName(message);

        if (!projectName) {
          return res.json({
            success: true,
            data: {
              reply:
                isProjectManagerQueryRequest(message)
                  ? "Please provide the project name, for example: **Who manages Website Redesign?**"
                  : "Please provide the project name, for example: **Show me the members of Website Redesign.**",
              intent: "PROJECT_QUERY",
              requiresConfirmation: false,
            },
          });
        }

        const projectBase = await findProjectByName(projectName);

        const project = projectBase
          ? await prisma.project.findUnique({
              where: { id: projectBase.id },
              include: {
                manager: true,
                members: {
                  include: {
                    person: true,
                  },
                },
              },
            })
          : null;

        if (!project) {
          return res.json({
            success: true,
            data: {
              reply: `I couldn't find a project matching **${projectName}**.`,
              intent: "PROJECT_QUERY",
              requiresConfirmation: false,
            },
          });
        }

        if (isProjectManagerQueryRequest(message)) {
          return res.json({
            success: true,
            data: {
              reply: project.manager
                ? `### 👤 Project Manager\n\n**${project.name}** is managed by **${project.manager.fullName}**.`
                : `### 👤 Project Manager\n\n**${project.name}** does not currently have a manager assigned.`,
              intent: "PROJECT_QUERY",
              requiresConfirmation: false,
              project,
            },
          });
        }

        const members = project.members.map(
          (member) => member.person.fullName
        );

        return res.json({
          success: true,
          data: {
            reply: [
              `### 👥 ${project.name} — Project Members`,
              "",
              members.length > 0
                ? `**${project.name}** has **${members.length}** project member(s):`
                : `**${project.name}** currently has no project members.`,
              ...(members.length > 0
                ? ["", ...members.map((name) => `- **${name}**`)]
                : []),
            ].join("\n"),
            intent: "PROJECT_QUERY",
            requiresConfirmation: false,
            project,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* PROJECT QUERIES                                                    */
      /* ------------------------------------------------------------------ */

      if (
        isProjectQueryRequest(
          message
        )
      ) {
        const projectName =
          extractProjectQueryName(
            message
          );

        if (!projectName) {
          const allProjects =
            await prisma.project.findMany({
              include: {
                manager: true,
              },
              orderBy: {
                name: "asc",
              },
            });

          if (
            allProjects.length === 0
          ) {
            return res.json({
              success: true,
              data: {
                reply:
                  "There are currently no projects in the system.",
                intent:
                  "PROJECT_QUERY",
                requiresConfirmation:
                  false,
                projects: [],
              },
            });
          }

          const projectTasks =
            await prisma.task.findMany({
              where: {
                projectId: {
                  not: null,
                },
              },
            });

          const rows =
            allProjects.map(
              (project) => {
                const tasksForProject =
                  projectTasks.filter(
                    (task) =>
                      task.projectId ===
                      project.id
                  );

                const totalTasks =
                  tasksForProject.length;

                const completedTasks =
                  tasksForProject.filter(
                    (task) =>
                      task.status ===
                      "COMPLETED"
                  ).length;

                const progress =
                  totalTasks > 0
                    ? Math.round(
                        (completedTasks /
                          totalTasks) *
                          100
                      )
                    : 0;

                return `| ${project.name} | ${project.manager?.fullName || "No manager"} | ${project.status} | ${totalTasks} | ${completedTasks} | ${progress}% |`;
              }
            );

          const reply = [
            "### 📁 Projects",
            "",
            `I found **${allProjects.length}** project(s).`,
            "",
            "| Project | Manager | Status | Total Tasks | Completed | Progress |",
            "| --- | --- | --- | ---: | ---: | ---: |",
            ...rows,
          ].join("\n");

          return res.json({
            success: true,
            data: {
              reply,
              intent:
                "PROJECT_QUERY",
              requiresConfirmation:
                false,
              projects:
                allProjects,
            },
          });
        }

        const projectBase = projectName
          ? await findProjectByName(projectName)
          : null;

        const project = projectBase
          ? await prisma.project.findUnique({
              where: { id: projectBase.id },
              include: {
                manager: true,
                members: {
                  include: {
                    person: true,
                  },
                },
              },
            })
          : null;

        if (!project) {
          return res.json({
            success: true,
            data: {
              reply:
                `I couldn't find a project matching **${projectName}**.`,
              intent:
                "PROJECT_QUERY",
              requiresConfirmation:
                false,
            },
          });
        }

        const projectTasks =
          await prisma.task.findMany({
            where: {
              projectId:
                project.id,
            },
            include: {
              assignees: {
                include: {
                  person: true,
                },
              },
              department: true,
              skills: {
                include: {
                  skill: true,
                },
              },
            },
            orderBy: {
              createdAt: "desc",
            },
          });

        const completedTasks =
          projectTasks.filter(
            (task) =>
              task.status ===
              "COMPLETED"
          ).length;

        const progress =
          projectTasks.length > 0
            ? Math.round(
                (completedTasks /
                  projectTasks.length) *
                  100
              )
            : 0;

        const teamMembers = project.members.map(
          (member) => member.person
        );

        const taskRows =
          projectTasks.length > 0
            ? projectTasks.map(
                (task) => {
                  const assignees =
                    task.assignees.length > 0
                      ? task.assignees
                          .map(
                            (assignment) =>
                              assignment
                                .person
                                .fullName
                          )
                          .join(
                            ", "
                          )
                      : "Unassigned";

                  return `| ${task.id} | ${task.title} | ${task.status} | ${task.priority} | ${assignees} |`;
                }
              )
            : [
                "| — | No tasks | — | — | — |",
              ];

        const reply = [
          `### 📁 ${project.name}`,
          "",
          "| Project Information | Value |",
          "| --- | --- |",
          `| Project ID | ${project.id} |`,
          `| Status | ${project.status} |`,
          `| Client | ${project.client || "Not specified"} |`,
          `| Start Date | ${formatProjectDate(project.startDate)} |`,
          `| Due Date | ${formatProjectDate(project.dueDate)} |`,
          `| Manager | ${project.manager?.fullName || "No manager assigned"} |`,
          `| Total Tasks | ${projectTasks.length} |`,
          `| Completed Tasks | ${completedTasks} |`,
          `| Progress | ${progress}% |`,
          `| Team Members | ${teamMembers.length} |`,
          "",
          "### 📋 Project Tasks",
          "",
          "| ID | Task | Status | Priority | Assignee |",
          "| ---: | --- | --- | --- | --- |",
          ...taskRows,
          "",
          "### 👥 Project Team",
          "",
          teamMembers.length > 0
            ? teamMembers
                .map(
                  (person) =>
                    `- **${person.fullName}**`
                )
                .join("\n")
            : "No project members are currently assigned." ,
        ].join("\n");

        return res.json({
          success: true,
          data: {
            reply,
            intent:
              "PROJECT_QUERY",
            requiresConfirmation:
              false,
            project: {
              id:
                project.id,
              name:
                project.name,
              totalTasks:
                projectTasks.length,
              completedTasks,
              progress,
              teamMembers:
                teamMembers.map(
                  (person) => ({
                    id:
                      person.id,
                    name:
                      person.fullName,
                  })
                ),
            },
            tasks:
              projectTasks,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* TASK UPDATES                                                       */
      /* ------------------------------------------------------------------ */

      if (
        isTaskUpdateRequest(
          message
        )
      ) {
        const taskUpdate =
          await prepareTaskUpdate(
            message
          );

        pendingTaskUpdateActions.set(
          conversationKey,
          taskUpdate
        );

        return res.json({
          success: true,
          data: {
            reply:
              formatTaskUpdatePreview(
                taskUpdate
              ),
            intent:
              "UPDATE_TASK",
            requiresConfirmation:
              true,
            preview:
              taskUpdate,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* TASK DETAILS / QUERIES                                             */
      /* ------------------------------------------------------------------ */

      if (
        isTaskQueryRequest(
          message
        )
      ) {
        const taskId =
          extractTaskId(message);

        if (!taskId) {
          return res.json({
            success: true,
            data: {
              reply:
                "Please provide a task ID, for example: **Show me details of task 3**.",
              intent:
                "TASK_QUERY",
              requiresConfirmation:
                false,
            },
          });
        }

        const task =
          await prisma.task.findUnique({
            where: {
              id: taskId,
            },
            include: {
              project: true,
              department: true,
              skills: {
                include: {
                  skill: true,
                },
              },
              assignees: {
                include: {
                  person: {
                    include: {
                      department: true,
                    },
                  },
                },
              },
            },
          });

        if (!task) {
          return res.json({
            success: true,
            data: {
              reply:
                `I couldn't find task **#${taskId}** in the database.`,
              intent:
                "TASK_QUERY",
              requiresConfirmation:
                false,
            },
          });
        }

        const text =
          message.toLowerCase();

        if (
          text.includes("status") &&
          !text.includes("details")
        ) {
          return res.json({
            success: true,
            data: {
              reply:
                `### 📋 Task #${task.id}\n\n**${task.title}** is currently **${task.status}**.`,
              intent:
                "TASK_QUERY",
              requiresConfirmation:
                false,
              task,
            },
          });
        }

        if (
          text.includes("priority") &&
          !text.includes("details")
        ) {
          return res.json({
            success: true,
            data: {
              reply:
                `### 📋 Task #${task.id}\n\n**${task.title}** has **${task.priority}** priority.`,
              intent:
                "TASK_QUERY",
              requiresConfirmation:
                false,
              task,
            },
          });
        }

        if (
          text.includes("assigned") ||
          text.includes("assignee") ||
          text.includes("who is working")
        ) {
          const assignees =
            task.assignees.map(
              (assignment) =>
                assignment.person.fullName
            );

          return res.json({
            success: true,
            data: {
              reply:
                assignees.length > 0
                  ? `### 👤 Task #${task.id}\n\n**${task.title}** is assigned to **${assignees.join(", ")}**.`
                  : `### 👤 Task #${task.id}\n\n**${task.title}** is currently **unassigned**.`,
              intent:
                "TASK_QUERY",
              requiresConfirmation:
                false,
              task,
            },
          });
        }

        if (
          text.includes("skill") ||
          text.includes("skills") ||
          text.includes("requirement") ||
          text.includes("requirements")
        ) {
          const skills =
            task.skills.map(
              (item) =>
                item.skill.name
            );

          return res.json({
            success: true,
            data: {
              reply:
                skills.length > 0
                  ? [
                      `### 🛠️ Task #${task.id}`,
                      "",
                      `**${task.title}** requires the following skill(s):`,
                      "",
                      ...skills.map(
                        (skill) =>
                          `- ${skill}`
                      ),
                    ].join("\n")
                  : `### 🛠️ Task #${task.id}\n\nNo specific skills are currently required for **${task.title}**.`,
              intent:
                "TASK_QUERY",
              requiresConfirmation:
                false,
              task,
            },
          });
        }

        if (
          text.includes("project") &&
          !text.includes("details")
        ) {
          return res.json({
            success: true,
            data: {
              reply:
                task.project
                  ? `### 📁 Task #${task.id}\n\n**${task.title}** belongs to the **${task.project.name}** project.`
                  : `### 📁 Task #${task.id}\n\n**${task.title}** is not currently connected to a project.`,
              intent:
                "TASK_QUERY",
              requiresConfirmation:
                false,
              task,
            },
          });
        }

        if (
          text.includes("department") &&
          !text.includes("details")
        ) {
          return res.json({
            success: true,
            data: {
              reply:
                task.department
                  ? `### 🏢 Task #${task.id}\n\n**${task.title}** belongs to the **${task.department.name}** department.`
                  : `### 🏢 Task #${task.id}\n\n**${task.title}** is not currently connected to a department.`,
              intent:
                "TASK_QUERY",
              requiresConfirmation:
                false,
              task,
            },
          });
        }

        const reply =
          formatTaskDetails(
            task
          );

        return res.json({
          success: true,
          data: {
            reply,
            intent:
              "TASK_QUERY",
            requiresConfirmation:
              false,
            task,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* CONFIRM TASK                                                       */
      /* ------------------------------------------------------------------ */

      if (
        pendingTask &&
        pendingTask.intent ===
          "CREATE_TASK" &&
        isConfirmation(message)
      ) {
        const createdTask =
          await createTaskFromPendingAction(
            pendingTask.data
          );

        pendingTaskActions.delete(
          conversationKey
        );

        const createdSkillNames =
          createdTask.skills.map(
            (item) =>
              item.skill.name
          );

        return res.json({
          success: true,
          data: {
            reply: [
              `✅ Task **${createdTask.title}** has been created successfully.`,
              "",
              "| Field | Value |",
              "| --- | --- |",
              `| Task ID | ${createdTask.id} |`,
              `| Project | ${
                createdTask.project?.name ||
                "Not specified"
              } |`,
              `| Department | ${
                createdTask.department?.name ||
                "Not specified"
              } |`,
              `| Priority | ${createdTask.priority} |`,
              `| Status | ${createdTask.status} |`,
              `| Required Skills | ${
                createdSkillNames.length
                  ? createdSkillNames.join(
                      ", "
                    )
                  : "None"
              } |`,
              "",
              "The task is now visible in your Tasks/Kanban section.",
            ].join("\n"),
            intent:
              "CREATE_TASK",
            requiresConfirmation:
              false,
            task:
              createdTask,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* START TASK CREATION                                                */
      /* ------------------------------------------------------------------ */

      if (
        isTaskCreationRequest(
          message
        )
      ) {
        const taskData =
          await prepareTaskCreation(
            message
          );

        pendingTaskActions.set(
          conversationKey,
          {
            intent:
              "CREATE_TASK",
            data:
              taskData,
          }
        );

        const skillText =
          taskData.skillNames.length > 0
            ? taskData.skillNames.join(
                ", "
              )
            : "None currently in catalog";

        const missingSkillText =
          taskData.missingSkillNames.length > 0
            ? taskData.missingSkillNames.join(
                ", "
              )
            : "None";

        const reply = [
          `I can create the **${taskData.title}** task.`,
          "",
          "### Task Preview",
          "",
          "| Field | Value |",
          "| --- | --- |",
          `| Title | ${taskData.title} |`,
          `| Project | ${
            taskData.projectName ||
            "Not specified"
          } |`,
          `| Department | ${
            taskData.departmentName ||
            "Not specified"
          } |`,
          `| Priority | ${taskData.priority} |`,
          `| Status | ${taskData.status} |`,
          `| Required skills already available | ${skillText} |`,
          `| Missing skills | ${missingSkillText} |`,
          "",
          taskData.missingSkillNames.length > 0
            ? "The missing skills will be created automatically when you confirm."
            : "All requested skills already exist in the skill catalog.",
          "",
          "This is a preview only — the task has **not been created yet**.",
          "",
          "Would you like me to create this task?",
        ].join("\n");

        return res.json({
          success: true,
          data: {
            reply,
            intent:
              "CREATE_TASK",
            requiresConfirmation:
              true,
            preview:
              taskData,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* ASSIGNMENT RECOMMENDATION                                          */
      /* ------------------------------------------------------------------ */

      if (
        isAssignmentRequest(
          message
        )
      ) {
        const taskId =
          extractTaskId(message);

        if (taskId) {
          const recommendation =
            await getAssignmentRecommendation(
              taskId
            );

          const best =
            recommendation.bestCandidate;

          if (!best) {
            return res.json({
              success: true,
              data: {
                reply:
                  "I couldn't find an active team member who is currently suitable for this task.",
                intent:
                  "ASSIGN_TASK",
                requiresConfirmation:
                  false,
                recommendation,
              },
            });
          }

          const task =
            await prisma.task.findUnique({
              where: {
                id: taskId,
              },
              include: {
                assignees: {
                  include: {
                    person: true,
                  },
                },
              },
            });

          const currentAssignee =
            task?.assignees?.length
              ? task.assignees
                  .map(
                    (assignment) =>
                      assignment
                        .person
                        .fullName
                  )
                  .join(", ")
              : "Unassigned";

          pendingTaskUpdateActions.set(
            conversationKey,
            {
              intent:
                "UPDATE_TASK",
              taskId,
              field:
                "assignee",
              value:
                best.id,
              displayValue:
                best.name,
              oldValue:
                currentAssignee,
              personId:
                best.id,
              personName:
                best.name,
            }
          );

          const reply = [
            `I recommend **${best.name}** for task **${recommendation.task.title}**.`,
            "",
            `**Match score:** ${best.totalScore}/100`,
            "",
            `- Skill match: ${best.skillMatch}%`,
            `- Department match: ${best.departmentMatch}%`,
            `- Availability: ${best.availabilityScore}%`,
            `- Workload: ${best.workloadScore}%`,
            `- Experience: ${best.experienceScore}%`,
            "",
            `**Current workload:** ${best.activeTaskCount} active task(s)`,
            `**Department:** ${
              best.department ||
              "Not specified"
            }`,
            `**Role:** ${
              best.role ||
              "Not specified"
            }`,
            `**Experience:** ${best.experience} year(s)`,
            "",
            `Would you like me to assign this task to **${best.name}**?`,
          ].join("\n");

          return res.json({
            success: true,
            data: {
              reply,
              intent:
                "ASSIGN_TASK",
              requiresConfirmation:
                true,
              taskId,
              recommendation,
            },
          });
        }
      }

      /* ------------------------------------------------------------------ */
      /* LOAD DATABASE CONTEXT                                              */
      /* ------------------------------------------------------------------ */

      const [
        people,
        departments,
        skills,
        projects,
        tasks,
      ] = await Promise.all([
        prisma.person.findMany({
          where: {
            isActive: true,
          },
          include: {
            department: true,
            skills: {
              include: {
                skill: true,
              },
            },
            assignedTasks: {
              include: {
                task: true,
              },
            },
          },
          orderBy: {
            fullName: "asc",
          },
        }),

        prisma.department.findMany({
          orderBy: {
            name: "asc",
          },
        }),

        prisma.skill.findMany({
          orderBy: {
            name: "asc",
          },
        }),

        prisma.project.findMany({
          orderBy: {
            name: "asc",
          },
        }),

        prisma.task.findMany({
          include: {
            project: true,
            department: true,
            skills: {
              include: {
                skill: true,
              },
            },
            assignees: {
              include: {
                person: {
                  include: {
                    department: true,
                    skills: {
                      include: {
                        skill: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        }),
      ]);

      /* ------------------------------------------------------------------ */
      /* PEOPLE CONTEXT                                                      */
      /* ------------------------------------------------------------------ */

      const peopleContext =
        people.map((person) => ({
          id:
            person.id,
          name:
            person.fullName,
          email:
            person.email,
          phone:
            person.phone,
          location:
            person.location,
          department:
            person.department?.name ||
            null,
          jobTitle:
            person.jobTitle,
          role:
            person.role,
          experience:
            person.experience,
          employmentType:
            person.employmentType,
          availability:
            person.availability,
          isActive:
            person.isActive,
          skills:
            person.skills.map(
              (item) =>
                item.skill.name
            ),
          preferredTaskTypes:
            person.preferredTaskTypes,
          activeTaskCount:
            person.assignedTasks.filter(
              (assignment) =>
                assignment.task.status !==
                "COMPLETED"
            ).length,
        }));

      /* ------------------------------------------------------------------ */
      /* DEPARTMENT CONTEXT                                                 */
      /* ------------------------------------------------------------------ */

      const departmentsContext =
        departments.map(
          (department) => ({
            id:
              department.id,
            name:
              department.name,
            description:
              department.description,
          })
        );

      /* ------------------------------------------------------------------ */
      /* SKILLS CONTEXT                                                      */
      /* ------------------------------------------------------------------ */

      const skillsContext =
        skills.map((skill) => ({
          id:
            skill.id,
          name:
            skill.name,
          description:
            skill.description,
        }));

      /* ------------------------------------------------------------------ */
      /* PROJECT CONTEXT                                                     */
      /* ------------------------------------------------------------------ */

      const projectsContext =
        projects.map(
          (project) => ({
            id:
              project.id,
            name:
              project.name,
            description:
              project.description,
            status:
              project.status,
            managerId:
              project.managerId,
          })
        );

      /* ------------------------------------------------------------------ */
      /* TASK CONTEXT                                                        */
      /* ------------------------------------------------------------------ */

      const tasksContext =
        tasks.map((task) => ({
          id:
            task.id,
          title:
            task.title,
          description:
            task.description,
          status:
            task.status,
          priority:
            task.priority,
          taskType:
            task.taskType,
          startDate:
            task.startDate,
          dueDate:
            task.dueDate,
          estimatedHours:
            task.estimatedHours,
          actualHours:
            task.actualHours,
          department:
            task.department?.name ||
            null,
          project:
            task.project?.name ||
            null,
          requiredSkills:
            task.skills.map(
              (item) =>
                item.skill.name
            ),
          assignees:
            task.assignees.map(
              (assignment) => ({
                id:
                  assignment.person.id,
                name:
                  assignment.person
                    .fullName,
              })
            ),
        }));

      /* ------------------------------------------------------------------ */
      /* AI SYSTEM PROMPT                                                    */
      /* ------------------------------------------------------------------ */

      const systemPrompt = `
You are the AI Task Bot for a team and task management system.

You act as a Senior Project Manager and Task Assignee.

Your responsibilities include:

1. Understanding team members.
2. Understanding departments.
3. Understanding skills.
4. Understanding task requirements.
5. Understanding availability.
6. Understanding workload.
7. Understanding experience.
8. Helping users create and manage tasks.
9. Helping users manage people.
10. Helping users manage projects.
11. Recommending suitable people for tasks.
12. Explaining recommendations clearly.
13. Helping users update existing tasks.
14. Helping users understand team structure.

IMPORTANT RULES:

- Never invent team members.
- Never invent skills.
- Never invent tasks.
- Never invent projects.
- Use the database context supplied below.
- When discussing assignment recommendations, prefer the backend scoring system.
- Do not claim that a task has been assigned unless the backend confirms it.
- Do not claim that a person was created unless the backend confirms it.
- Do not claim that a task was created unless the backend confirms it.
- Do not claim that a project was created unless the backend confirms it.
- Do not claim that a task was updated unless the backend confirms it.
- Do not claim that a person was updated unless the backend confirms it.
- For destructive or important actions, ask for confirmation.
- Be concise but helpful.
- If the user asks about team skills, use the actual skills data.
- If the user asks about team members, use the actual people data.
- If the user asks about tasks, use the actual task data.
- If the user asks about projects, use the actual projects data.
- If the user asks who is available, use the actual availability and active task counts from the database.
- If the user asks who has the least workload, order team members by active task count.
- If the user asks who is overloaded, identify people with comparatively high active task counts.
- If the user asks who can take a new task, do not assume that "new task" means the user wants to create a task.
- If the user refers to "him", "her", "them", "this person", or "that person", use the conversation context when available.
- Never switch an existing person-creation conversation into a task-creation conversation unless the user clearly starts a new task request.
- Never switch an existing task-update conversation into a task-creation conversation.

PEOPLE / TEAM MANAGEMENT:

- Use actual people from the database.
- When asked to show all team members, list actual database members.
- When asked for a person's details, use the actual database record.
- When asked about a person's skills, use the actual PersonSkill records.
- When asked about a person's department, use the actual department relationship.
- When asked who works in a department, use the actual department relationship.
- When asked how many people are in a department, count actual database records.
- When asked who has a particular skill, use actual PersonSkill records.
- Never invent a person.
- Never invent a skill.
- Never invent a department.
- Important people changes require confirmation.
- Person skill changes require confirmation.
- Department changes require confirmation.
- Availability changes require confirmation.
- Activation/deactivation changes require confirmation.
- Never claim a person was changed until the backend confirms it.

PROJECT MANAGEMENT:

- Use the actual project data when answering project questions.
- When the user asks for all projects, provide the projects from the database.
- When the user asks about a specific project, use its real database record.
- When possible, include project task count and progress.
- When the user asks who is working on a project, use actual task assignees.
- When the user asks about project tasks, use actual tasks connected to that project.
- When the user wants to create a project, the backend handles the actual database creation.
- A project must be checked against existing projects before creation.
- Do not create duplicate projects.
- Do not claim a project exists until the backend confirms it.
- Ask for confirmation before creating a project.
- Project updates are handled by the backend and require confirmation.
- Supported project updates include status, due date, manager, and project membership.
- When asked for project members, use the actual ProjectMember records.
- When asked who manages a project, use the actual project manager relationship.
- Never claim a project update happened until the backend confirms it.

TASK MANAGEMENT:

- When the user asks for task details, use the actual task from the database.
- When the user asks for a task's status, use the actual task status.
- When the user asks for a task's priority, use the actual priority.
- When the user asks who is assigned to a task, use the actual task assignees.
- When the user asks what skills a task requires, use the actual required skills.
- When the user asks which project a task belongs to, use the actual project relationship.
- When the user asks which department owns a task, use the actual department relationship.
- Never invent task information.
- If a task ID does not exist, clearly tell the user that the task could not be found.

TASK UPDATES:

- The backend handles task updates.
- Supported task updates include status, priority, assignee, project, department and due date.
- Important task changes require confirmation before the database is changed.
- Never claim that an update happened until the backend confirms the update.
- Use the actual task data supplied by the backend.
- When assigning a task, use real team members from the database.
- When moving a task to a project, use a real project from the database.
- When changing a task department, use a real department from the database.
- Never invent a team member, project or department for an update.

TASK CREATION:

- When the user wants to create a task, identify the title, project, department, priority, status and required skills when available.
- The backend handles actual database creation.
- Do not claim the task exists until the backend confirms creation.
- Missing requested skills may be created by the backend after confirmation.

ASSIGNMENT SCORING:

Skill Match = 40%

Department Match = 20%

Availability = 15%

Workload = 15%

Experience = 10%

The backend calculates these scores deterministically.

When asked who should be assigned to a task, do not make up your own score.

CURRENT TEAM:

${JSON.stringify(
  peopleContext,
  null,
  2
)}

CURRENT DEPARTMENTS:

${JSON.stringify(
  departmentsContext,
  null,
  2
)}

CURRENT SKILLS:

${JSON.stringify(
  skillsContext,
  null,
  2
)}

CURRENT PROJECTS:

${JSON.stringify(
  projectsContext,
  null,
  2
)}

CURRENT TASKS:

${JSON.stringify(
  tasksContext,
  null,
  2
)}

USER REQUEST:

${message}
`;

      /* ------------------------------------------------------------------ */
      /* NORMAL AI RESPONSE                                                 */
      /* ------------------------------------------------------------------ */

      const aiResponse =
        await generateAIResponse(
          systemPrompt
        );

      return res.json({
        success: true,
        data: {
          reply:
            aiResponse,
        },
      });
    } catch (error) {
      console.error(
        "AI request failed:",
        error
      );

      const errorMessage =
        error instanceof Error
          ? error.message
          : "AI request failed.";

      return res.status(500).json({
        success: false,
        message:
          errorMessage,
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* 404 HANDLER                                                                */
/* -------------------------------------------------------------------------- */

app.use(
  (
    _req: Request,
    res: Response
  ) => {
    res.status(404).json({
      success: false,
      message:
        "Route not found",
    });
  }
);

/* -------------------------------------------------------------------------- */
/* ERROR HANDLER                                                              */
/* -------------------------------------------------------------------------- */

app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error(
      "Unhandled server error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Internal server error.",
    });
  }
);

/* -------------------------------------------------------------------------- */
/* START SERVER                                                               */
/* -------------------------------------------------------------------------- */

app.listen(PORT, () => {
  console.log(
    `Backend server running on http://localhost:${PORT}`
  );
});