import { Router, Request, Response } from "express";
import { PrismaClient, TaskStatus, Priority } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

/* =========================================================
   HELPERS
========================================================= */

function parseId(value: unknown): number | undefined {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    return undefined;
  }

  return id;
}

function normalizeStatus(value: unknown): TaskStatus | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  const aliases: Record<string, TaskStatus> = {
    BACKLOG: TaskStatus.BACKLOG,

    TODO: TaskStatus.TODO,
    TO_DO: TaskStatus.TODO,

    IN_PROGRESS: TaskStatus.IN_PROGRESS,
    INPROGRESS: TaskStatus.IN_PROGRESS,
    TODO_IN_PROGRESS: TaskStatus.IN_PROGRESS,
    TO_DO_IN_PROGRESS: TaskStatus.IN_PROGRESS,

    REVIEW: TaskStatus.REVIEW,

    COMPLETED: TaskStatus.COMPLETED,
    COMPLETE: TaskStatus.COMPLETED,
    DONE: TaskStatus.COMPLETED,
  };

  return aliases[normalized];
}

function normalizePriority(value: unknown): Priority | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();

  if (
    normalized === "LOW" ||
    normalized === "MEDIUM" ||
    normalized === "HIGH" ||
    normalized === "URGENT"
  ) {
    return normalized as Priority;
  }

  return undefined;
}

function parseDate(
  value: unknown
): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date;
}

/* =========================================================
   TASK INCLUDE
========================================================= */

const taskInclude = {
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

  comments: {
    orderBy: {
      createdAt: "desc" as const,
    },
  },

  checklist: {
    orderBy: {
      createdAt: "asc" as const,
    },
  },

  activities: {
    orderBy: {
      createdAt: "desc" as const,
    },
    include: {
      person: true,
    },
  },
};

/* =========================================================
   GET ALL TASKS
========================================================= */

router.get("/", async (_req: Request, res: Response) => {
  try {
    const tasks = await prisma.task.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: taskInclude,
    });

    return res.json(tasks);
  } catch (error) {
    console.error("GET /tasks error:", error);

    return res.status(500).json({
      error: "Failed to fetch tasks",
    });
  }
});

/* =========================================================
   GET SINGLE TASK
========================================================= */

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        error: "Invalid task ID",
      });
    }

    const task = await prisma.task.findUnique({
      where: {
        id,
      },
      include: taskInclude,
    });

    if (!task) {
      return res.status(404).json({
        error: "Task not found",
      });
    }

    return res.json(task);
  } catch (error) {
    console.error("GET /tasks/:id error:", error);

    return res.status(500).json({
      error: "Failed to fetch task",
    });
  }
});

/* =========================================================
   CREATE TASK
========================================================= */

