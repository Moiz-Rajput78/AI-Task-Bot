import { z } from "zod";

/**
 * Shared validation schemas for AI Task Bot.
 *
 * These schemas intentionally mirror the existing frontend forms
 * and backend data model. They are kept in one place so the same
 * validation rules can be reused by React Hook Form and other
 * client-side form handlers without duplicating rules.
 */

/* -------------------------------------------------------------------------- */
/* Common helpers                                                             */
/* -------------------------------------------------------------------------- */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""));

const requiredText = (field: string, max = 255) =>
  z
    .string()
    .trim()
    .min(1, `${field} is required.`)
    .max(max, `${field} must be ${max} characters or fewer.`);

const optionalIntegerString = (
  field: string,
  minimum = 0,
  maximum = 100000
) =>
  z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" ||
        (Number.isInteger(Number(value)) &&
          Number(value) >= minimum &&
          Number(value) <= maximum),
      `${field} must be a valid number.`
    );

const optionalDate = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || !Number.isNaN(Date.parse(value)),
    "Please enter a valid date."
  );

const idString = (field: string) =>
  z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d+$/.test(value),
      `${field} must be a valid ID.`
    );

/* -------------------------------------------------------------------------- */
/* Person                                                                     */
/* -------------------------------------------------------------------------- */

export const personSchema = z
  .object({
    fullName: requiredText("Full name", 120),

    email: z
      .string()
      .trim()
      .min(1, "Email is required.")
      .email("Please enter a valid email address.")
      .max(255),

    phone: optionalText(40),

    profileImage: z
      .string()
      .trim()
      .max(1000)
      .refine(
        (value) =>
          value === "" ||
          /^https?:\/\/.+/i.test(value),
        "Profile image must be a valid HTTP/HTTPS URL."
      )
      .optional()
      .or(z.literal("")),

    location: optionalText(160),

    departmentId: idString("Department"),

    jobTitle: optionalText(120),

    role: optionalText(120),

    experience: optionalIntegerString(
      "Experience",
      0,
      100
    ),

    employmentType: z
      .string()
      .trim()
      .min(1, "Employment type is required."),

    joiningDate: optionalDate,

    availability: z
      .string()
      .trim()
      .min(1, "Availability is required."),

    bio: optionalText(2000),

    notes: optionalText(4000),

    preferredTaskTypes: optionalText(500),

    skillIds: z
      .array(z.number().int().positive())
      .max(100),
  })
  .superRefine((data, ctx) => {
    if (
      data.joiningDate &&
      data.joiningDate !== ""
    ) {
      const joiningDate = new Date(
        data.joiningDate
      );

      if (joiningDate > new Date()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["joiningDate"],
          message:
            "Joining date cannot be in the future.",
        });
      }
    }
  });

export type PersonFormValues = z.infer<
  typeof personSchema
>;

/* -------------------------------------------------------------------------- */
/* Department                                                                 */
/* -------------------------------------------------------------------------- */

export const departmentSchema = z.object({
  name: requiredText("Department name", 120),
  description: optionalText(1000),
});

export type DepartmentFormValues = z.infer<
  typeof departmentSchema
>;

/* -------------------------------------------------------------------------- */
/* Skill                                                                      */
/* -------------------------------------------------------------------------- */

export const skillSchema = z.object({
  name: requiredText("Skill name", 120),
  description: optionalText(1000),
});

export type SkillFormValues = z.infer<
  typeof skillSchema
>;

/* -------------------------------------------------------------------------- */
/* Project                                                                    */
/* -------------------------------------------------------------------------- */

export const projectSchema = z
  .object({
    name: requiredText("Project name", 160),

    description: optionalText(3000),

    client: optionalText(160),

    startDate: optionalDate,

    dueDate: optionalDate,

    status: z
      .string()
      .trim()
      .min(1, "Project status is required."),

    managerId: idString("Project manager"),

    memberIds: z
      .array(z.number().int().positive())
      .max(500),
  })
  .superRefine((data, ctx) => {
    if (
      data.startDate &&
      data.dueDate &&
      data.startDate !== "" &&
      data.dueDate !== ""
    ) {
      const start = new Date(data.startDate);
      const due = new Date(data.dueDate);

      if (due < start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dueDate"],
          message:
            "Due date cannot be earlier than the start date.",
        });
      }
    }
  });

