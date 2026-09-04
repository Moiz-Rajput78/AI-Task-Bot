import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

const VALID_STATUSES = [
  "PLANNING",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
] as const;

type ProjectStatus = (typeof VALID_STATUSES)[number];

/* -------------------------------------------------------------------------- */
/* GET ALL PROJECTS                                                           */
/* -------------------------------------------------------------------------- */

router.get("/", async (_req, res) => {
  try {
    const projects = await prisma.project.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        manager: true,
        members: {
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
        _count: {
          select: {
            members: true,
            tasks: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      data: projects,
    });
  } catch (error) {
    console.error("Failed to fetch projects:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch projects.",
    });
  }
});

/* -------------------------------------------------------------------------- */
/* GET PROJECT BY ID                                                          */
/* -------------------------------------------------------------------------- */

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID.",
      });
    }

    const project = await prisma.project.findUnique({
      where: {
        id,
      },
      include: {
        manager: {
          include: {
            department: true,
            skills: {
              include: {
                skill: true,
              },
            },
          },
        },
        members: {
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
        tasks: {
          orderBy: {
            createdAt: "desc",
          },
          include: {
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
        },
        _count: {
          select: {
            members: true,
            tasks: true,
          },
        },
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found.",
      });
    }

    return res.json({
      success: true,
      data: project,
    });
  } catch (error) {
    console.error("Failed to fetch project:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch project.",
    });
  }
});

/* -------------------------------------------------------------------------- */
/* CREATE PROJECT                                                             */
/* -------------------------------------------------------------------------- */

