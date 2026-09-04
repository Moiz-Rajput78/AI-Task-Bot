import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

const VALID_STATUSES = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "REVIEW",
  "COMPLETED",
] as const;

const VALID_PRIORITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
] as const;

// ==========================================
// GET ALL TASKS
// ==========================================

router.get("/", async (_req, res) => {
  try {
    const tasks = await prisma.task.findMany({
      orderBy: {
        createdAt: "desc",
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
                skills: {
                  include: {
                    skill: true,
                  },
                },
              },
            },
          },
        },

        comments: true,
        checklist: true,

        activities: {
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
        },
      },
    });

    res.json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    console.error("Failed to fetch tasks:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch tasks",
    });
  }
});

// ==========================================
// GET ONE TASK
// ==========================================

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID",
      });
    }

    const task = await prisma.task.findUnique({
      where: {
        id,
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

                skills: {
                  include: {
                    skill: true,
                  },
                },
              },
            },
          },
        },

        comments: {
          orderBy: {
            createdAt: "desc",
          },
        },

        checklist: {
          orderBy: {
            createdAt: "asc",
          },
        },

        activities: {
          orderBy: {
            createdAt: "desc",
          },
          take: 50,
        },
      },
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error("Failed to fetch task:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch task",
    });
  }
});

// ==========================================
// CREATE TASK
// ==========================================

