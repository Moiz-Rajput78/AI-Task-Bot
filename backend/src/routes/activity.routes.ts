import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

// GET /api/activity?taskId=&personId=&isAI=&limit=&cursor=
router.get("/", async (req, res) => {
  try {
    const taskId = req.query.taskId
      ? Number(req.query.taskId)
      : undefined;

    const personId = req.query.personId
      ? Number(req.query.personId)
      : undefined;

    const isAI =
      req.query.isAI === "true"
        ? true
        : req.query.isAI === "false"
        ? false
        : undefined;

    const limitRaw = Number(req.query.limit);
    const limit =
      Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 100
        ? limitRaw
        : 30;

    const cursor = req.query.cursor
      ? Number(req.query.cursor)
      : undefined;

    const activities = await prisma.activityLog.findMany({
      where: {
        ...(taskId !== undefined && !Number.isNaN(taskId) ? { taskId } : {}),
        ...(personId !== undefined && !Number.isNaN(personId)
          ? { personId }
          : {}),
        ...(isAI !== undefined ? { isAI } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(cursor
        ? { skip: 1, cursor: { id: cursor } }
        : {}),
      include: {
        person: {
          select: { id: true, fullName: true },
        },
        task: {
          select: { id: true, title: true },
        },
      },
    });

    const nextCursor =
      activities.length === limit
        ? activities[activities.length - 1].id
        : null;

    res.json({
      success: true,
      data: activities,
      nextCursor,
    });
  } catch (error) {
    console.error("Failed to fetch activity log:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch activity log",
    });
  }
});

export default router;
