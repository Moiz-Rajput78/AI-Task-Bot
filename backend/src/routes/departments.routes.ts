import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

// GET all departments
router.get("/", async (_req, res) => {
  try {
    const departments = await prisma.department.findMany({
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
      data: departments,
    });
  } catch (error) {
    console.error("Failed to fetch departments:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch departments",
    });
  }
});

// GET one department
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid department ID",
      });
    }

    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        people: {
          where: {
            isActive: true,
          },
          include: {
            skills: {
              include: {
                skill: true,
              },
            },
          },
        },
        _count: {
          select: {
            people: true,
            tasks: true,
          },
        },
      },
    });

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    res.json({
      success: true,
      data: department,
    });
  } catch (error) {
    console.error("Failed to fetch department:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch department",
    });
  }
});

// CREATE department
router.post("/", async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Department name is required",
      });
    }

    const department = await prisma.department.create({
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
      data: department,
    });
  } catch (error) {
    console.error("Failed to create department:", error);

    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return res.status(409).json({
        success: false,
        message: "Department already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create department",
    });
  }
});

// UPDATE department
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, description } = req.body;

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid department ID",
      });
    }

    const existing = await prisma.department.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    const department = await prisma.department.update({
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
      data: department,
    });
  } catch (error) {
    console.error("Failed to update department:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update department",
    });
  }
});

// DELETE department
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid department ID",
      });
    }

    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            people: true,
            tasks: true,
          },
        },
      },
    });

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    if (department._count.people > 0 || department._count.tasks > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Cannot delete a department that still has people or tasks",
      });
    }

    await prisma.department.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: "Department deleted successfully",
    });
  } catch (error) {
    console.error("Failed to delete department:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete department",
    });
  }
});

export default router;