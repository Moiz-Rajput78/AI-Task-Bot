import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

const VALID_AVAILABILITIES = [
  "AVAILABLE",
  "PARTIALLY_AVAILABLE",
  "BUSY",
  "ON_LEAVE",
  "INACTIVE",
] as const;

const VALID_EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERN",
  "FREELANCE",
] as const;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ==========================================
// GET ALL PEOPLE
// ==========================================

router.get("/", async (_req, res) => {
  try {
    const people = await prisma.person.findMany({
      where: {
        isActive: true,
      },

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

        _count: {
          select: {
            assignedTasks: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: people,
    });
  } catch (error) {
    console.error("Failed to fetch people:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch people",
    });
  }
});

// ==========================================
// GET ONE PERSON
// ==========================================

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid person ID",
      });
    }

    const person = await prisma.person.findUnique({
      where: { id },

      include: {
        department: true,

        skills: {
          include: {
            skill: true,
          },
        },

        assignedTasks: {
          include: {
            task: {
              include: {
                project: true,
                department: true,
              },
            },
          },

          orderBy: {
            assignedAt: "desc",
          },
        },

        managedProjects: true,

        projectMembers: {
          include: {
            project: true,
          },
        },

        activities: {
          orderBy: {
            createdAt: "desc",
          },

          take: 20,
        },
      },
    });

    if (!person) {
      return res.status(404).json({
        success: false,
        message: "Person not found",
      });
    }

    res.json({
      success: true,
      data: person,
    });
  } catch (error) {
    console.error("Failed to fetch person:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch person",
    });
  }
});

// ==========================================
// CREATE PERSON
// ==========================================