router.post("/", async (req, res) => {
  try {
    const {
      name,
      description,
      client,
      startDate,
      dueDate,
      status,
      managerId,
      memberIds,
    } = req.body;

    const projectName =
      typeof name === "string" ? name.trim() : "";

    if (!projectName) {
      return res.status(400).json({
        success: false,
        message: "Project name is required.",
      });
    }

    const projectStatus: ProjectStatus =
      status || "PLANNING";

    if (!VALID_STATUSES.includes(projectStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid project status. Allowed values: ${VALID_STATUSES.join(
          ", "
        )}`,
      });
    }

    let parsedManagerId: number | null = null;

    if (managerId !== undefined && managerId !== null && managerId !== "") {
      parsedManagerId = Number(managerId);

      if (!Number.isInteger(parsedManagerId) || parsedManagerId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid manager ID.",
        });
      }

      const manager = await prisma.person.findUnique({
        where: {
          id: parsedManagerId,
        },
      });

      if (!manager || !manager.isActive) {
        return res.status(400).json({
          success: false,
          message: "Selected project manager does not exist or is inactive.",
        });
      }
    }

    const parsedMemberIds = Array.isArray(memberIds)
      ? [
          ...new Set(
            memberIds
              .map((id: unknown) => Number(id))
              .filter(
                (id: number) =>
                  Number.isInteger(id) && id > 0
              )
          ),
        ]
      : [];

    if (parsedMemberIds.length > 0) {
      const activePeople = await prisma.person.findMany({
        where: {
          id: {
            in: parsedMemberIds,
          },
          isActive: true,
        },
        select: {
          id: true,
        },
      });

      if (activePeople.length !== parsedMemberIds.length) {
        return res.status(400).json({
          success: false,
          message:
            "One or more selected project members do not exist or are inactive.",
        });
      }
    }

    let parsedStartDate: Date | null = null;
    let parsedDueDate: Date | null = null;

    if (startDate) {
      parsedStartDate = new Date(startDate);

      if (Number.isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid start date.",
        });
      }
    }

    if (dueDate) {
      parsedDueDate = new Date(dueDate);

      if (Number.isNaN(parsedDueDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid due date.",
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
        message: "Due date cannot be before the start date.",
      });
    }

    const project = await prisma.project.create({
      data: {
        name: projectName,
        description:
          typeof description === "string"
            ? description.trim() || null
            : null,
        client:
          typeof client === "string"
            ? client.trim() || null
            : null,
        startDate: parsedStartDate,
        dueDate: parsedDueDate,
        status: projectStatus,
        managerId: parsedManagerId,
        members:
          parsedMemberIds.length > 0
            ? {
                create: parsedMemberIds.map(
                  (personId) => ({
                    personId,
                  })
                ),
              }
            : undefined,
      },
      include: {
        manager: true,
        members: {
          include: {
            person: true,
          },
        },
        _count: {
          select: {
            members: true,
            tasks: true,
          },
        },
      },
    });

    await prisma.activityLog.create({
      data: {
        action: "PROJECT_CREATED",
        entity: "Project",
        details: `Project "${project.name}" was created.`,
      },
    });

    return res.status(201).json({
      success: true,
      data: project,
    });
  } catch (error) {
    console.error("Failed to create project:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create project.",
    });
  }
});

/* -------------------------------------------------------------------------- */
/* UPDATE PROJECT                                                             */
/* -------------------------------------------------------------------------- */

router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID.",
      });
    }

    const existingProject = await prisma.project.findUnique({
      where: {
        id,
      },
    });

    if (!existingProject) {
      return res.status(404).json({
        success: false,
        message: "Project not found.",
      });
    }

    const {
      name,
      description,
      client,
      startDate,
      dueDate,
      status,
      managerId,
      memberIds,
    } = req.body;

    const projectName =
      typeof name === "string"
        ? name.trim()
        : existingProject.name;

    if (!projectName) {
      return res.status(400).json({
        success: false,
        message: "Project name is required.",
      });
    }

    const projectStatus: ProjectStatus =
      status || existingProject.status;

    if (!VALID_STATUSES.includes(projectStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid project status. Allowed values: ${VALID_STATUSES.join(
          ", "
        )}`,
      });
    }

    let parsedManagerId: number | null =
      existingProject.managerId;

    if (managerId !== undefined) {
      if (
        managerId === null ||
        managerId === ""
      ) {
        parsedManagerId = null;
      } else {
        parsedManagerId = Number(managerId);

        if (
          !Number.isInteger(parsedManagerId) ||
          parsedManagerId <= 0
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid manager ID.",
          });
        }

        const manager = await prisma.person.findUnique({
          where: {
            id: parsedManagerId,
          },
        });

        if (!manager || !manager.isActive) {
          return res.status(400).json({
            success: false,
            message:
              "Selected project manager does not exist or is inactive.",
          });
        }
      }
    }

    let parsedStartDate: Date | null =
      existingProject.startDate;

    let parsedDueDate: Date | null =
      existingProject.dueDate;

    if (startDate !== undefined) {
      if (!startDate) {
        parsedStartDate = null;
      } else {
        parsedStartDate = new Date(startDate);

        if (Number.isNaN(parsedStartDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid start date.",
          });
        }
      }
    }

    if (dueDate !== undefined) {
      if (!dueDate) {
        parsedDueDate = null;
      } else {
        parsedDueDate = new Date(dueDate);

        if (Number.isNaN(parsedDueDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid due date.",
          });
        }
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
          "Due date cannot be before the start date.",
      });
    }

    const updateData: {
      name: string;
      description?: string | null;
      client?: string | null;
      startDate: Date | null;
      dueDate: Date | null;
      status: ProjectStatus;
      managerId: number | null;
    } = {
      name: projectName,
      startDate: parsedStartDate,
      dueDate: parsedDueDate,
      status: projectStatus,
      managerId: parsedManagerId,
    };

    if (description !== undefined) {
      updateData.description =
        typeof description === "string"
          ? description.trim() || null
          : null;
    }

    if (client !== undefined) {
      updateData.client =
        typeof client === "string"
          ? client.trim() || null
          : null;
    }

    const parsedMemberIds =
      memberIds !== undefined && Array.isArray(memberIds)
        ? [
            ...new Set(
              memberIds
                .map((memberId: unknown) =>
                  Number(memberId)
                )
                .filter(
                  (memberId: number) =>
                    Number.isInteger(memberId) &&
                    memberId > 0
                )
            ),
          ]
        : null;

    if (parsedMemberIds) {
      if (parsedMemberIds.length > 0) {
        const activePeople =
          await prisma.person.findMany({
            where: {
              id: {
                in: parsedMemberIds,
              },
              isActive: true,
            },
            select: {
              id: true,
            },
          });

        if (
          activePeople.length !==
          parsedMemberIds.length
        ) {
          return res.status(400).json({
            success: false,
            message:
              "One or more selected project members do not exist or are inactive.",
          });
        }
      }

      await prisma.projectMember.deleteMany({
        where: {
          projectId: id,
        },
      });

      if (parsedMemberIds.length > 0) {
        await prisma.projectMember.createMany({
          data: parsedMemberIds.map(
            (personId) => ({
              projectId: id,
              personId,
            })
          ),
          skipDuplicates: true,
        });
      }
    }

    const project = await prisma.project.update({
      where: {
        id,
      },
      data: updateData,
      include: {
        manager: true,
        members: {
          include: {
            person: true,
          },
        },
        tasks: {
          orderBy: {
            createdAt: "desc",
          },
        },
        _count: {
          select: {
            members: true,
            tasks: true,
          },
        },
      },
    });

    await prisma.activityLog.create({
      data: {
        action: "PROJECT_UPDATED",
        entity: "Project",
        details: `Project "${project.name}" was updated.`,
      },
    });

    return res.json({
      success: true,
      data: project,
    });
  } catch (error) {
    console.error("Failed to update project:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update project.",
    });
  }
});

