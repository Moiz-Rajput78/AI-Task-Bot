import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

// GET dashboard summary
router.get("/", async (_req, res) => {
  try {
    const now = new Date();

    const [
      totalTasks,
      activeTasks,
      completedTasks,
      overdueTasks,
      teamMembers,
      activeProjects,
      tasksByStatus,
      tasksByPriority,
      tasksByDepartment,
      upcomingDeadlines,
      people,
    ] = await Promise.all([
      prisma.task.count(),

      prisma.task.count({
        where: {
          status: { notIn: ["COMPLETED"] },
        },
      }),

      prisma.task.count({
        where: { status: "COMPLETED" },
      }),

      prisma.task.count({
        where: {
          status: { notIn: ["COMPLETED"] },
          dueDate: { lt: now },
        },
      }),

      prisma.person.count({
        where: { isActive: true },
      }),

      prisma.project.count({
        where: { status: "ACTIVE" },
      }),

      prisma.task.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),

      prisma.task.groupBy({
        by: ["priority"],
        _count: { _all: true },
      }),

      prisma.task.groupBy({
        by: ["departmentId"],
        _count: { _all: true },
      }),

      prisma.task.findMany({
        where: {
          status: { notIn: ["COMPLETED"] },
          dueDate: { gte: now },
        },
        orderBy: { dueDate: "asc" },
        take: 5,
        include: {
          assignees: {
            include: { person: true },
          },
        },
      }),

      prisma.person.findMany({
        where: { isActive: true },
        include: {
          assignedTasks: {
            include: {
              task: { select: { status: true } },
            },
          },
        },
      }),
    ]);

    // Department names for the groupBy breakdown
    const departments = await prisma.department.findMany({
      where: {
        id: { in: tasksByDepartment.map((d) => d.departmentId).filter((id): id is number => id !== null) },
      },
    });
    const departmentNameById = new Map(departments.map((d) => [d.id, d.name]));

    const workload = people.map((person) => {
      const activeTaskCount = person.assignedTasks.filter(
        (a) => a.task.status !== "COMPLETED"
      ).length;

      return {
        personId: person.id,
        name: person.fullName,
        activeTaskCount,
        // Simple visual workload %, capped at 100 (5+ active tasks = fully loaded)
        workloadPercent: Math.min(100, activeTaskCount * 20),
      };
    });

    res.json({
      success: true,
      data: {
        summary: {
          totalTasks,
          activeTasks,
          completedTasks,
          overdueTasks,
          teamMembers,
          activeProjects,
        },
        tasksByStatus: tasksByStatus.map((s) => ({
          status: s.status,
          count: s._count._all,
        })),
        tasksByPriority: tasksByPriority.map((p) => ({
          priority: p.priority,
          count: p._count._all,
        })),
        tasksByDepartment: tasksByDepartment.map((d) => ({
          department: d.departmentId ? departmentNameById.get(d.departmentId) ?? "Unknown" : "Unassigned",
          count: d._count._all,
        })),
        upcomingDeadlines: upcomingDeadlines.map((task) => ({
          taskId: task.id,
          title: task.title,
          dueDate: task.dueDate,
          priority: task.priority,
          assignees: task.assignees.map((a) => a.person.fullName),
        })),
        workload,
      },
    });
  } catch (error) {
    console.error("Failed to fetch dashboard summary:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard summary",
    });
  }
});

export default router;