router.post("/", async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      profileImage,
      location,
      departmentId,
      jobTitle,
      role,
      experience,
      employmentType,
      joiningDate,
      availability,
      bio,
      notes,
      preferredTaskTypes,
      skillIds,
    } = req.body;

    // --------------------------------------
    // Validate name
    // --------------------------------------

    if (
      !fullName ||
      typeof fullName !== "string" ||
      !fullName.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Full name is required",
      });
    }

    // --------------------------------------
    // Validate email
    // --------------------------------------

    if (
      !email ||
      typeof email !== "string" ||
      !email.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    // --------------------------------------
    // Check duplicate email
    // --------------------------------------

    const existingPerson =
      await prisma.person.findUnique({
        where: {
          email: normalizedEmail,
        },
      });

    if (existingPerson) {
      return res.status(409).json({
        success: false,
        message: "A person with this email already exists",
      });
    }

    // --------------------------------------
    // Department validation
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

          select: {
            id: true,
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
    // Experience validation
    // --------------------------------------

    let parsedExperience = 0;

    if (experience !== undefined) {
      parsedExperience = Number(experience);

      if (
        Number.isNaN(parsedExperience) ||
        parsedExperience < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Experience must be a valid non-negative number",
        });
      }
    }

    // --------------------------------------
    // Employment type validation
    // --------------------------------------

    const finalEmploymentType =
      employmentType || "FULL_TIME";

    if (
      !VALID_EMPLOYMENT_TYPES.includes(
        finalEmploymentType
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid employment type",
      });
    }

    // --------------------------------------
    // Availability validation
    // --------------------------------------

    const finalAvailability =
      availability || "AVAILABLE";

    if (
      !VALID_AVAILABILITIES.includes(
        finalAvailability
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid availability value",
      });
    }

    // --------------------------------------
    // Joining date validation
    // --------------------------------------

    let parsedJoiningDate: Date | null = null;

    if (joiningDate) {
      parsedJoiningDate = new Date(joiningDate);

      if (Number.isNaN(parsedJoiningDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid joining date",
        });
      }
    }

    // --------------------------------------
    // Skill IDs
    // --------------------------------------

    const parsedSkillIds: number[] =
      Array.isArray(skillIds)
        ? [
            ...new Set(
              skillIds
                .map((id: unknown) => Number(id))
                .filter(
                  (id: number) => !Number.isNaN(id)
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
    // Create person
    // --------------------------------------

    const person = await prisma.person.create({
      data: {
        fullName: fullName.trim(),
        email: normalizedEmail,

        phone:
          typeof phone === "string" && phone.trim()
            ? phone.trim()
            : null,

        profileImage:
          typeof profileImage === "string" &&
          profileImage.trim()
            ? profileImage.trim()
            : null,

        location:
          typeof location === "string" &&
          location.trim()
            ? location.trim()
            : null,

        departmentId: parsedDepartmentId,

        jobTitle:
          typeof jobTitle === "string" &&
          jobTitle.trim()
            ? jobTitle.trim()
            : null,

        role:
          typeof role === "string" && role.trim()
            ? role.trim()
            : null,

        experience: parsedExperience,

        employmentType: finalEmploymentType,

        joiningDate: parsedJoiningDate,

        availability: finalAvailability,

        bio:
          typeof bio === "string" && bio.trim()
            ? bio.trim()
            : null,

        notes:
          typeof notes === "string" && notes.trim()
            ? notes.trim()
            : null,

        preferredTaskTypes:
          typeof preferredTaskTypes === "string" &&
          preferredTaskTypes.trim()
            ? preferredTaskTypes.trim()
            : null,

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

    // --------------------------------------
    // Activity log
    // --------------------------------------

    await prisma.activityLog.create({
      data: {
        action: "PERSON_CREATED",
        entity: "Person",
        details: `Person ${person.fullName} was created`,
        personId: person.id,
      },
    });

    res.status(201).json({
      success: true,
      data: person,
    });
  } catch (error) {
    console.error("Failed to create person:", error);

    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return res.status(409).json({
        success: false,
        message:
          "A person with this email already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create person",
    });
  }
});

// ==========================================
// UPDATE PERSON
// ==========================================

router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid person ID",
      });
    }

    const existing = await prisma.person.findUnique({
      where: { id },

      include: {
        skills: true,
      },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Person not found",
      });
    }

    const {
      fullName,
      email,
      phone,
      profileImage,
      location,
      departmentId,
      jobTitle,
      role,
      experience,
      employmentType,
      joiningDate,
      availability,
      bio,
      notes,
      preferredTaskTypes,
      skillIds,
    } = req.body;

    // --------------------------------------
    // Validate name
    // --------------------------------------

    if (
      fullName !== undefined &&
      (!String(fullName).trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Full name cannot be empty",
      });
    }

    // --------------------------------------
    // Validate email
    // --------------------------------------

    let normalizedEmail: string | undefined;

    if (email !== undefined) {
      normalizedEmail = String(email)
        .trim()
        .toLowerCase();

      if (!normalizedEmail) {
        return res.status(400).json({
          success: false,
          message: "Email cannot be empty",
        });
      }

      if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({
          success: false,
          message:
            "Please provide a valid email address",
        });
      }

      const emailOwner =
        await prisma.person.findUnique({
          where: {
            email: normalizedEmail,
          },
        });

      if (
        emailOwner &&
        emailOwner.id !== id
      ) {
        return res.status(409).json({
          success: false,
          message:
            "A person with this email already exists",
        });
      }
    }

    // --------------------------------------
    // Department validation
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
    // Experience validation
    // --------------------------------------

    let parsedExperience:
      | number
      | undefined;

    if (experience !== undefined) {
      parsedExperience = Number(experience);

      if (
        Number.isNaN(parsedExperience) ||
        parsedExperience < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Experience must be a valid non-negative number",
        });
      }
    }

    // --------------------------------------
    // Employment type validation
    // --------------------------------------

    if (
      employmentType !== undefined &&
      !VALID_EMPLOYMENT_TYPES.includes(
        employmentType
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid employment type",
      });
    }

    // --------------------------------------
    // Availability validation
    // --------------------------------------

    if (
      availability !== undefined &&
      !VALID_AVAILABILITIES.includes(
        availability
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid availability value",
      });
    }

    // --------------------------------------
    // Joining date validation
    // --------------------------------------

    let parsedJoiningDate:
      | Date
      | null
      | undefined;

    if (joiningDate !== undefined) {
      if (!joiningDate) {
        parsedJoiningDate = null;
      } else {
        parsedJoiningDate = new Date(
          joiningDate
        );

        if (
          Number.isNaN(
            parsedJoiningDate.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid joining date",
          });
        }
      }
    }

    // --------------------------------------
    // Skill IDs
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
            .map((skillId: unknown) =>
              Number(skillId)
            )
            .filter(
              (skillId: number) =>
                !Number.isNaN(skillId)
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
    // Update person
    // --------------------------------------

    const person = await prisma.person.update({
      where: { id },

      data: {
        ...(fullName !== undefined && {
          fullName: String(fullName).trim(),
        }),

        ...(normalizedEmail !== undefined && {
          email: normalizedEmail,
        }),

        ...(phone !== undefined && {
          phone:
            phone && String(phone).trim()
              ? String(phone).trim()
              : null,
        }),

        ...(profileImage !== undefined && {
          profileImage:
            profileImage &&
            String(profileImage).trim()
              ? String(profileImage).trim()
              : null,
        }),

        ...(location !== undefined && {
          location:
            location &&
            String(location).trim()
              ? String(location).trim()
              : null,
        }),

        ...(departmentId !== undefined && {
          departmentId:
            parsedDepartmentId ?? null,
        }),

        ...(jobTitle !== undefined && {
          jobTitle:
            jobTitle &&
            String(jobTitle).trim()
              ? String(jobTitle).trim()
              : null,
        }),

        ...(role !== undefined && {
          role:
            role && String(role).trim()
              ? String(role).trim()
              : null,
        }),

        ...(parsedExperience !== undefined && {
          experience: parsedExperience,
        }),

        ...(employmentType !== undefined && {
          employmentType,
        }),

        ...(parsedJoiningDate !== undefined && {
          joiningDate: parsedJoiningDate,
        }),

        ...(availability !== undefined && {
          availability,
        }),

        ...(bio !== undefined && {
          bio:
            bio && String(bio).trim()
              ? String(bio).trim()
              : null,
        }),

        ...(notes !== undefined && {
          notes:
            notes && String(notes).trim()
              ? String(notes).trim()
              : null,
        }),

        ...(preferredTaskTypes !==
          undefined && {
          preferredTaskTypes:
            preferredTaskTypes &&
            String(
              preferredTaskTypes
            ).trim()
              ? String(
                  preferredTaskTypes
                ).trim()
              : null,
        }),
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

    // --------------------------------------
    // Update skills if supplied
    // --------------------------------------

    if (parsedSkillIds !== undefined) {
      const oldSkillIds = existing.skills.map(
        (item) => item.skillId
      );

      const skillsToRemove =
        oldSkillIds.filter(
          (skillId) =>
            !parsedSkillIds!.includes(skillId)
        );

      const skillsToAdd =
        parsedSkillIds.filter(
          (skillId) =>
            !oldSkillIds.includes(skillId)
        );

      if (skillsToRemove.length > 0) {
        await prisma.personSkill.deleteMany({
          where: {
            personId: id,
            skillId: {
              in: skillsToRemove,
            },
          },
        });

        for (const skillId of skillsToRemove) {
          await prisma.activityLog.create({
            data: {
              action: "SKILL_REMOVED",
              entity: "Person",
              details: `Skill ${skillId} removed from ${person.fullName}`,
              personId: id,
            },
          });
        }
      }

      if (skillsToAdd.length > 0) {
        // SQLite does not support `skipDuplicates` on createMany,
        // so relationship rows are created individually instead.
        for (const skillId of skillsToAdd) {
          await prisma.personSkill.upsert({
            where: {
              personId_skillId: {
                personId: id,
                skillId,
              },
            },
            update: {},
            create: {
              personId: id,
              skillId,
            },
          });
        }

        for (const skillId of skillsToAdd) {
          const skill =
            await prisma.skill.findUnique({
              where: {
                id: skillId,
              },
            });

          await prisma.activityLog.create({
            data: {
              action: "SKILL_ADDED",
              entity: "Person",
              details: `${skill?.name ?? `Skill ${skillId}`} added to ${person.fullName}`,
              personId: id,
            },
          });
        }
      }
    }

    // --------------------------------------
    // Get updated person
    // --------------------------------------

    const updatedPerson =
      await prisma.person.findUnique({
        where: { id },

        include: {
          department: true,

          skills: {
            include: {
              skill: true,
            },
          },
        },
      });

    // --------------------------------------
    // Activity log
    // --------------------------------------

    await prisma.activityLog.create({
      data: {
        action: "PERSON_UPDATED",
        entity: "Person",
        details: `Person ${person.fullName} was updated`,
        personId: person.id,
      },
    });

    res.json({
      success: true,
      data: updatedPerson,
    });
  } catch (error) {
    console.error("Failed to update person:", error);

    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return res.status(409).json({
        success: false,
        message:
          "A person with this email already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update person",
    });
  }
});

// ==========================================
// DELETE / DEACTIVATE PERSON
// ==========================================

router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid person ID",
      });
    }

    const person = await prisma.person.findUnique({
      where: { id },
    });

    if (!person) {
      return res.status(404).json({
        success: false,
        message: "Person not found",
      });
    }

    if (!person.isActive) {
      return res.json({
        success: true,
        message: "Person is already inactive",
        data: person,
      });
    }

    const updatedPerson =
      await prisma.person.update({
        where: { id },

        data: {
          isActive: false,
          availability: "INACTIVE",
        },
      });

    await prisma.activityLog.create({
      data: {
        action: "PERSON_DEACTIVATED",
        entity: "Person",
        details: `Person ${person.fullName} was deactivated`,
        personId: person.id,
      },
    });

    res.json({
      success: true,
      message: "Person deactivated successfully",
      data: updatedPerson,
    });
  } catch (error) {
    console.error(
      "Failed to deactivate person:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to deactivate person",
    });
  }
});