/* -------------------------------------------------------------------------- */
/* DELETE PROJECT                                                             */
/* -------------------------------------------------------------------------- */

router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID.",
      });
    }

    const project = await prisma.project.findUnique({
      where: {
        id,
      },
      include: {
        _count: {
          select: {
            tasks: true,
            members: true,
          },
        },
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found.",
      });
    }

    if (project._count.tasks > 0) {
      return res.status(400).json({
        success: false,
        message:
          "This project cannot be deleted because it has tasks assigned to it.",
      });
    }

    await prisma.project.delete({
      where: {
        id,
      },
    });

    await prisma.activityLog.create({
      data: {
        action: "PROJECT_DELETED",
        entity: "Project",
        details: `Project "${project.name}" was deleted.`,
      },
    });

    return res.json({
      success: true,
      data: {
        id,
        message: "Project deleted successfully.",
      },
    });
  } catch (error) {
    console.error("Failed to delete project:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete project.",
    });
  }
});

/* -------------------------------------------------------------------------- */
/* ADD PROJECT MEMBER                                                         */
/* -------------------------------------------------------------------------- */

router.post("/:id/members", async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const personId = Number(req.body?.personId);

    if (
      !Number.isInteger(projectId) ||
      projectId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID.",
      });
    }

    if (
      !Number.isInteger(personId) ||
      personId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid personId is required.",
      });
    }

    const project = await prisma.project.findUnique({
      where: {
        id: projectId,
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found.",
      });
    }

    const person = await prisma.person.findUnique({
      where: {
        id: personId,
      },
    });

    if (!person || !person.isActive) {
      return res.status(400).json({
        success: false,
        message:
          "Person does not exist or is inactive.",
      });
    }

    const existingMember =
      await prisma.projectMember.findUnique({
        where: {
          projectId_personId: {
            projectId,
            personId,
          },
        },
      });

    if (existingMember) {
      return res.status(409).json({
        success: false,
        message:
          "This person is already a member of the project.",
      });
    }

    const member =
      await prisma.projectMember.create({
        data: {
          projectId,
          personId,
        },
        include: {
          person: true,
          project: true,
        },
      });

    return res.status(201).json({
      success: true,
      data: member,
    });
  } catch (error) {
    console.error(
      "Failed to add project member:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to add project member.",
    });
  }
});

/* -------------------------------------------------------------------------- */
/* REMOVE PROJECT MEMBER                                                      */
/* -------------------------------------------------------------------------- */

router.delete(
  "/:id/members/:personId",
  async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const personId = Number(
        req.params.personId
      );

      if (
        !Number.isInteger(projectId) ||
        projectId <= 0 ||
        !Number.isInteger(personId) ||
        personId <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid project or person ID.",
        });
      }

      const member =
        await prisma.projectMember.findUnique({
          where: {
            projectId_personId: {
              projectId,
              personId,
            },
          },
        });

      if (!member) {
        return res.status(404).json({
          success: false,
          message:
            "This person is not a member of the project.",
        });
      }

      await prisma.projectMember.delete({
        where: {
          projectId_personId: {
            projectId,
            personId,
          },
        },
      });

      return res.json({
        success: true,
        data: {
          message:
            "Project member removed successfully.",
        },
      });
    } catch (error) {
      console.error(
        "Failed to remove project member:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to remove project member.",
      });
    }
  }
);

export default router;