router.post("/", async (req, res) => {
  try {
    const {
      title,
      description,
      projectId,
      departmentId,
      taskType,
      priority,
      status,
      startDate,
      dueDate,
      estimatedHours,
      actualHours,
      labels,
      skillIds,
      assigneeIds,
    } = req.body;

    // --------------------------------------
    // Validate title
    // --------------------------------------

    if (
      !title ||
      typeof title !== "string" ||
      !title.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Title is required",
      });
    }

    // --------------------------------------
    // Validate status
    // --------------------------------------

    const finalStatus = status || "TODO";

    if (!VALID_STATUSES.includes(finalStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task status",
      });
    }

    // --------------------------------------
    // Validate priority
    // --------------------------------------

    const finalPriority = priority || "MEDIUM";

    if (!VALID_PRIORITIES.includes(finalPriority)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task priority",
      });
    }

    // --------------------------------------
    // Validate project
    // --------------------------------------

    let parsedProjectId: number | null = null;

    if (
      projectId !== undefined &&
      projectId !== null &&
      projectId !== ""
    ) {
      parsedProjectId = Number(projectId);

      if (Number.isNaN(parsedProjectId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid project ID",
        });
      }

      const project = await prisma.project.findUnique({
        where: {
          id: parsedProjectId,
        },
      });

      if (!project) {
        return res.status(404).json({
          success: false,
          message: "Project not found",
        });
      }
    }

    // --------------------------------------
    // Validate department
    // --------------------------------------

    let parsedDepartmentId: number | null = null;

    if (
      departmentId !== undefined &&
      departmentId !== null &&
      departmentId !== ""
    ) {
      parsedDepartmentId = Number(departmentId);

      if (Number.isNaN(parsedDepartmentId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid department ID",
        });
      }

      const department =
        await prisma.department.findUnique({
          where: {
            id: parsedDepartmentId,
          },
        });

      if (!department) {
        return res.status(404).json({
          success: false,
          message: "Department not found",
        });
      }
    }

    // --------------------------------------
    // Validate skills
    // --------------------------------------

    const parsedSkillIds: number[] =
      Array.isArray(skillIds)
        ? [
            ...new Set(
              skillIds
                .map((id: unknown) => Number(id))
                .filter(
                  (id: number) =>
                    !Number.isNaN(id)
                )
            ),
          ]
        : [];

    if (parsedSkillIds.length > 0) {
      const skills = await prisma.skill.findMany({
        where: {
          id: {
            in: parsedSkillIds,
          },
        },

        select: {
          id: true,
        },
      });

      if (skills.length !== parsedSkillIds.length) {
        return res.status(400).json({
          success: false,
          message: "One or more skill IDs are invalid",
        });
      }
    }

    // --------------------------------------
    // Validate assignees
    // --------------------------------------

    const parsedAssigneeIds: number[] =
      Array.isArray(assigneeIds)
        ? [
            ...new Set(
              assigneeIds
                .map((id: unknown) => Number(id))
                .filter(
                  (id: number) =>
                    !Number.isNaN(id)
                )
            ),
          ]
        : [];

    if (parsedAssigneeIds.length > 0) {
      const assignees =
        await prisma.person.findMany({
          where: {
            id: {
              in: parsedAssigneeIds,
            },
            isActive: true,
          },

          select: {
            id: true,
          },
        });

      if (
        assignees.length !==
        parsedAssigneeIds.length
      ) {
        return res.status(400).json({
          success: false,
          message:
            "One or more assignee IDs are invalid or inactive",
        });
      }
    }

    // --------------------------------------
    // Date validation
    // --------------------------------------

    let parsedStartDate: Date | null = null;
    let parsedDueDate: Date | null = null;

    if (startDate) {
      parsedStartDate = new Date(startDate);

      if (
        Number.isNaN(
          parsedStartDate.getTime()
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid start date",
        });
      }
    }

    if (dueDate) {
      parsedDueDate = new Date(dueDate);

      if (
        Number.isNaN(
          parsedDueDate.getTime()
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid due date",
        });
      }
    }

    if (
      parsedStartDate &&
      parsedDueDate &&
      parsedDueDate < parsedStartDate
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Due date cannot be before start date",
      });
    }

    // --------------------------------------
    // Hours validation
    // --------------------------------------

    let parsedEstimatedHours: number | null = null;

    let parsedActualHours: number | null = null;

    if (estimatedHours !== undefined) {
      parsedEstimatedHours = Number(
        estimatedHours
      );

      if (
        Number.isNaN(parsedEstimatedHours) ||
        parsedEstimatedHours < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Estimated hours must be a non-negative number",
        });
      }
    }

    if (actualHours !== undefined) {
      parsedActualHours = Number(actualHours);

      if (
        Number.isNaN(parsedActualHours) ||
        parsedActualHours < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Actual hours must be a non-negative number",
        });
      }
    }

    // --------------------------------------
    // Create task
    // --------------------------------------

    const task = await prisma.task.create({
      data: {
        title: title.trim(),

        description:
          typeof description === "string"
            ? description
            : null,

        status: finalStatus,
        priority: finalPriority,

        taskType:
          typeof taskType === "string" &&
          taskType.trim()
            ? taskType.trim()
            : null,

        startDate: parsedStartDate,
        dueDate: parsedDueDate,

        estimatedHours: parsedEstimatedHours,
        actualHours: parsedActualHours,

        labels:
          typeof labels === "string" &&
          labels.trim()
            ? labels.trim()
            : null,

        projectId: parsedProjectId,
        departmentId: parsedDepartmentId,

        completed:
          finalStatus === "COMPLETED",

        skills:
          parsedSkillIds.length > 0
            ? {
                create: parsedSkillIds.map(
                  (skillId) => ({
                    skillId,
                  })
                ),
              }
            : undefined,

        assignees:
          parsedAssigneeIds.length > 0
            ? {
                create:
                  parsedAssigneeIds.map(
                    (personId) => ({
                      personId,
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

    // --------------------------------------
    // Activity log
    // --------------------------------------

    await prisma.activityLog.create({
      data: {
        action: "TASK_CREATED",
        entity: "Task",
        details: `Task ${task.title} was created`,
        taskId: task.id,
      },
    });

    res.status(201).json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error("Failed to create task:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create task",
    });
  }
});

// ==========================================
// UPDATE TASK
// ==========================================

router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID",
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
        success: false,
        message: "Task not found",
      });
    }

    const {
      title,
      description,
      projectId,
      departmentId,
      taskType,
      priority,
      status,
      startDate,
      dueDate,
      estimatedHours,
      actualHours,
      labels,
      completed,
      skillIds,
      assigneeIds,
    } = req.body;

    // --------------------------------------
    // Validate status
    // --------------------------------------

    if (
      status !== undefined &&
      !VALID_STATUSES.includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid task status",
      });
    }

    // --------------------------------------
    // Validate priority
    // --------------------------------------

    if (
      priority !== undefined &&
      !VALID_PRIORITIES.includes(priority)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid task priority",
      });
    }

    // --------------------------------------
    // Project
    // --------------------------------------

    let parsedProjectId:
      | number
      | null
      | undefined;

    if (projectId !== undefined) {
      if (
        projectId === null ||
        projectId === ""
      ) {
        parsedProjectId = null;
      } else {
        parsedProjectId = Number(projectId);

        if (Number.isNaN(parsedProjectId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid project ID",
          });
        }

        const project =
          await prisma.project.findUnique({
            where: {
              id: parsedProjectId,
            },
          });

        if (!project) {
          return res.status(404).json({
            success: false,
            message: "Project not found",
          });
        }
      }
    }

    // --------------------------------------
    // Department
    // --------------------------------------

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
        parsedDepartmentId = Number(
          departmentId
        );

        if (Number.isNaN(parsedDepartmentId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid department ID",
          });
        }

        const department =
          await prisma.department.findUnique({
            where: {
              id: parsedDepartmentId,
            },
          });

        if (!department) {
          return res.status(404).json({
            success: false,
            message: "Department not found",
          });
        }
      }
    }

    // --------------------------------------
    // Skills
    // --------------------------------------

    let parsedSkillIds:
      | number[]
      | undefined;

    if (skillIds !== undefined) {
      if (!Array.isArray(skillIds)) {
        return res.status(400).json({
          success: false,
          message: "skillIds must be an array",
        });
      }

      parsedSkillIds = [
        ...new Set(
          skillIds
            .map((id: unknown) => Number(id))
            .filter(
              (id: number) =>
                !Number.isNaN(id)
            )
        ),
      ];

      if (parsedSkillIds.length > 0) {
        const skills =
          await prisma.skill.findMany({
            where: {
              id: {
                in: parsedSkillIds,
              },
            },

            select: {
              id: true,
            },
          });

        if (
          skills.length !==
          parsedSkillIds.length
        ) {
          return res.status(400).json({
            success: false,
            message:
              "One or more skill IDs are invalid",
          });
        }
      }
    }

    // --------------------------------------
    // Assignees
    // --------------------------------------

    let parsedAssigneeIds:
      | number[]
      | undefined;

    if (assigneeIds !== undefined) {
      if (!Array.isArray(assigneeIds)) {
        return res.status(400).json({
          success: false,
          message:
            "assigneeIds must be an array",
        });
      }

      parsedAssigneeIds = [
        ...new Set(
          assigneeIds
            .map((id: unknown) => Number(id))
            .filter(
              (id: number) =>
                !Number.isNaN(id)
            )
        ),
      ];

      if (parsedAssigneeIds.length > 0) {
        const assignees =
          await prisma.person.findMany({
            where: {
              id: {
                in: parsedAssigneeIds,
              },
              isActive: true,
            },

            select: {
              id: true,
            },
          });

        if (
          assignees.length !==
          parsedAssigneeIds.length
        ) {
          return res.status(400).json({
            success: false,
            message:
              "One or more assignee IDs are invalid or inactive",
          });
        }
      }
    }

    // --------------------------------------
    // Dates
    // --------------------------------------

    let parsedStartDate:
      | Date
      | null
      | undefined;

    let parsedDueDate:
      | Date
      | null
      | undefined;

    if (startDate !== undefined) {
      if (!startDate) {
        parsedStartDate = null;
      } else {
        parsedStartDate = new Date(startDate);

        if (
          Number.isNaN(
            parsedStartDate.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid start date",
          });
        }
      }
    }

    if (dueDate !== undefined) {
      if (!dueDate) {
        parsedDueDate = null;
      } else {
        parsedDueDate = new Date(dueDate);

        if (
          Number.isNaN(
            parsedDueDate.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid due date",
          });
        }
      }
    }

    const finalStartDate =
      parsedStartDate !== undefined
        ? parsedStartDate
        : existingTask.startDate;

    const finalDueDate =
      parsedDueDate !== undefined
        ? parsedDueDate
        : existingTask.dueDate;

    if (
      finalStartDate &&
      finalDueDate &&
      finalDueDate < finalStartDate
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Due date cannot be before start date",
      });
    }

    // --------------------------------------
    // Hours
    // --------------------------------------

    let parsedEstimatedHours:
      | number
      | undefined;

    let parsedActualHours:
      | number
      | undefined;

    if (estimatedHours !== undefined) {
      parsedEstimatedHours = Number(
        estimatedHours
      );

      if (
        Number.isNaN(parsedEstimatedHours) ||
        parsedEstimatedHours < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Estimated hours must be a non-negative number",
        });
      }
    }

    if (actualHours !== undefined) {
      parsedActualHours = Number(actualHours);

      if (
        Number.isNaN(parsedActualHours) ||
        parsedActualHours < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Actual hours must be a non-negative number",
        });
      }
    }

    // --------------------------------------
    // Update basic task information
    // --------------------------------------

    const task = await prisma.task.update({
      where: {
        id,
      },

      data: {
        ...(title !== undefined && {
          title: String(title).trim(),
        }),

        ...(description !== undefined && {
          description:
            description === null
              ? null
              : String(description),
        }),

        ...(projectId !== undefined && {
          projectId: parsedProjectId ?? null,
        }),

        ...(departmentId !== undefined && {
          departmentId:
            parsedDepartmentId ?? null,
        }),

        ...(taskType !== undefined && {
          taskType:
            taskType &&
            String(taskType).trim()
              ? String(taskType).trim()
              : null,
        }),

        ...(priority !== undefined && {
          priority,
        }),

        ...(status !== undefined && {
          status,
        }),

        ...(startDate !== undefined && {
          startDate: parsedStartDate,
        }),

        ...(dueDate !== undefined && {
          dueDate: parsedDueDate,
        }),

        ...(parsedEstimatedHours !== undefined && {
          estimatedHours: parsedEstimatedHours,
        }),

        ...(parsedActualHours !== undefined && {
          actualHours: parsedActualHours,
        }),

        ...(labels !== undefined && {
          labels:
            labels &&
            String(labels).trim()
              ? String(labels).trim()
              : null,
        }),

        ...(completed !== undefined && {
          completed: Boolean(completed),
        }),

        // Automatically keep completed/status consistent.
        ...(status === "COMPLETED" && {
          completed: true,
        }),

        ...(status !== undefined &&
          status !== "COMPLETED" && {
            completed: false,
          }),
      },
    });

    // --------------------------------------
    // Update skills
    // --------------------------------------

    if (parsedSkillIds !== undefined) {
      await prisma.taskSkill.deleteMany({
        where: {
          taskId: id,
        },
      });

      if (parsedSkillIds.length > 0) {
        await prisma.taskSkill.createMany({
          data: parsedSkillIds.map((skillId) => ({
            taskId: id,
            skillId,
          })),
          skipDuplicates: true,
        });
      }
    }

    // --------------------------------------
    // Update assignees
    // --------------------------------------

    if (parsedAssigneeIds !== undefined) {
      await prisma.taskAssignee.deleteMany({
        where: {
          taskId: id,
        },
      });

      if (parsedAssigneeIds.length > 0) {
        await prisma.taskAssignee.createMany({
          data: parsedAssigneeIds.map(
            (personId) => ({
              taskId: id,
              personId,
            })
          ),
          skipDuplicates: true,
        });
      }
    }

    // --------------------------------------
    // Get complete updated task
    // --------------------------------------

    const updatedTask =
      await prisma.task.findUnique({
        where: {
          id,
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

    // --------------------------------------
    // Activity log
    // --------------------------------------

    await prisma.activityLog.create({
      data: {
        action: "TASK_UPDATED",
        entity: "Task",
        details: `Task ${task.title} was updated`,
        taskId: task.id,
      },
    });

    res.json({
      success: true,
      data: updatedTask,
    });
  } catch (error) {
    console.error("Failed to update task:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update task",
    });
  }
});