// ==========================================
// ADD SKILL TO PERSON
// ==========================================

router.post("/:id/skills", async (req, res) => {
  try {
    const personId = Number(req.params.id);
    const skillId = Number(req.body.skillId);

    if (
      Number.isNaN(personId) ||
      Number.isNaN(skillId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid person ID or skill ID",
      });
    }

    const person = await prisma.person.findUnique({
      where: { id: personId },
    });

    if (!person) {
      return res.status(404).json({
        success: false,
        message: "Person not found",
      });
    }

    const skill = await prisma.skill.findUnique({
      where: { id: skillId },
    });

    if (!skill) {
      return res.status(404).json({
        success: false,
        message: "Skill not found",
      });
    }

    const existingSkill =
      await prisma.personSkill.findUnique({
        where: {
          personId_skillId: {
            personId,
            skillId,
          },
        },
      });

    if (existingSkill) {
      return res.status(409).json({
        success: false,
        message: "Person already has this skill",
      });
    }

    const personSkill =
      await prisma.personSkill.create({
        data: {
          personId,
          skillId,
        },

        include: {
          skill: true,
        },
      });

    await prisma.activityLog.create({
      data: {
        action: "SKILL_ADDED",
        entity: "Person",
        details: `${skill.name} added to ${person.fullName}`,
        personId,
      },
    });

    res.status(201).json({
      success: true,
      data: personSkill,
    });
  } catch (error) {
    console.error("Failed to add skill:", error);

    res.status(500).json({
      success: false,
      message: "Failed to add skill",
    });
  }
});