router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      status,
      priority,
      taskType,
      startDate,
      dueDate,
      estimatedHours,
      actualHours,
      labels,
      completed,
      projectId,
      departmentId,
      skillIds,
      assigneeIds,
    } = req.body;

    if (
      !title ||
      typeof title !== "string" ||
      !title.trim()
    ) {
      return res.status(400).json({
        error: "Task title is required",
      });
    }

    const normalizedStatus =
      status !== undefined
        ? normalizeStatus(status)
        : TaskStatus.TODO;

    if (!normalizedStatus) {
      return res.status(400).json({
        error: "Invalid task status",
        allowedStatuses: [
          "BACKLOG",
          "TODO",
          "IN_PROGRESS",
          "REVIEW",
          "COMPLETED",
        ],
      });
    }

    const normalizedPriority =
      priority !== undefined
        ? normalizePriority(priority)
        : Priority.MEDIUM;

    if (!normalizedPriority) {
      return res.status(400).json({
        error: "Invalid task priority",
        allowedPriorities: [
          "LOW",
          "MEDIUM",
          "HIGH",
          "URGENT",
        ],
      });
    }

    const parsedStartDate = parseDate(startDate);
    const parsedDueDate = parseDate(dueDate);

    if (
      startDate !== undefined &&
      parsedStartDate === undefined
    ) {
      return res.status(400).json({
        error: "Invalid start date",
      });
    }

    if (
      dueDate !== undefined &&
      parsedDueDate === undefined
    ) {
      return res.status(400).json({
        error: "Invalid due date",
      });
    }

    const parsedProjectId =
      projectId !== undefined && projectId !== null
        ? parseId(projectId)
        : undefined;

    const parsedDepartmentId =
      departmentId !== undefined && departmentId !== null
        ? parseId(departmentId)
        : undefined;

    if (
      projectId !== undefined &&
      projectId !== null &&
      !parsedProjectId
    ) {
      return res.status(400).json({
        error: "Invalid project ID",
      });
    }

    if (
      departmentId !== undefined &&
      departmentId !== null &&
      !parsedDepartmentId
    ) {
      return res.status(400).json({
        error: "Invalid department ID",
      });
    }

    const parsedSkillIds = Array.isArray(skillIds)
      ? skillIds
          .map((id: unknown) => parseId(id))
          .filter(
            (id): id is number => id !== undefined
          )
      : [];

    const parsedAssigneeIds = Array.isArray(assigneeIds)
      ? assigneeIds
          .map((id: unknown) => parseId(id))
          .filter(
            (id): id is number => id !== undefined
          )
      : [];

    const task = await prisma.$transaction(
      async (tx) => {
        const createdTask = await tx.task.create({
          data: {
            title: title.trim(),

            description:
              description !== undefined &&
              description !== null
                ? String(description).trim()
                : null,

            status: normalizedStatus,
            priority: normalizedPriority,

            taskType:
              taskType !== undefined &&
              taskType !== null
                ? String(taskType)
                : null,

            startDate:
              parsedStartDate !== undefined
                ? parsedStartDate
                : null,

            dueDate:
              parsedDueDate !== undefined
                ? parsedDueDate
                : null,

            estimatedHours:
              estimatedHours !== undefined &&
              estimatedHours !== null
                ? Number(estimatedHours)
                : null,

            actualHours:
              actualHours !== undefined &&
              actualHours !== null
                ? Number(actualHours)
                : null,

            labels:
              labels !== undefined && labels !== null
                ? String(labels)
                : null,

            completed:
              typeof completed === "boolean"
                ? completed
                : normalizedStatus ===
                    TaskStatus.COMPLETED,

            ...(parsedProjectId
              ? {
                  project: {
                    connect: {
                      id: parsedProjectId,
                    },
                  },
                }
              : {}),

            ...(parsedDepartmentId
              ? {
                  department: {
                    connect: {
                      id: parsedDepartmentId,
                    },
                  },
                }
              : {}),
          },
        });

        for (const skillId of parsedSkillIds) {
          await tx.taskSkill.create({
            data: {
              taskId: createdTask.id,
              skillId,
            },
          });
        }

        for (const personId of parsedAssigneeIds) {
          await tx.taskAssignee.create({
            data: {
              taskId: createdTask.id,
              personId,
            },
          });
        }

        await tx.activityLog.create({
          data: {
            action: "CREATED",
            entity: "TASK",
            details: `Task "${createdTask.title}" was created`,
            taskId: createdTask.id,
            isAI: false,
          },
        });

        return createdTask;
      }
    );

    const completeTask =
      await prisma.task.findUnique({
        where: {
          id: task.id,
        },
        include: taskInclude,
      });

    return res.status(201).json(completeTask);
  } catch (error) {
    console.error("POST /tasks error:", error);

    return res.status(500).json({
      error: "Failed to create task",
      details:
        error instanceof Error
          ? error.message
          : undefined,
    });
  }
});

