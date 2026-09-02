"use client";

import { FormEvent, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Task = {
  id: number;
  title: string;
  description: string | null;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

const TASKS_URL = `${API_BASE_URL}/api/tasks`;
const AI_URL = `${API_BASE_URL}/api/ai`;

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);

  // Create task
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // General loading/error
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Edit task
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Delete confirmation
  const [deleteTaskId, setDeleteTaskId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // AI
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  async function fetchTasks() {
    try {
      setError("");

      const response = await fetch(TASKS_URL);

      if (!response.ok) {
        throw new Error("Failed to fetch tasks");
      }

      const result = await response.json();
      setTasks(result.data || []);
    } catch (err) {
      setError("Could not connect to the backend.");
      console.error(err);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchTasks();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      setError("Please enter a task title.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch(TASKS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create task");
      }

      setTitle("");
      setDescription("");

      await fetchTasks();
    } catch (err) {
      setError("Could not create the task.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function startEdit(task: Task) {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setError("");
  }

  function cancelEdit() {
    setEditingTaskId(null);
    setEditTitle("");
    setEditDescription("");
  }

  async function updateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingTaskId) {
      return;
    }

    if (!editTitle.trim()) {
      setError("Task title cannot be empty.");
      return;
    }

    try {
      setEditLoading(true);
      setError("");

      const task = tasks.find((item) => item.id === editingTaskId);

      const response = await fetch(`${TASKS_URL}/${editingTaskId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          completed: task?.completed ?? false,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update task");
      }

      cancelEdit();
      await fetchTasks();
    } catch (err) {
      setError("Could not update the task.");
      console.error(err);
    } finally {
      setEditLoading(false);
    }
  }

  async function deleteTask(id: number) {
    try {
      setDeleteLoading(true);
      setError("");

      const response = await fetch(`${TASKS_URL}/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete task");
      }

      if (editingTaskId === id) {
        cancelEdit();
      }

      setDeleteTaskId(null);

      await fetchTasks();
    } catch (err) {
      setError("Could not delete the task.");
      console.error(err);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function toggleTask(task: Task) {
    try {
      setError("");

      const response = await fetch(`${TASKS_URL}/${task.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          completed: !task.completed,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update task");
      }

      await fetchTasks();
    } catch (err) {
      setError("Could not update the task.");
      console.error(err);
    }
  }

  async function askAI(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!aiPrompt.trim()) {
      setError("Please enter a question for the AI.");
      return;
    }

    try {
      setAiLoading(true);
      setError("");
      setAiResponse("");

      const taskContext =
        tasks.length > 0
          ? tasks
              .map(
                (task) =>
                  `- ${task.title} | ${
                    task.completed ? "Completed" : "Pending"
                  }${task.description ? ` | ${task.description}` : ""}`
              )
              .join("\n")
          : "No tasks currently exist.";

      const prompt = `
You are an AI Task Assistant.

The user's current tasks are:

${taskContext}

User's request:
${aiPrompt}

Give a helpful, clear and concise answer based on the user's tasks.
Use Markdown formatting when useful, including headings, bullet points,
numbered lists, bold text, and tables.
`;

      const response = await fetch(AI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        throw new Error(
          errorData.message || "Failed to get AI response"
        );
      }

      const result = await response.json();

      setAiResponse(
        result.data?.response || "No response received from AI."
      );
    } catch (err) {
      setError("Could not get a response from the AI.");
      console.error(err);
    } finally {
      setAiLoading(false);
    }
  }

  const completedTasks = tasks.filter(
    (task) => task.completed
  ).length;

  const pendingTasks = tasks.length - completedTasks;

  const taskToDelete = tasks.find(
    (task) => task.id === deleteTaskId
  );

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-5xl">

        {/* Header */}
        <header className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center rounded-full bg-blue-100 px-4 py-2 text-sm font-medium text-blue-700">
            🤖 AI Powered Productivity
          </div>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            AI Task Bot
          </h1>

          <p className="mx-auto mt-3 max-w-2xl text-slate-600">
            Manage your tasks, track your progress, and get intelligent
            assistance from your AI task assistant.
          </p>
        </header>

        {/* Statistics */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">

          {/* Total */}
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Total Tasks
                </p>

                <p className="mt-1 text-3xl font-bold text-slate-900">
                  {tasks.length}
                </p>
              </div>

              <div className="rounded-xl bg-blue-100 p-3 text-2xl">
                📋
              </div>
            </div>
          </div>

          {/* Pending */}
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Pending
                </p>

                <p className="mt-1 text-3xl font-bold text-orange-600">
                  {pendingTasks}
                </p>
              </div>

              <div className="rounded-xl bg-orange-100 p-3 text-2xl">
                ⏳
              </div>
            </div>
          </div>

          {/* Completed */}
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Completed
                </p>

                <p className="mt-1 text-3xl font-bold text-green-600">
                  {completedTasks}
                </p>
              </div>

              <div className="rounded-xl bg-green-100 p-3 text-2xl">
                ✅
              </div>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Create Task */}
        <section className="mb-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-7">
          <div className="mb-5">
            <h2 className="text-2xl font-bold">
              Create New Task
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Add a task to your productivity list.
            </p>
          </div>

          <form onSubmit={createTask}>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Task Title
            </label>

            <input
              type="text"
              placeholder="e.g. Complete internship assignment"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mb-4 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            <label className="mb-2 block text-sm font-medium text-slate-700">
              Description
            </label>

            <textarea
              placeholder="Add some details about this task..."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="mb-4 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {loading ? "Creating Task..." : "＋ Add Task"}
            </button>
          </form>
        </section>

        {/* AI Assistant */}
        <section className="mb-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">

          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-6 text-white sm:px-7">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-white/20 p-3 text-2xl">
                🤖
              </div>

              <div>
                <h2 className="text-2xl font-bold">
                  AI Task Assistant
                </h2>

                <p className="mt-1 text-sm text-purple-100">
                  Ask questions and get intelligent advice based on your tasks.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-7">
            <form onSubmit={askAI}>
              <textarea
                placeholder="Ask something like: Which task should I prioritize?"
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                rows={4}
                className="mb-4 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
              />

              <div className="mb-5">
                <p className="mb-2 text-sm font-medium text-slate-600">
                  Quick prompts
                </p>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setAiPrompt("Which task should I prioritize?")
                    }
                    className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm transition hover:bg-slate-100"
                  >
                    🎯 Prioritize tasks
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setAiPrompt(
                        "Make me a simple plan to complete my pending tasks."
                      )
                    }
                    className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm transition hover:bg-slate-100"
                  >
                    📝 Make a plan
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setAiPrompt(
                        "Give me advice for staying productive and completing my tasks."
                      )
                    }
                    className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm transition hover:bg-slate-100"
                  >
                    🚀 Productivity advice
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={aiLoading}
                  className="rounded-xl bg-purple-600 px-6 py-3 font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {aiLoading ? "🤔 Thinking..." : "✨ Ask AI"}
                </button>

                {aiResponse && (
                  <button
                    type="button"
                    onClick={() => setAiResponse("")}
                    className="rounded-xl bg-slate-100 px-5 py-3 font-medium text-slate-700 transition hover:bg-slate-200"
                  >
                    Clear Response
                  </button>
                )}
              </div>
            </form>

            {aiLoading && (
              <div className="mt-6 rounded-xl border border-purple-100 bg-purple-50 p-5">
                <div className="flex items-center gap-3 text-purple-700">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-300 border-t-purple-700" />

                  <span className="font-medium">
                    AI is thinking...
                  </span>
                </div>
              </div>
            )}

            {aiResponse && !aiLoading && (
              <div className="mt-6 rounded-2xl border border-purple-100 bg-slate-50 p-5 sm:p-6">
                <h3 className="mb-4 font-bold text-purple-700">
                  ✨ AI Response
                </h3>

                <div className="max-w-none text-slate-700">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => (
                        <h1 className="mb-4 mt-2 text-2xl font-bold text-slate-900">
                          {children}
                        </h1>
                      ),

                      h2: ({ children }) => (
                        <h2 className="mb-3 mt-5 text-xl font-bold text-slate-900">
                          {children}
                        </h2>
                      ),

                      h3: ({ children }) => (
                        <h3 className="mb-2 mt-4 text-lg font-semibold text-slate-900">
                          {children}
                        </h3>
                      ),

                      p: ({ children }) => (
                        <p className="mb-3 leading-7">
                          {children}
                        </p>
                      ),

                      ul: ({ children }) => (
                        <ul className="mb-4 ml-6 list-disc space-y-1">
                          {children}
                        </ul>
                      ),

                      ol: ({ children }) => (
                        <ol className="mb-4 ml-6 list-decimal space-y-1">
                          {children}
                        </ol>
                      ),

                      li: ({ children }) => (
                        <li className="leading-7">
                          {children}
                        </li>
                      ),

                      strong: ({ children }) => (
                        <strong className="font-bold text-slate-900">
                          {children}
                        </strong>
                      ),

                      blockquote: ({ children }) => (
                        <blockquote className="mb-4 border-l-4 border-purple-400 pl-4 italic text-slate-600">
                          {children}
                        </blockquote>
                      ),

                      table: ({ children }) => (
                        <div className="mb-4 overflow-x-auto">
                          <table className="w-full border-collapse border border-slate-300 text-sm">
                            {children}
                          </table>
                        </div>
                      ),

                      thead: ({ children }) => (
                        <thead className="bg-slate-200">
                          {children}
                        </thead>
                      ),

                      th: ({ children }) => (
                        <th className="border border-slate-300 px-4 py-2 text-left font-semibold">
                          {children}
                        </th>
                      ),

                      td: ({ children }) => (
                        <td className="border border-slate-300 px-4 py-2">
                          {children}
                        </td>
                      ),

                      code: ({ children }) => (
                        <code className="rounded bg-slate-200 px-1.5 py-0.5 text-sm">
                          {children}
                        </code>
                      ),
                    }}
                  >
                    {aiResponse}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Tasks */}
        <section>
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                Your Tasks
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Manage and track your current tasks.
              </p>
            </div>

            <span className="w-fit rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700">
              {tasks.length} task{tasks.length !== 1 ? "s" : ""}
            </span>
          </div>

          {tasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
              <div className="mb-3 text-5xl">
                📋
              </div>

              <h3 className="text-lg font-semibold text-slate-800">
                No tasks yet
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Create your first task above to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={`rounded-2xl bg-white p-5 shadow-sm ring-1 transition ${
                    task.completed
                      ? "ring-green-100"
                      : "ring-slate-200 hover:ring-blue-200"
                  }`}
                >
                  {editingTaskId === task.id ? (
                    /* Edit Form */
                    <form onSubmit={updateTask}>
                      <div className="mb-4 flex items-center gap-3">
                        <div className="rounded-xl bg-blue-100 p-2">
                          ✏️
                        </div>

                        <h3 className="text-lg font-bold">
                          Edit Task
                        </h3>
                      </div>

                      <input
                        type="text"
                        value={editTitle}
                        onChange={(event) =>
                          setEditTitle(event.target.value)
                        }
                        placeholder="Task title"
                        className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />

                      <textarea
                        value={editDescription}
                        onChange={(event) =>
                          setEditDescription(event.target.value)
                        }
                        placeholder="Task description"
                        rows={3}
                        className="mb-4 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          disabled={editLoading}
                          className="rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {editLoading
                            ? "Saving..."
                            : "✓ Save Changes"}
                        </button>

                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={editLoading}
                          className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    /* Normal Task */
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={() => toggleTask(task)}
                          className="mt-1 h-5 w-5 cursor-pointer accent-blue-600"
                        />

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3
                              className={`text-lg font-bold ${
                                task.completed
                                  ? "text-slate-400 line-through"
                                  : "text-slate-900"
                              }`}
                            >
                              {task.title}
                            </h3>

                            {task.completed ? (
                              <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                                Completed
                              </span>
                            ) : (
                              <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700">
                                Pending
                              </span>
                            )}
                          </div>

                          {task.description && (
                            <p
                              className={`mt-2 text-sm leading-6 ${
                                task.completed
                                  ? "text-slate-400"
                                  : "text-slate-500"
                              }`}
                            >
                              {task.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 gap-2 sm:self-center">
                        <button
                          onClick={() => startEdit(task)}
                          className="flex-1 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-600 sm:flex-none"
                        >
                          ✏️ Edit
                        </button>

                        <button
                          onClick={() => setDeleteTaskId(task.id)}
                          className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600 sm:flex-none"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="mt-10 pb-4 text-center text-sm text-slate-400">
          AI Task Bot • Task Management + AI Assistant
        </footer>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTaskId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm"
          onClick={() => {
            if (!deleteLoading) {
              setDeleteTaskId(null);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200 sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Warning Icon */}
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl">
              🗑️
            </div>

            {/* Message */}
            <div className="mt-5 text-center">
              <h3 className="text-2xl font-bold text-slate-900">
                Delete Task?
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Are you sure you want to delete this task?
              </p>

              {taskToDelete && (
                <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-left ring-1 ring-slate-200">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Task
                  </p>

                  <p className="mt-1 font-semibold text-slate-800">
                    {taskToDelete.title}
                  </p>
                </div>
              )}

              <p className="mt-4 text-xs text-slate-400">
                This action cannot be undone.
              </p>
            </div>

            {/* Modal Buttons */}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={deleteLoading}
                onClick={() => setDeleteTaskId(null)}
                className="flex-1 rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={deleteLoading}
                onClick={() => {
                  if (deleteTaskId !== null) {
                    void deleteTask(deleteTaskId);
                  }
                }}
                className="flex-1 rounded-xl bg-red-500 px-4 py-3 font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteLoading ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}