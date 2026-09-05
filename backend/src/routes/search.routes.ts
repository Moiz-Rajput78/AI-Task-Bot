import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

// GET /api/search?q=node.js
router.get("/", async (req, res) => {
  try {
    const q =
      typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Query parameter 'q' is required",
      });
    }

    const [people, tasks, projects, skills, departments] =
      await Promise.all([
        prisma.person.findMany({
          where: {
            isActive: true,
            OR: [
              { fullName: { contains: q } },
              { email: { contains: q } },
              { role: { contains: q } },
              { jobTitle: { contains: q } },
              { skills: { some: { skill: { name: { contains: q } } } } },
            ],
          },
          include: {
            department: true,
            skills: { include: { skill: true } },
          },
          take: 10,
        }),

        prisma.task.findMany({
          where: {
            OR: [
              { title: { contains: q } },
              { description: { contains: q } },
              { skills: { some: { skill: { name: { contains: q } } } } },
            ],
          },
          include: {
            project: true,
            department: true,
          },
          take: 10,
        }),

        prisma.project.findMany({
          where: {
            OR: [
              { name: { contains: q } },
              { description: { contains: q } },
              { client: { contains: q } },
            ],
          },
          take: 10,
        }),

        prisma.skill.findMany({
          where: { name: { contains: q } },
          take: 10,
        }),

        prisma.department.findMany({
          where: { name: { contains: q } },
          take: 10,
        }),
      ]);

    res.json({
      success: true,
      data: {
        query: q,
        people,
        tasks,
        projects,
        skills,
        departments,
        totalResults:
          people.length +
          tasks.length +
          projects.length +
          skills.length +
          departments.length,
      },
    });
  } catch (error) {
    console.error("Search failed:", error);

    res.status(500).json({
      success: false,
      message: "Search failed",
    });
  }
});

export default router;