/* =========================================================
   UPDATE TASK
========================================================= */

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        error: "Invalid task ID",
      });
    }

    const existingTask =
      await prisma.task.findUnique({
        where: {
          id,
        },
      });

    if (!existingTask) {
      return res.status(404).json({
        error: "Task not found",
      });
    }

    const {
      title,
      description,
      status,
      priority,
      taskType,
      startDate,
      dueDate,
      estimatedHours,
      actualHours,
      labels,
      completed,
      projectId,
      departmentId,
      skillIds,
      assigneeIds,
    } = req.body;

    /* -------------------------
       STATUS
    ------------------------- */

    let normalizedStatus:
      | TaskStatus
      | undefined;

    if (status !== undefined) {
      normalizedStatus = normalizeStatus(status);

      if (!normalizedStatus) {
        return res.status(400).json({
          error: "Invalid task status",
          allowedStatuses: [
            "BACKLOG",
            "TODO",
            "IN_PROGRESS",
            "REVIEW",
            "COMPLETED",
          ],
        });
      }
    }

    /* -------------------------
       PRIORITY
    ------------------------- */

    let normalizedPriority:
      | Priority
      | undefined;

    if (priority !== undefined) {
      normalizedPriority =
        normalizePriority(priority);

      if (!normalizedPriority) {
        return res.status(400).json({
          error: "Invalid task priority",
          allowedPriorities: [
            "LOW",
            "MEDIUM",
            "HIGH",
            "URGENT",
          ],
        });
      }
    }

    /* -------------------------
       DATES
    ------------------------- */

    const parsedStartDate =
      startDate !== undefined
        ? parseDate(startDate)
        : undefined;

    const parsedDueDate =
      dueDate !== undefined
        ? parseDate(dueDate)
        : undefined;

    if (
      startDate !== undefined &&
      parsedStartDate === undefined
    ) {
      return res.status(400).json({
        error: "Invalid start date",
      });
    }

    if (
      dueDate !== undefined &&
      parsedDueDate === undefined
    ) {
      return res.status(400).json({
        error: "Invalid due date",
      });
    }

    /* -------------------------
       PROJECT
    ------------------------- */

    let parsedProjectId:
      | number
      | null
      | undefined;

    if (projectId !== undefined) {
      if (projectId === null || projectId === "") {
        parsedProjectId = null;
      } else {
        parsedProjectId = parseId(projectId);

        if (!parsedProjectId) {
          return res.status(400).json({
            error: "Invalid project ID",
          });
        }
      }
    }

    /* -------------------------
       DEPARTMENT
    ------------------------- */

    let parsedDepartmentId:
      | number
      | null
      | undefined;

    if (departmentId !== undefined) {
      if (
        departmentId === null ||
        departmentId === ""
      ) {
        parsedDepartmentId = null;
      } else {
        parsedDepartmentId =
          parseId(departmentId);

        if (!parsedDepartmentId) {
          return res.status(400).json({
            error: "Invalid department ID",
          });
        }
      }
    }

    /* -------------------------
       SKILLS
    ------------------------- */

    let parsedSkillIds:
      | number[]
      | undefined;

    if (Array.isArray(skillIds)) {
      parsedSkillIds = skillIds
        .map((id: unknown) => parseId(id))
        .filter(
          (id): id is number => id !== undefined
        );
    }

    /* -------------------------
       ASSIGNEES
    ------------------------- */

    let parsedAssigneeIds:
      | number[]
      | undefined;

    if (Array.isArray(assigneeIds)) {
      parsedAssigneeIds = assigneeIds
        .map((id: unknown) => parseId(id))
        .filter(
          (id): id is number => id !== undefined
        );
    }

    /* -------------------------
       BUILD UPDATE DATA
    ------------------------- */

    const updateData: any = {};

    if (title !== undefined) {
      if (
        typeof title !== "string" ||
        !title.trim()
      ) {
        return res.status(400).json({
          error: "Task title cannot be empty",
        });
      }

      updateData.title = title.trim();
    }

    if (description !== undefined) {
      updateData.description =
        description === null
          ? null
          : String(description).trim();
    }

    if (normalizedStatus !== undefined) {
      updateData.status = normalizedStatus;

      /*
       * Keep completed boolean synchronized
       * with task status.
       */
      if (completed === undefined) {
        updateData.completed =
          normalizedStatus ===
          TaskStatus.COMPLETED;
      }
    }

    if (normalizedPriority !== undefined) {
      updateData.priority =
        normalizedPriority;
    }

    if (taskType !== undefined) {
      updateData.taskType =
        taskType === null
          ? null
          : String(taskType);
    }

    if (startDate !== undefined) {
      updateData.startDate =
        parsedStartDate;
    }

    if (dueDate !== undefined) {
      updateData.dueDate =
        parsedDueDate;
    }

    if (estimatedHours !== undefined) {
      updateData.estimatedHours =
        estimatedHours === null ||
        estimatedHours === ""
          ? null
          : Number(estimatedHours);
    }

    if (actualHours !== undefined) {
      updateData.actualHours =
        actualHours === null ||
        actualHours === ""
          ? null
          : Number(actualHours);
    }

    if (labels !== undefined) {
      updateData.labels =
        labels === null
          ? null
          : String(labels);
    }

    if (completed !== undefined) {
      updateData.completed =
        Boolean(completed);
    }

    /* -------------------------
       PROJECT RELATION
    ------------------------- */

    if (parsedProjectId !== undefined) {
      updateData.project =
        parsedProjectId === null
          ? {
              disconnect: true,
            }
          : {
              connect: {
                id: parsedProjectId,
              },
            };
    }

    /* -------------------------
       DEPARTMENT RELATION
    ------------------------- */

    if (parsedDepartmentId !== undefined) {
      updateData.department =
        parsedDepartmentId === null
          ? {
              disconnect: true,
            }
          : {
              connect: {
                id: parsedDepartmentId,
              },
            };
    }

    /* =====================================================
       TRANSACTION
    ===================================================== */

    const updatedTask =
      await prisma.$transaction(
        async (tx) => {
          const task =
            await tx.task.update({
              where: {
                id,
              },
              data: updateData,
            });

          /* -------------------------
             UPDATE SKILLS
          ------------------------- */

          if (parsedSkillIds !== undefined) {
            await tx.taskSkill.deleteMany({
              where: {
                taskId: id,
              },
            });

            for (const skillId of parsedSkillIds) {
              await tx.taskSkill.create({
                data: {
                  taskId: id,
                  skillId,
                },
              });
            }
          }

          /* -------------------------
             UPDATE ASSIGNEES
          ------------------------- */

          if (
            parsedAssigneeIds !== undefined
          ) {
            await tx.taskAssignee.deleteMany({
              where: {
                taskId: id,
              },
            });

            for (const personId of parsedAssigneeIds) {
              await tx.taskAssignee.create({
                data: {
                  taskId: id,
                  personId,
                },
              });
            }
          }

          /* -------------------------
             ACTIVITY LOG
          ------------------------- */

          const changes: string[] = [];

          if (
            normalizedStatus !== undefined &&
            normalizedStatus !==
              existingTask.status
          ) {
            changes.push(
              `status changed from ${existingTask.status} to ${normalizedStatus}`
            );
          }

          if (
            normalizedPriority !== undefined &&
            normalizedPriority !==
              existingTask.priority
          ) {
            changes.push(
              `priority changed from ${existingTask.priority} to ${normalizedPriority}`
            );
          }

          if (
            title !== undefined &&
            title !== existingTask.title
          ) {
            changes.push("title updated");
          }

          if (description !== undefined) {
            changes.push(
              "description updated"
            );
          }

          if (taskType !== undefined) {
            changes.push(
              "task type updated"
            );
          }

          if (startDate !== undefined) {
            changes.push(
              "start date updated"
            );
          }

          if (dueDate !== undefined) {
            changes.push(
              "due date updated"
            );
          }

          if (
            estimatedHours !== undefined
          ) {
            changes.push(
              "estimated hours updated"
            );
          }

          if (actualHours !== undefined) {
            changes.push(
              "actual hours updated"
            );
          }

          if (labels !== undefined) {
            changes.push("labels updated");
          }

          if (completed !== undefined) {
            changes.push(
              "completion state updated"
            );
          }

          if (projectId !== undefined) {
            changes.push(
              "project updated"
            );
          }

          if (
            departmentId !== undefined
          ) {
            changes.push(
              "department updated"
            );
          }

          if (
            parsedSkillIds !== undefined
          ) {
            changes.push("skills updated");
          }

          if (
            parsedAssigneeIds !== undefined
          ) {
            changes.push(
              "assignees updated"
            );
          }

          if (changes.length > 0) {
            await tx.activityLog.create({
              data: {
                action: "UPDATED",
                entity: "TASK",
                details: changes.join(", "),
                taskId: id,
                isAI: false,
              },
            });
          }

          return task;
        }
      );

    const completeTask =
      await prisma.task.findUnique({
        where: {
          id: updatedTask.id,
        },
        include: taskInclude,
      });

    return res.json(completeTask);
  } catch (error) {
    console.error(
      "PUT /tasks/:id error:",
      error
    );

    return res.status(500).json({
      error: "Failed to update task",
      details:
        error instanceof Error
          ? error.message
          : undefined,
    });
  }
});