// ==========================================
// MOVE TASK
// ==========================================

router.patch("/:id/status", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID",
      });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task status",
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
        success: false,
        message: "Task not found",
      });
    }

    const task = await prisma.task.update({
      where: {
        id,
      },

      data: {
        status,
        completed: status === "COMPLETED",
      },
    });

    await prisma.activityLog.create({
      data: {
        action: "TASK_STATUS_CHANGED",
        entity: "Task",
        details: `Task ${task.title} moved from ${existingTask.status} to ${status}`,
        taskId: task.id,
      },
    });

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error(
      "Failed to change task status:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to change task status",
    });
  }
});

// ==========================================
// ASSIGN TASK
// ==========================================

router.patch("/:id/assignees", async (req, res) => {
  try {
    const taskId = Number(req.params.id);
    const { personIds } = req.body;

    if (Number.isNaN(taskId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID",
      });
    }

    if (!Array.isArray(personIds)) {
      return res.status(400).json({
        success: false,
        message: "personIds must be an array",
      });
    }

    const parsedPersonIds = [
      ...new Set(
        personIds
          .map((id: unknown) => Number(id))
          .filter(
            (id: number) => !Number.isNaN(id)
          )
      ),
    ];

    const task = await prisma.task.findUnique({
      where: {
        id: taskId,
      },
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    if (parsedPersonIds.length > 0) {
      const people =
        await prisma.person.findMany({
          where: {
            id: {
              in: parsedPersonIds,
            },
            isActive: true,
          },

          select: {
            id: true,
            fullName: true,
          },
        });

      if (
        people.length !==
        parsedPersonIds.length
      ) {
        return res.status(400).json({
          success: false,
          message:
            "One or more people are invalid or inactive",
        });
      }
    }

    await prisma.taskAssignee.deleteMany({
      where: {
        taskId,
      },
    });

    if (parsedPersonIds.length > 0) {
      await prisma.taskAssignee.createMany({
        data: parsedPersonIds.map(
          (personId) => ({
            taskId,
            personId,
          })
        ),
        skipDuplicates: true,
      });
    }

    const updatedTask =
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

    const names =
      updatedTask?.assignees
        .map(
          (assignment) =>
            assignment.person.fullName
        )
        .join(", ") || "Nobody";

    await prisma.activityLog.create({
      data: {
        action: "TASK_ASSIGNED",
        entity: "Task",
        details: `Task ${task.title} assigned to ${names}`,
        taskId,
      },
    });

    res.json({
      success: true,
      data: updatedTask,
    });
  } catch (error) {
    console.error(
      "Failed to assign task:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to assign task",
    });
  }
});

// ==========================================
// DELETE TASK
// ==========================================

router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID",
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
        success: false,
        message: "Task not found",
      });
    }

    await prisma.task.delete({
      where: {
        id,
      },
    });

    res.json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    console.error("Failed to delete task:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete task",
    });
  }
});

export default router;