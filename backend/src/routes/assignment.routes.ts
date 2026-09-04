import { Router } from "express";

import {
  recommendTaskAssignees,
} from "../services/assignment.service";

import prisma from "../lib/prisma";

const router = Router();

// ==========================================
// GET TASK ASSIGNMENT RECOMMENDATIONS
// ==========================================
//
// Example:
// GET /api/assignments/task/1
//
// This does NOT assign the task.
// It only calculates and recommends candidates.
//
// ==========================================

router.get(
  "/task/:taskId",
  async (req, res) => {
    try {
      const taskId = Number(
        req.params.taskId
      );

      if (Number.isNaN(taskId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid task ID",
        });
      }

      const result =
        await recommendTaskAssignees(
          taskId
        );

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error(
        "Failed to generate assignment recommendations:",
        error
      );

      if (
        error instanceof Error &&
        error.message ===
          "Task not found"
      ) {
        return res.status(404).json({
          success: false,
          message: "Task not found",
        });
      }

      return res.status(500).json({
        success: false,
        message:
          "Failed to generate assignment recommendations",
      });
    }
  }
);

// ==========================================
// CONFIRM ASSIGNMENT
// ==========================================
//
// Example:
// POST /api/assignments/task/1/confirm
//
// Body:
// {
//   "personId": 5
// }
//
// This performs the actual assignment.
//
// ==========================================

router.post(
  "/task/:taskId/confirm",
  async (req, res) => {
    try {
      const taskId = Number(
        req.params.taskId
      );

      const personId = Number(
        req.body?.personId
      );

      if (Number.isNaN(taskId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid task ID",
        });
      }

      if (Number.isNaN(personId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid person ID",
        });
      }

      // ======================================
      // CHECK TASK
      // ======================================

      const task =
        await prisma.task.findUnique({
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

      // ======================================
      // CHECK PERSON
      // ======================================

      const person =
        await prisma.person.findFirst({
          where: {
            id: personId,
            isActive: true,
          },

          include: {
            department: true,
          },
        });

      if (!person) {
        return res.status(404).json({
          success: false,
          message:
            "Person not found or inactive",
        });
      }

      // ======================================
      // ASSIGN TASK
      // ======================================

      await prisma.taskAssignee.upsert({
        where: {
          taskId_personId: {
            taskId,
            personId,
          },
        },

        update: {},

        create: {
          taskId,
          personId,
        },
      });

      // ======================================
      // ACTIVITY LOG
      // ======================================

      await prisma.activityLog.create({
        data: {
          action:
            "TASK_ASSIGNED_BY_AI",
          entity: "Task",

          details: `Task "${task.title}" was assigned to ${person.fullName} after assignment recommendation confirmation.`,

          isAI: true,

          aiReason:
            "Assignment recommendation was confirmed by the user.",

          taskId,

          personId,
        },
      });

      // ======================================
      // RETURN UPDATED TASK
      // ======================================

      const updatedTask =
        await prisma.task.findUnique({
          where: {
            id: taskId,
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

      return res.json({
        success: true,

        message:
          `Task assigned to ${person.fullName} successfully`,

        data: updatedTask,
      });
    } catch (error) {
      console.error(
        "Failed to confirm task assignment:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to confirm task assignment",
      });
    }
  }
);

export default router;