/* =========================================================
   UPDATE TASK STATUS
========================================================= */

router.patch(
  "/:id/status",
  async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id);

      if (!id) {
        return res.status(400).json({
          error: "Invalid task ID",
        });
      }

      const normalizedStatus =
        normalizeStatus(req.body.status);

      if (!normalizedStatus) {
        return res.status(400).json({
          error: "Invalid task status",
          allowedStatuses: [
            "BACKLOG",
            "TODO",
            "IN_PROGRESS",
            "REVIEW",
            "COMPLETED",
          ],
        });
      }

      const existingTask =
        await prisma.task.findUnique({
          where: {
            id,
          },
        });

      if (!existingTask) {
        return res.status(404).json({
          error: "Task not found",
        });
      }

      const task =
        await prisma.$transaction(
          async (tx) => {
            const updated =
              await tx.task.update({
                where: {
                  id,
                },
                data: {
                  status: normalizedStatus,
                  completed:
                    normalizedStatus ===
                    TaskStatus.COMPLETED,
                },
              });

            if (
              existingTask.status !==
              normalizedStatus
            ) {
              await tx.activityLog.create({
                data: {
                  action: "STATUS_CHANGED",
                  entity: "TASK",
                  details: `Status changed from ${existingTask.status} to ${normalizedStatus}`,
                  taskId: id,
                  isAI: false,
                },
              });
            }

            return updated;
          }
        );

      const completeTask =
        await prisma.task.findUnique({
          where: {
            id: task.id,
          },
          include: taskInclude,
        });

      return res.json(completeTask);
    } catch (error) {
      console.error(
        "PATCH /tasks/:id/status error:",
        error
      );

      return res.status(500).json({
        error: "Failed to update task status",
        details:
          error instanceof Error
            ? error.message
            : undefined,
      });
    }
  }
);