export type ProjectFormValues = z.infer<
  typeof projectSchema
>;

/* -------------------------------------------------------------------------- */
/* Task                                                                       */
/* -------------------------------------------------------------------------- */

export const taskSchema = z
  .object({
    title: requiredText("Task title", 200),

    description: optionalText(10000),

    priority: z
      .string()
      .trim()
      .min(1, "Priority is required."),

    status: z
      .string()
      .trim()
      .min(1, "Task status is required."),

    projectId: idString("Project"),

    departmentId: idString("Department"),

    taskType: optionalText(120),

    startDate: optionalDate,

    dueDate: optionalDate,

    estimatedHours: optionalIntegerString(
      "Estimated hours",
      0,
      100000
    ),

    actualHours: optionalIntegerString(
      "Actual hours",
      0,
      100000
    ),

    labels: optionalText(1000),

    skillIds: z
      .array(z.number().int().positive())
      .max(100),

    assigneeIds: z
      .array(z.number().int().positive())
      .max(100),
  })
  .superRefine((data, ctx) => {
    if (
      data.startDate &&
      data.dueDate &&
      data.startDate !== "" &&
      data.dueDate !== ""
    ) {
      const start = new Date(data.startDate);
      const due = new Date(data.dueDate);

      if (due < start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dueDate"],
          message:
            "Due date cannot be earlier than the start date.",
        });
      }
    }

    if (
      data.estimatedHours !== "" &&
      data.actualHours !== ""
    ) {
      const estimated = Number(
        data.estimatedHours
      );
      const actual = Number(data.actualHours);

      if (
        Number.isFinite(estimated) &&
        Number.isFinite(actual) &&
        actual < 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["actualHours"],
          message:
            "Actual hours cannot be negative.",
        });
      }
    }
  });

export type TaskFormValues = z.infer<
  typeof taskSchema
>;

/* -------------------------------------------------------------------------- */
/* AI chat                                                                    */
/* -------------------------------------------------------------------------- */

export const aiMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Please enter a message.")
    .max(
      10000,
      "AI messages must be 10,000 characters or fewer."
    ),
});

export type AiMessageValues = z.infer<
  typeof aiMessageSchema
>;

/* -------------------------------------------------------------------------- */
/* Shared enum-like validation                                                */
/* -------------------------------------------------------------------------- */

export const taskStatusSchema = z.enum([
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "REVIEW",
  "COMPLETED",
]);

export const taskPrioritySchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
]);

export const projectStatusSchema = z.enum([
  "PLANNING",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
]);

export const availabilitySchema = z.enum([
  "AVAILABLE",
  "PARTIALLY_AVAILABLE",
  "BUSY",
  "ON_LEAVE",
  "INACTIVE",
]);

/* -------------------------------------------------------------------------- */
/* Utility                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Converts a Zod error into a simple field -> message object.
 *
 * This is useful when integrating these schemas with the existing
 * controlled form state in page.tsx.
 */
export function getValidationErrors(
  error: z.ZodError
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];

    if (
      typeof field === "string" &&
      !result[field]
    ) {
      result[field] = issue.message;
    }
  }

  return result;
}

/**
 * Safely validate data without throwing.
 */
export function validateForm<T>(
  schema: z.ZodType<T>,
  data: unknown
):
  | {
      success: true;
      data: T;
      errors: null;
    }
  | {
      success: false;
      data: null;
      errors: Record<string, string>;
    } {
  const result = schema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
      errors: null,
    };
  }

  return {
    success: false,
    data: null,
    errors: getValidationErrors(result.error),
  };
}