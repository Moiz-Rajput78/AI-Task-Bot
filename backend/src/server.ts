import dotenv from "dotenv";

dotenv.config();

import express from "express";
import cors from "cors";
import prisma from "./lib/prisma";
import { generateAIResponse } from "./services/ai.service";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "AI Task Bot backend is running",
  });
});

app.get("/api/test-db", async (_req, res) => {
  try {
    const tests = await prisma.task.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      success: true,
      data: tests,
    });
  } catch (error) {
    console.error("Database error:", error);

    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

app.get("/api/tasks", async (_req, res) => {
  try {
    const tasks = await prisma.task.findMany({
      orderBy: {
        createdAt: "desc",
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

app.post("/api/tasks", async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title || typeof title !== "string") {
      return res.status(400).json({
        success: false,
        message: "Title is required",
      });
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
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

app.get("/api/tasks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID",
      });
    }

    const task = await prisma.task.findUnique({
      where: { id },
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

app.put("/api/tasks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, description, completed } = req.body;

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID",
      });
    }

    const existingTask = await prisma.task.findUnique({
      where: { id },
    });

    if (!existingTask) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(completed !== undefined && { completed }),
      },
    });

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error("Failed to update task:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update task",
    });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID",
      });
    }

    const existingTask = await prisma.task.findUnique({
      where: { id },
    });

    if (!existingTask) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    await prisma.task.delete({
      where: { id },
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

app.post("/api/ai", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        success: false,
        message: "Prompt is required",
      });
    }

    const response = await generateAIResponse(prompt);

    res.json({
      success: true,
      data: {
        response,
      },
    });
  } catch (error) {
    console.error("AI request failed:", error);

    res.status(500).json({
      success: false,
      message: "AI request failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});