/* =========================================================
   UPDATE TASK ASSIGNEE
========================================================= */

router.patch(
  "/:id/assignee",
  async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id);
      const personId = parseId(
        req.body.personId
      );

      if (!id) {
        return res.status(400).json({
          error: "Invalid task ID",
        });
      }

      if (!personId) {
        return res.status(400).json({
          error: "Valid personId is required",
        });
      }

      const task =
        await prisma.task.findUnique({
          where: {
            id,
          },
        });

      if (!task) {
        return res.status(404).json({
          error: "Task not found",
        });
      }

      const person =
        await prisma.person.findUnique({
          where: {
            id: personId,
          },
        });

      if (!person) {
        return res.status(404).json({
          error: "Person not found",
        });
      }

      await prisma.$transaction(
        async (tx) => {
          await tx.taskAssignee.deleteMany({
            where: {
              taskId: id,
            },
          });

          await tx.taskAssignee.create({
            data: {
              taskId: id,
              personId,
            },
          });

          await tx.activityLog.create({
            data: {
              action: "ASSIGNEE_CHANGED",
              entity: "TASK",
              details: `Task assigned to ${person.fullName}`,
              taskId: id,
              personId,
              isAI: false,
            },
          });
        }
      );

      const completeTask =
        await prisma.task.findUnique({
          where: {
            id,
          },
          include: taskInclude,
        });

      return res.json(completeTask);
    } catch (error) {
      console.error(
        "PATCH /tasks/:id/assignee error:",
        error
      );

      return res.status(500).json({
        error: "Failed to update task assignee",
        details:
          error instanceof Error
            ? error.message
            : undefined,
      });
    }
  }
);

