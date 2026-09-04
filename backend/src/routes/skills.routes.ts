import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

// GET all skills
router.get("/", async (_req, res) => {
  try {
    const skills = await prisma.skill.findMany({
      orderBy: {
        name: "asc",
      },
      include: {
        _count: {
          select: {
            people: true,
            tasks: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: skills,
    });
  } catch (error) {
    console.error("Failed to fetch skills:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch skills",
    });
  }
});

// GET one skill
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid skill ID",
      });
    }

    const skill = await prisma.skill.findUnique({
      where: { id },
      include: {
        people: {
          include: {
            person: {
              include: {
                department: true,
              },
            },
          },
        },
        tasks: {
          include: {
            task: true,
          },
        },
      },
    });

    if (!skill) {
      return res.status(404).json({
        success: false,
        message: "Skill not found",
      });
    }

    res.json({
      success: true,
      data: skill,
    });
  } catch (error) {
    console.error("Failed to fetch skill:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch skill",
    });
  }
});

// CREATE skill
router.post("/", async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Skill name is required",
      });
    }

    const skill = await prisma.skill.create({
      data: {
        name: name.trim(),
        description:
          typeof description === "string" && description.trim()
            ? description.trim()
            : null,
      },
    });

    res.status(201).json({
      success: true,
      data: skill,
    });
  } catch (error) {
    console.error("Failed to create skill:", error);

    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return res.status(409).json({
        success: false,
        message: "Skill already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create skill",
    });
  }
});

// UPDATE skill
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, description } = req.body;

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid skill ID",
      });
    }

    const existing = await prisma.skill.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Skill not found",
      });
    }

    const skill = await prisma.skill.update({
      where: { id },
      data: {
        ...(name !== undefined && {
          name: String(name).trim(),
        }),
        ...(description !== undefined && {
          description:
            description === null
              ? null
              : String(description).trim() || null,
        }),
      },
    });

    res.json({
      success: true,
      data: skill,
    });
  } catch (error) {
    console.error("Failed to update skill:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update skill",
    });
  }
});

// DELETE skill
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid skill ID",
      });
    }

    const existing = await prisma.skill.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Skill not found",
      });
    }

    await prisma.skill.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: "Skill deleted successfully",
    });
  } catch (error) {
    console.error("Failed to delete skill:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete skill",
    });
  }
});

export default router;