// ==========================================
// REMOVE SKILL FROM PERSON
// ==========================================

router.delete(
  "/:id/skills/:skillId",
  async (req, res) => {
    try {
      const personId = Number(req.params.id);
      const skillId = Number(req.params.skillId);

      if (
        Number.isNaN(personId) ||
        Number.isNaN(skillId)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid person ID or skill ID",
        });
      }

      const person = await prisma.person.findUnique({
        where: {
          id: personId,
        },
      });

      if (!person) {
        return res.status(404).json({
          success: false,
          message: "Person not found",
        });
      }

      const skill =
        await prisma.skill.findUnique({
          where: {
            id: skillId,
          },
        });

      if (!skill) {
        return res.status(404).json({
          success: false,
          message: "Skill not found",
        });
      }

      const personSkill =
        await prisma.personSkill.findUnique({
          where: {
            personId_skillId: {
              personId,
              skillId,
            },
          },
        });

      if (!personSkill) {
        return res.status(404).json({
          success: false,
          message:
            "This person does not have this skill",
        });
      }

      await prisma.personSkill.delete({
        where: {
          personId_skillId: {
            personId,
            skillId,
          },
        },
      });

      await prisma.activityLog.create({
        data: {
          action: "SKILL_REMOVED",
          entity: "Person",
          details: `${skill.name} removed from ${person.fullName}`,
          personId,
        },
      });

      res.json({
        success: true,
        message: "Skill removed successfully",
      });
    } catch (error) {
      console.error(
        "Failed to remove skill:",
        error
      );

      res.status(500).json({
        success: false,
        message: "Failed to remove skill",
      });
    }
  }
);

export default router;