/* =========================================================
   COMMENTS
========================================================= */

router.post(
  "/:id/comments",
  async (req: Request, res: Response) => {
    try {
      const taskId = parseId(req.params.id);

      if (!taskId) {
        return res.status(400).json({
          error: "Invalid task ID",
        });
      }

      const content =
        typeof req.body?.content === "string"
          ? req.body.content.trim()
          : "";

      if (!content) {
        return res.status(400).json({
          error: "Comment content is required",
        });
      }

      const task = await prisma.task.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        return res.status(404).json({
          error: "Task not found",
        });
      }

      const personId = parseId(req.body?.personId);

      const comment = await prisma.comment.create({
        data: {
          content,
          taskId,
        },
      });

      await prisma.activityLog.create({
        data: {
          action: "COMMENT_ADDED",
          entity: "Task",
          details: `Comment added: "${content.slice(0, 80)}"`,
          taskId,
          personId: personId ?? undefined,
          isAI: false,
        },
      });

      return res.status(201).json(comment);
    } catch (error) {
      console.error("POST /tasks/:id/comments error:", error);

      return res.status(500).json({
        error: "Failed to add comment",
        details:
          error instanceof Error ? error.message : undefined,
      });
    }
  }
);

router.delete(
  "/:id/comments/:commentId",
  async (req: Request, res: Response) => {
    try {
      const taskId = parseId(req.params.id);
      const commentId = parseId(req.params.commentId);

      if (!taskId || !commentId) {
        return res.status(400).json({
          error: "Invalid task or comment ID",
        });
      }

      const comment = await prisma.comment.findFirst({
        where: { id: commentId, taskId },
      });

      if (!comment) {
        return res.status(404).json({
          error: "Comment not found",
        });
      }

      await prisma.comment.delete({
        where: { id: commentId },
      });

      return res.json({
        success: true,
        message: "Comment deleted successfully",
      });
    } catch (error) {
      console.error(
        "DELETE /tasks/:id/comments/:commentId error:",
        error
      );

      return res.status(500).json({
        error: "Failed to delete comment",
        details:
          error instanceof Error ? error.message : undefined,
      });
    }
  }
);

/* =========================================================
   CHECKLIST
========================================================= */

router.post(
  "/:id/checklist",
  async (req: Request, res: Response) => {
    try {
      const taskId = parseId(req.params.id);

      if (!taskId) {
        return res.status(400).json({
          error: "Invalid task ID",
        });
      }

      const title =
        typeof req.body?.title === "string"
          ? req.body.title.trim()
          : "";

      if (!title) {
        return res.status(400).json({
          error: "Checklist item title is required",
        });
      }

      const task = await prisma.task.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        return res.status(404).json({
          error: "Task not found",
        });
      }

      const item = await prisma.checklistItem.create({
        data: {
          title,
          taskId,
        },
      });

      await prisma.activityLog.create({
        data: {
          action: "CHECKLIST_ITEM_ADDED",
          entity: "Task",
          details: `Checklist item added: "${title}"`,
          taskId,
          isAI: false,
        },
      });

      return res.status(201).json(item);
    } catch (error) {
      console.error("POST /tasks/:id/checklist error:", error);

      return res.status(500).json({
        error: "Failed to add checklist item",
        details:
          error instanceof Error ? error.message : undefined,
      });
    }
  }
);

router.patch(
  "/:id/checklist/:itemId",
  async (req: Request, res: Response) => {
    try {
      const taskId = parseId(req.params.id);
      const itemId = parseId(req.params.itemId);

      if (!taskId || !itemId) {
        return res.status(400).json({
          error: "Invalid task or checklist item ID",
        });
      }

      const existing = await prisma.checklistItem.findFirst({
        where: { id: itemId, taskId },
      });

      if (!existing) {
        return res.status(404).json({
          error: "Checklist item not found",
        });
      }

      const data: {
        title?: string;
        completed?: boolean;
      } = {};

      if (typeof req.body?.title === "string") {
        const trimmed = req.body.title.trim();
        if (trimmed) data.title = trimmed;
      }

      if (typeof req.body?.completed === "boolean") {
        data.completed = req.body.completed;
      }

      const updated = await prisma.checklistItem.update({
        where: { id: itemId },
        data,
      });

      if (
        typeof req.body?.completed === "boolean" &&
        req.body.completed !== existing.completed
      ) {
        await prisma.activityLog.create({
          data: {
            action: "CHECKLIST_ITEM_UPDATED",
            entity: "Task",
            details: `Checklist item "${existing.title}" marked ${
              req.body.completed ? "complete" : "incomplete"
            }`,
            taskId,
            isAI: false,
          },
        });
      }

      return res.json(updated);
    } catch (error) {
      console.error(
        "PATCH /tasks/:id/checklist/:itemId error:",
        error
      );

      return res.status(500).json({
        error: "Failed to update checklist item",
        details:
          error instanceof Error ? error.message : undefined,
      });
    }
  }
);

router.delete(
  "/:id/checklist/:itemId",
  async (req: Request, res: Response) => {
    try {
      const taskId = parseId(req.params.id);
      const itemId = parseId(req.params.itemId);

      if (!taskId || !itemId) {
        return res.status(400).json({
          error: "Invalid task or checklist item ID",
        });
      }

      const existing = await prisma.checklistItem.findFirst({
        where: { id: itemId, taskId },
      });

      if (!existing) {
        return res.status(404).json({
          error: "Checklist item not found",
        });
      }

      await prisma.checklistItem.delete({
        where: { id: itemId },
      });

      return res.json({
        success: true,
        message: "Checklist item deleted successfully",
      });
    } catch (error) {
      console.error(
        "DELETE /tasks/:id/checklist/:itemId error:",
        error
      );

      return res.status(500).json({
        error: "Failed to delete checklist item",
        details:
          error instanceof Error ? error.message : undefined,
      });
    }
  }
);

/* =========================================================
   DELETE TASK
========================================================= */

router.delete(
  "/:id",
  async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id);

      if (!id) {
        return res.status(400).json({
          error: "Invalid task ID",
        });
      }

      const task =
        await prisma.task.findUnique({
          where: {
            id,
          },
        });

      if (!task) {
        return res.status(404).json({
          error: "Task not found",
        });
      }

      /*
       * Related TaskSkill, TaskAssignee,
       * Comment and ChecklistItem records
       * have onDelete: Cascade.
       *
       * ActivityLog.task is optional, so
       * ActivityLog records are NOT cascaded
       * by the schema. We remove them first.
       */
      await prisma.$transaction(
        async (tx) => {
          await tx.activityLog.deleteMany({
            where: {
              taskId: id,
            },
          });

          await tx.task.delete({
            where: {
              id,
            },
          });
        }
      );

      return res.json({
        success: true,
        message: "Task deleted successfully",
      });
    } catch (error) {
      console.error(
        "DELETE /tasks/:id error:",
        error
      );

      return res.status(500).json({
        error: "Failed to delete task",
        details:
          error instanceof Error
            ? error.message
            : undefined,
      });
    }
  }
);

export default router;
