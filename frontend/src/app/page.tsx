"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

const TASKS_URL = `${API_URL}/api/tasks`;
const AI_URL =
  process.env.NEXT_PUBLIC_AI_URL ?? `${API_URL}/api/ai/chat`;
const AI_FALLBACK_URL = `${API_URL}/api/ai`;
const PEOPLE_URL = `${API_URL}/api/people`;
const DEPARTMENTS_URL = `${API_URL}/api/departments`;
const SKILLS_URL = `${API_URL}/api/skills`;
const PROJECTS_URL = `${API_URL}/api/projects`;

type Tab =
  | "overview"
  | "people"
  | "departments"
  | "skills"
  | "projects"
  | "tasks"
  | "ai";

type Theme = "light" | "dark";

type Task = {
  id: number;
  title: string;
  description?: string | null;
  completed: boolean;
  status?: string | null;
  priority?: string | null;
  taskType?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  labels?: string | null;
  createdAt: string;
  updatedAt: string;
  department?: Department | null;
  skills?: Array<{
    skill?: Skill | null;
  } | Skill>;
  projectId?: number | null;
  assignees?: Array<{
    personId?: number;
    person?: Person | null;
    user?: Person | null;
  }>;
  assignedTo?: Person | null;
  project?: {
    id: number;
    name: string;
  } | null;
  comments?: Array<{
    id: number;
    content: string;
    createdAt: string;
  }>;
  checklist?: Array<{
    id: number;
    title: string;
    completed: boolean;
    createdAt: string;
  }>;
  activities?: Array<{
    id: number;
    action: string;
    entity: string;
    details?: string | null;
    isAI?: boolean;
    aiReason?: string | null;
    createdAt: string;
  }>;
};

type Department = {
  id: number;
  name: string;
  description?: string | null;
  _count?: {
    people?: number;
    tasks?: number;
  };
};

type Skill = {
  id: number;
  name: string;
  description?: string | null;
  _count?: {
    people?: number;
    tasks?: number;
  };
};

type PersonSkill = {
  skill: Skill;
};

type Project = {
  id: number;
  name: string;
  description?: string | null;
  client?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  status?: string | null;
  manager?: Person | null;
  members?: Array<{
    person?: Person | null;
  }>;
  tasks?: Task[];
  _count?: {
    members?: number;
    tasks?: number;
  };
};

type Person = {
  id: number;
  fullName: string;
  email: string;
  phone?: string | null;
  profileImage?: string | null;
  location?: string | null;
  jobTitle?: string | null;
  role?: string | null;
  experience?: number | null;
  employmentType?: string | null;
  joiningDate?: string | null;
  availability?: string | null;
  bio?: string | null;
  notes?: string | null;
  preferredTaskTypes?: string | null;
  isActive?: boolean;
  department?: Department | null;
  skills?: PersonSkill[];
  _count?: {
    assignedTasks?: number;
  };
};

type ApiResponse<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
  reply?: string;
  content?: string;
};

type Toast = {
  id: number;
  type: "success" | "error";
  message: string;
};

type AiMessage = {
  role: "user" | "assistant";
  content: string;
};

const statusLabels: Record<string, string> = {
  BACKLOG: "Backlog",
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  REVIEW: "Review",
  COMPLETED: "Completed",
};

const priorityLabels: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

const projectStatusLabels: Record<string, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const availabilityLabels: Record<string, string> = {
  AVAILABLE: "Available",
  PARTIALLY_AVAILABLE: "Partially Available",
  BUSY: "Busy",
  ON_LEAVE: "On Leave",
  INACTIVE: "Inactive",
};

const kanbanStatuses = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "REVIEW",
  "COMPLETED",
];

const navigation = [
  {
    id: "overview" as Tab,
    label: "Overview",
    icon: "⌂",
  },
  {
    id: "people" as Tab,
    label: "People",
    icon: "👥",
  },
  {
    id: "departments" as Tab,
    label: "Departments",
    icon: "🏢",
  },
  {
    id: "skills" as Tab,
    label: "Skills",
    icon: "🧩",
  },
  {
    id: "projects" as Tab,
    label: "Projects",
    icon: "📁",
  },
  {
    id: "tasks" as Tab,
    label: "Tasks",
    icon: "✓",
  },
  {
    id: "ai" as Tab,
    label: "AI Task Bot",
    icon: "✨",
  },
];

async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });

  const responseText = await response.text();

  let payload: ApiResponse<T> | T | null = null;

  try {
    payload = responseText
      ? JSON.parse(responseText)
      : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (
      payload &&
      typeof payload === "object" &&
      "message" in payload &&
      payload.message
    ) {
      throw new Error(String(payload.message));
    }

    if (
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      payload.error
    ) {
      throw new Error(String(payload.error));
    }

    throw new Error(
      responseText ||
        `Request failed with status ${response.status}`
    );
  }

  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload
  ) {
    return (payload as ApiResponse<T>).data as T;
  }

  return payload as T;
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getStatus(task: Task) {
  if (task.completed) {
    return "COMPLETED";
  }

  return task.status || "TODO";
}

function getPriority(task: Task) {
  return task.priority || "MEDIUM";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function getTaskAssignee(task: Task): Person | null {
  if (task.assignedTo) {
    return task.assignedTo;
  }

  if (task.assignees?.length) {
    const item = task.assignees[0];

    return item.person || item.user || null;
  }

  return null;
}

function KanbanDropZone({
  status,
  children,
}: {
  status: string;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[120px] space-y-3 rounded-xl p-1 transition",
        isOver && "bg-indigo-100/70 ring-2 ring-indigo-400 dark:bg-indigo-950/40"
      )}
    >
      {children}
    </div>
  );
}

function KanbanDraggableCard({
  taskId,
  children,
}: {
  taskId: number;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: `task-${taskId}` });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "touch-none",
        isDragging && "opacity-60"
      )}
    >
      {children}
    </div>
  );
}

export default function Home() {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const [activeTab, setActiveTab] =
    useState<Tab>("overview");

  // Keep the first render deterministic on both server and client.
  // Reading localStorage inside the useState initializer can cause a
  // hydration mismatch because the server cannot read the browser's
  // stored theme.
  const [theme, setTheme] = useState<Theme>("light");
  const [themeHydrated, setThemeHydrated] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [departments, setDepartments] =
    useState<Department[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [toasts, setToasts] = useState<Toast[]>([]);

  const [peopleSearch, setPeopleSearch] =
    useState("");
  const [peopleAvailability, setPeopleAvailability] =
    useState("ALL");
  const [peopleDepartment, setPeopleDepartment] =
    useState("ALL");
  const [peopleSkill, setPeopleSkill] = useState("ALL");
  const [peopleRole, setPeopleRole] = useState("");
  const [peopleMinExperience, setPeopleMinExperience] = useState("ALL");
  const [peopleWorkload, setPeopleWorkload] = useState("ALL");

  const [taskSearch, setTaskSearch] =
    useState("");
  const [taskStatus, setTaskStatus] =
    useState("ALL");
  const [taskPriority, setTaskPriority] =
    useState("ALL");
  const [taskProject, setTaskProject] = useState("ALL");
  const [taskDepartment, setTaskDepartment] = useState("ALL");
  const [taskAssignee, setTaskAssignee] = useState("ALL");
  const [taskDue, setTaskDue] = useState("ALL");

  const [globalSearch, setGlobalSearch] = useState("");
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);

  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const [showPersonModal, setShowPersonModal] =
    useState(false);
  const [editingPersonId, setEditingPersonId] =
    useState<number | null>(null);
  const [showDepartmentModal, setShowDepartmentModal] =
    useState(false);
  const [editingDepartmentId, setEditingDepartmentId] =
    useState<number | null>(null);
  const [showSkillModal, setShowSkillModal] =
    useState(false);
  const [editingSkillId, setEditingSkillId] =
    useState<number | null>(null);
  const [showTaskModal, setShowTaskModal] =
    useState(false);
  const [editingTaskId, setEditingTaskId] =
    useState<number | null>(null);
  const [showProjectModal, setShowProjectModal] =
    useState(false);
  const [editingProjectId, setEditingProjectId] =
    useState<number | null>(null);
  const [deleteProjectId, setDeleteProjectId] =
    useState<number | null>(null);

  const [deleteTaskId, setDeleteTaskId] =
    useState<number | null>(null);
  const [selectedTask, setSelectedTask] =
    useState<Task | null>(null);
  const [loadingTaskDetails, setLoadingTaskDetails] =
    useState(false);

  const [deletePersonId, setDeletePersonId] =
    useState<number | null>(null);

  const [saving, setSaving] = useState(false);

  const [personForm, setPersonForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    profileImage: "",
    location: "",
    departmentId: "",
    jobTitle: "",
    role: "",
    experience: "0",
    employmentType: "FULL_TIME",
    joiningDate: "",
    availability: "AVAILABLE",
    bio: "",
    notes: "",
    preferredTaskTypes: "",
    skillIds: [] as number[],
  });

  const [departmentForm, setDepartmentForm] =
    useState({
      name: "",
      description: "",
    });

  const [skillForm, setSkillForm] =
    useState({
      name: "",
      description: "",
    });

  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    priority: "MEDIUM",
    status: "TODO",
    projectId: "",
    departmentId: "",
    taskType: "",
    startDate: "",
    dueDate: "",
    estimatedHours: "",
    actualHours: "",
    labels: "",
    skillIds: [] as number[],
    assigneeIds: [] as number[],
  });

  const [projectForm, setProjectForm] = useState({
    name: "",
    description: "",
    client: "",
    startDate: "",
    dueDate: "",
    status: "PLANNING",
    managerId: "",
    memberIds: [] as number[],
  });

  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] =
    useState<AiMessage[]>([]);
  const [aiLoading, setAiLoading] =
    useState(false);
  const [aiConversationId, setAiConversationId] =
    useState(() => {
      if (typeof window === "undefined") {
        return "";
      }

      const storageKey = "ai-task-bot-conversation-id";
      const existingId =
        window.sessionStorage.getItem(storageKey);

      if (existingId) {
        return existingId;
      }

      const newId =
        typeof window.crypto?.randomUUID === "function"
          ? window.crypto.randomUUID()
          : `conversation-${Date.now()}-${Math.random()
              .toString(36)
              .slice(2)}`;

      window.sessionStorage.setItem(
        storageKey,
        newId
      );
      return newId;
    });
  const aiMessagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    aiMessagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [aiMessages, aiLoading]);

  // Read the saved theme only after hydration. This prevents the server
  // and client from rendering different theme icons on the first render.
  useEffect(() => {
    const storedTheme =
      window.localStorage.getItem(
        "ai-task-bot-theme"
      ) as Theme | null;

    if (storedTheme === "dark" || storedTheme === "light") {
      setTheme(storedTheme);
    }

    // Only render the browser-dependent theme icon after hydration.
    setThemeHydrated(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "dark",
      theme === "dark"
    );

    window.localStorage.setItem(
      "ai-task-bot-theme",
      theme
    );
  }, [theme]);

  const showToast = useCallback(
    (
      type: "success" | "error",
      message: string
    ) => {
      const id = Date.now();

      setToasts((current) => [
        ...current,
        {
          id,
          type,
          message,
        },
      ]);

      window.setTimeout(() => {
        setToasts((current) =>
          current.filter(
            (toast) => toast.id !== id
          )
        );
      }, 3500);
    },
    []
  );

  const loadAllData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [
        tasksData,
        peopleData,
        departmentsData,
        skillsData,
        projectsData,
      ] = await Promise.all([
        apiRequest<Task[]>(TASKS_URL),
        apiRequest<Person[]>(PEOPLE_URL),
        apiRequest<Department[]>(
          DEPARTMENTS_URL
        ),
        apiRequest<Skill[]>(SKILLS_URL),
        apiRequest<Project[]>(PROJECTS_URL),
      ]);

      setTasks(
        Array.isArray(tasksData) ? tasksData : []
      );

      setPeople(
        Array.isArray(peopleData)
          ? peopleData
          : []
      );

      setDepartments(
        Array.isArray(departmentsData)
          ? departmentsData
          : []
      );

      setSkills(
        Array.isArray(skillsData)
          ? skillsData
          : []
      );

      setProjects(
        Array.isArray(projectsData)
          ? projectsData
          : []
      );
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Unable to load workspace data.";

      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(
      loadAllData,
      0
    );

    return () => window.clearTimeout(timer);
  }, [loadAllData]);

  const getPersonActiveTaskCount = useCallback(
    (personId: number) =>
      tasks.filter(
        (task) =>
          getStatus(task) !== "COMPLETED" &&
          task.assignees?.some(
            (assignee) =>
              assignee.person?.id === personId ||
              assignee.personId === personId
          )
      ).length,
    [tasks]
  );

  const filteredPeople = useMemo(() => {
    const search = peopleSearch
      .trim()
      .toLowerCase();

    return people.filter((person) => {
      const matchesSearch =
        !search ||
        person.fullName
          .toLowerCase()
          .includes(search) ||
        person.email
          .toLowerCase()
          .includes(search) ||
        (person.jobTitle || "")
          .toLowerCase()
          .includes(search) ||
        (person.role || "")
          .toLowerCase()
          .includes(search);

      const matchesAvailability =
        peopleAvailability === "ALL" ||
        person.availability ===
          peopleAvailability;

      const matchesDepartment =
        peopleDepartment === "ALL" ||
        String(person.department?.id || "") ===
          peopleDepartment;

      const matchesSkill =
        peopleSkill === "ALL" ||
        person.skills?.some(
          (item) => String(item.skill?.id || "") === peopleSkill
        );

      const matchesRole =
        !peopleRole.trim() ||
        (person.role || "").toLowerCase().includes(peopleRole.trim().toLowerCase()) ||
        (person.jobTitle || "").toLowerCase().includes(peopleRole.trim().toLowerCase());

      const experience = Number(person.experience || 0);
      const matchesExperience =
        peopleMinExperience === "ALL" ||
        experience >= Number(peopleMinExperience);

      const workload = getPersonActiveTaskCount(person.id);
      const matchesWorkload =
        peopleWorkload === "ALL" ||
        (peopleWorkload === "LIGHT" && workload <= 2) ||
        (peopleWorkload === "MEDIUM" && workload >= 3 && workload <= 5) ||
        (peopleWorkload === "HIGH" && workload >= 6);

      return (
        matchesSearch &&
        matchesAvailability &&
        matchesDepartment &&
        matchesSkill &&
        matchesRole &&
        matchesExperience &&
        matchesWorkload
      );
    });
  }, [
    people,
    peopleSearch,
    peopleAvailability,
    peopleDepartment,
    peopleSkill,
    peopleRole,
    peopleMinExperience,
    peopleWorkload,
    getPersonActiveTaskCount,
  ]);

  const filteredTasks = useMemo(() => {
    const search = taskSearch
      .trim()
      .toLowerCase();

    return tasks.filter((task) => {
      const status = getStatus(task);
      const priority = getPriority(task);

      const matchesSearch =
        !search ||
        task.title
          .toLowerCase()
          .includes(search) ||
        (task.description || "")
          .toLowerCase()
          .includes(search);

      const matchesStatus =
        taskStatus === "ALL" ||
        status === taskStatus;

      const matchesPriority =
        taskPriority === "ALL" ||
        priority === taskPriority;

      const matchesProject =
        taskProject === "ALL" ||
        String(task.projectId || task.project?.id || "") === taskProject;

      const matchesDepartment =
        taskDepartment === "ALL" ||
        String(task.department?.id || "") === taskDepartment;

      const matchesAssignee =
        taskAssignee === "ALL" ||
        task.assignees?.some(
          (assignee) =>
            String(assignee.person?.id || assignee.personId || "") === taskAssignee
        );

      const dueDate = task.dueDate ? new Date(task.dueDate) : null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = dueDate ? new Date(dueDate) : null;
      if (due) due.setHours(0, 0, 0, 0);
      const matchesDue =
        taskDue === "ALL" ||
        (taskDue === "OVERDUE" && !!due && due < today && status !== "COMPLETED") ||
        (taskDue === "TODAY" && !!due && due.getTime() === today.getTime()) ||
        (taskDue === "UPCOMING" && !!due && due >= today && due.getTime() !== today.getTime());

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPriority &&
        matchesProject &&
        matchesDepartment &&
        matchesAssignee &&
        matchesDue
      );
    });
  }, [
    tasks,
    taskSearch,
    taskStatus,
    taskPriority,
    taskProject,
    taskDepartment,
    taskAssignee,
    taskDue,
  ]);

  const completedTasks = useMemo(
    () =>
      tasks.filter(
        (task) => getStatus(task) === "COMPLETED"
      ).length,
    [tasks]
  );

  const activeTasks = useMemo(
    () =>
      tasks.filter(
        (task) => getStatus(task) !== "COMPLETED"
      ).length,
    [tasks]
  );

  const overdueTasks = useMemo(() => {
    const now = new Date();

    return tasks.filter((task) => {
      const possibleDueDate =
        (
          task as Task & {
            dueDate?: string | null;
          }
        ).dueDate;

      if (!possibleDueDate) return false;

      return (
        new Date(possibleDueDate) < now &&
        getStatus(task) !== "COMPLETED"
      );
    }).length;
  }, [tasks]);

  const availablePeople = useMemo(
    () =>
      people.filter(
        (person) =>
          person.availability === "AVAILABLE"
      ).length,
    [people]
  );

  const busyPeople = useMemo(
    () =>
      people.filter(
        (person) =>
          person.availability === "BUSY"
      ).length,
    [people]
  );

  const partiallyAvailablePeople = useMemo(
    () =>
      people.filter(
        (person) =>
          person.availability ===
          "PARTIALLY_AVAILABLE"
      ).length,
    [people]
  );

  const urgentTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          getPriority(task) === "URGENT" &&
          getStatus(task) !== "COMPLETED"
      ).length,
    [tasks]
  );

  const completionRate =
    tasks.length === 0
      ? 0
      : Math.round(
          (completedTasks / tasks.length) * 100
        );

  const activeProjects = useMemo(
    () =>
      projects.filter(
        (project) => project.status === "ACTIVE"
      ).length,
    [projects]
  );

  const completedProjects = useMemo(
    () =>
      projects.filter(
        (project) => project.status === "COMPLETED"
      ).length,
    [projects]
  );

  const priorityCounts = useMemo(() => {
    return ["URGENT", "HIGH", "MEDIUM", "LOW"].reduce(
      (result, priority) => {
        result[priority] = tasks.filter(
          (task) => getPriority(task) === priority
        ).length;
        return result;
      },
      {} as Record<string, number>
    );
  }, [tasks]);

  const teamWorkload = useMemo(() => {
    return people
      .map((person) => {
        const assigned = tasks.filter((task) =>
          task.assignees?.some(
            (assignee) =>
              assignee.person?.id === person.id ||
              assignee.personId === person.id
          )
        ).filter(
          (task) => getStatus(task) !== "COMPLETED"
        ).length;

        return { person, assigned };
      })
      .sort((a, b) => b.assigned - a.assigned)
      .slice(0, 6);
  }, [people, tasks]);

  const projectProgress = useMemo(() => {
    return projects
      .map((project) => {
        const projectTasks = tasks.filter(
          (task) => task.projectId === project.id
        );
        const completed = projectTasks.filter(
          (task) => getStatus(task) === "COMPLETED"
        ).length;

        return {
          project,
          total: projectTasks.length,
          completed,
          percentage: projectTasks.length
            ? Math.round((completed / projectTasks.length) * 100)
            : 0,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [projects, tasks]);

  const taskStatusCounts = useMemo(() => {
    return kanbanStatuses.reduce(
      (result, status) => {
        result[status] = tasks.filter(
          (task) => getStatus(task) === status
        ).length;

        return result;
      },
      {} as Record<string, number>
    );
  }, [tasks]);

  const globalSearchResults = useMemo(() => {
    const query = globalSearch.trim().toLowerCase();
    if (!query) {
      return { people: [], tasks: [], projects: [], skills: [], departments: [] };
    }

    return {
      people: people.filter((person) =>
        [person.fullName, person.email, person.jobTitle, person.role]
          .some((value) => (value || "").toLowerCase().includes(query))
      ).slice(0, 5),
      tasks: tasks.filter((task) =>
        [task.title, task.description, task.taskType]
          .some((value) => (value || "").toLowerCase().includes(query))
      ).slice(0, 5),
      projects: projects.filter((project) =>
        [project.name, project.description, project.client]
          .some((value) => (value || "").toLowerCase().includes(query))
      ).slice(0, 5),
      skills: skills.filter((skill) =>
        [skill.name, skill.description]
          .some((value) => (value || "").toLowerCase().includes(query))
      ).slice(0, 5),
      departments: departments.filter((department) =>
        [department.name, department.description]
          .some((value) => (value || "").toLowerCase().includes(query))
      ).slice(0, 5),
    };
  }, [globalSearch, people, tasks, projects, skills, departments]);

  const toggleTask = async (task: Task) => {
    try {
      const nextCompleted = !task.completed;
      const nextStatus = nextCompleted
        ? "COMPLETED"
        : "TODO";

      const updated = await apiRequest<Task>(
        `${TASKS_URL}/${task.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            completed: nextCompleted,
            status: nextStatus,
          }),
        }
      );

      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? {
                ...item,
                ...updated,
                completed: nextCompleted,
                status: nextStatus,
              }
            : item
        )
      );

      showToast(
        "success",
        nextCompleted
          ? "Task marked as completed."
          : "Task moved back to To Do."
      );
    } catch (requestError) {
      showToast(
        "error",
        requestError instanceof Error
          ? requestError.message
          : "Unable to update task."
      );
    }
  };

  const moveTask = async (
    task: Task,
    status: string
  ) => {
    try {
      const completed =
        status === "COMPLETED";

      const updated = await apiRequest<Task>(
        `${TASKS_URL}/${task.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            status,
            completed,
          }),
        }
      );

      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? {
                ...item,
                ...updated,
                status,
                completed,
              }
            : item
        )
      );

      showToast(
        "success",
        `Task moved to ${
          statusLabels[status] || status
        }.`
      );
    } catch (requestError) {
      showToast(
        "error",
        requestError instanceof Error
          ? requestError.message
          : "Unable to move task."
      );
    }
  };

  const deleteTask = async () => {
    if (deleteTaskId === null) return;

    try {
      await apiRequest(
        `${TASKS_URL}/${deleteTaskId}`,
        {
          method: "DELETE",
        }
      );

      setTasks((current) =>
        current.filter(
          (task) => task.id !== deleteTaskId
        )
      );

      setDeleteTaskId(null);

      showToast(
        "success",
        "Task deleted successfully."
      );
    } catch (requestError) {
      showToast(
        "error",
        requestError instanceof Error
          ? requestError.message
          : "Unable to delete task."
      );
    }
  };

  const resetPersonForm = () => {
    setPersonForm({
      fullName: "",
      email: "",
      phone: "",
      profileImage: "",
      location: "",
      departmentId: "",
      jobTitle: "",
      role: "",
      experience: "0",
      employmentType: "FULL_TIME",
      joiningDate: "",
      availability: "AVAILABLE",
      bio: "",
      notes: "",
      preferredTaskTypes: "",
      skillIds: [],
    });
  };

  const openCreatePerson = () => {
    setEditingPersonId(null);
    resetPersonForm();
    setShowPersonModal(true);
  };

  const openEditPerson = (person: Person) => {
    setEditingPersonId(person.id);
    setPersonForm({
      fullName: person.fullName || "",
      email: person.email || "",
      phone: person.phone || "",
      profileImage: person.profileImage || "",
      location: person.location || "",
      departmentId: person.department?.id ? String(person.department.id) : "",
      jobTitle: person.jobTitle || "",
      role: person.role || "",
      experience: String(person.experience ?? 0),
      employmentType: person.employmentType || "FULL_TIME",
      joiningDate: person.joiningDate ? person.joiningDate.slice(0, 10) : "",
      availability: person.availability || "AVAILABLE",
      bio: person.bio || "",
      notes: person.notes || "",
      preferredTaskTypes: person.preferredTaskTypes || "",
      skillIds: (person.skills || []).map((item) => item.skill.id),
    });
    setShowPersonModal(true);
  };

  const savePerson = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!personForm.fullName.trim() || !personForm.email.trim()) {
      showToast("error", "Full name and email are required.");
      return;
    }

    try {
      setSaving(true);
      const isEditing = editingPersonId !== null;

      const payload = {
        fullName: personForm.fullName.trim(),
        email: personForm.email.trim(),
        phone: personForm.phone.trim() || null,
        profileImage: personForm.profileImage.trim() || null,
        location: personForm.location.trim() || null,
        departmentId: personForm.departmentId ? Number(personForm.departmentId) : null,
        jobTitle: personForm.jobTitle.trim() || null,
        role: personForm.role.trim() || null,
        experience: Number(personForm.experience) || 0,
        employmentType: personForm.employmentType,
        joiningDate: personForm.joiningDate || null,
        availability: personForm.availability,
        bio: personForm.bio.trim() || null,
        notes: personForm.notes.trim() || null,
        preferredTaskTypes: personForm.preferredTaskTypes.trim() || null,
        skillIds: personForm.skillIds,
      };

      await apiRequest(
        isEditing
          ? `${PEOPLE_URL}/${editingPersonId}`
          : PEOPLE_URL,
        {
          method: isEditing ? "PUT" : "POST",
          body: JSON.stringify(payload),
        }
      );

      setShowPersonModal(false);
      setEditingPersonId(null);
      resetPersonForm();
      await loadAllData();

      showToast(
        "success",
        isEditing
          ? "Team member updated successfully."
          : "Team member created successfully."
      );
    } catch (requestError) {
      showToast(
        "error",
        requestError instanceof Error
          ? requestError.message
          : editingPersonId === null
            ? "Unable to create team member."
            : "Unable to update team member."
      );
    } finally {
      setSaving(false);
    }
  };

  const deactivatePerson = async () => {
    if (deletePersonId === null) return;

    try {
      await apiRequest(
        `${PEOPLE_URL}/${deletePersonId}`,
        {
          method: "DELETE",
        }
      );

      setPeople((current) =>
        current.filter(
          (person) =>
            person.id !== deletePersonId
        )
      );

      setDeletePersonId(null);

      showToast(
        "success",
        "Team member deactivated."
      );
    } catch (requestError) {
      showToast(
        "error",
        requestError instanceof Error
          ? requestError.message
          : "Unable to deactivate person."
      );
    }
  };

  const togglePersonSkill = (
    skillId: number
  ) => {
    setPersonForm((current) => ({
      ...current,
      skillIds: current.skillIds.includes(
        skillId
      )
        ? current.skillIds.filter(
            (id) => id !== skillId
          )
        : [...current.skillIds, skillId],
    }));
  };

  const resetDepartmentForm = () => {
    setDepartmentForm({
      name: "",
      description: "",
    });
  };

  const openCreateDepartment = () => {
    setEditingDepartmentId(null);
    resetDepartmentForm();
    setShowDepartmentModal(true);
  };

  const openEditDepartment = (department: Department) => {
    setEditingDepartmentId(department.id);
    setDepartmentForm({
      name: department.name || "",
      description: department.description || "",
    });
    setShowDepartmentModal(true);
  };

  const saveDepartment = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!departmentForm.name.trim()) {
      showToast(
        "error",
        "Department name is required."
      );
      return;
    }

    const isEditing = editingDepartmentId !== null;

    try {
      setSaving(true);

      await apiRequest(
        isEditing
          ? `${DEPARTMENTS_URL}/${editingDepartmentId}`
          : DEPARTMENTS_URL,
        {
          method: isEditing ? "PUT" : "POST",
          body: JSON.stringify({
            name: departmentForm.name.trim(),
            description:
              departmentForm.description.trim() || null,
          }),
        }
      );

      resetDepartmentForm();
      setEditingDepartmentId(null);
      setShowDepartmentModal(false);
      await loadAllData();

      showToast(
        "success",
        isEditing
          ? "Department updated successfully."
          : "Department created successfully."
      );
    } catch (requestError) {
      showToast(
        "error",
        requestError instanceof Error
          ? requestError.message
          : isEditing
            ? "Unable to update department."
            : "Unable to create department."
      );
    } finally {
      setSaving(false);
    }
  };

  const resetSkillForm = () => {
    setSkillForm({
      name: "",
      description: "",
    });
  };

  const openCreateSkill = () => {
    setEditingSkillId(null);
    resetSkillForm();
    setShowSkillModal(true);
  };

  const openEditSkill = (skill: Skill) => {
    setEditingSkillId(skill.id);
    setSkillForm({
      name: skill.name || "",
      description: skill.description || "",
    });
    setShowSkillModal(true);
  };

  const createSkill = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!skillForm.name.trim()) {
      showToast("error", "Skill name is required.");
      return;
    }

    const isEditing = editingSkillId !== null;

    try {
      setSaving(true);

      await apiRequest(
        isEditing
          ? `${SKILLS_URL}/${editingSkillId}`
          : SKILLS_URL,
        {
          method: isEditing ? "PUT" : "POST",
          body: JSON.stringify({
            name: skillForm.name.trim(),
            description: skillForm.description.trim() || null,
          }),
        }
      );

      resetSkillForm();
      setEditingSkillId(null);
      setShowSkillModal(false);
      await loadAllData();

      showToast(
        "success",
        isEditing
          ? "Skill updated successfully."
          : "Skill created successfully."
      );
    } catch (requestError) {
      showToast(
        "error",
        requestError instanceof Error
          ? requestError.message
          : isEditing
            ? "Unable to update skill."
            : "Unable to create skill."
      );
    } finally {
      setSaving(false);
    }
  };

  const resetProjectForm = () => {
    setProjectForm({
      name: "",
      description: "",
      client: "",
      startDate: "",
      dueDate: "",
      status: "PLANNING",
      managerId: "",
      memberIds: [],
    });
    setEditingProjectId(null);
  };

  const openCreateProject = () => {
    resetProjectForm();
    setShowProjectModal(true);
  };

  const openEditProject = (project: Project) => {
    setEditingProjectId(project.id);
    setProjectForm({
      name: project.name || "",
      description: project.description || "",
      client: project.client || "",
      startDate: project.startDate
        ? project.startDate.slice(0, 10)
        : "",
      dueDate: project.dueDate
        ? project.dueDate.slice(0, 10)
        : "",
      status: project.status || "PLANNING",
      managerId: project.manager?.id
        ? String(project.manager.id)
        : "",
      memberIds: (project.members || [])
        .map((member) => member.person?.id)
        .filter((id): id is number =>
          typeof id === "number"
        ),
    });
    setShowProjectModal(true);
  };

  const toggleProjectMember = (personId: number) => {
    setProjectForm((current) => ({
      ...current,
      memberIds: current.memberIds.includes(personId)
        ? current.memberIds.filter((id) => id !== personId)
        : [...current.memberIds, personId],
    }));
  };

  const saveProject = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!projectForm.name.trim()) {
      showToast("error", "Project name is required.");
      return;
    }

    if (
      projectForm.startDate &&
      projectForm.dueDate &&
      projectForm.dueDate < projectForm.startDate
    ) {
      showToast("error", "Due date cannot be before the start date.");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        name: projectForm.name.trim(),
        description: projectForm.description.trim() || null,
        client: projectForm.client.trim() || null,
        startDate: projectForm.startDate || null,
        dueDate: projectForm.dueDate || null,
        status: projectForm.status,
        managerId: projectForm.managerId
          ? Number(projectForm.managerId)
          : null,
        memberIds: projectForm.memberIds,
      };

      const url = editingProjectId
        ? `${PROJECTS_URL}/${editingProjectId}`
        : PROJECTS_URL;

      const saved = await apiRequest<Project>(url, {
        method: editingProjectId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      if (editingProjectId) {
        setProjects((current) =>
          current.map((project) =>
            project.id === editingProjectId
              ? { ...project, ...saved }
              : project
          )
        );
      } else {
        setProjects((current) => [saved, ...current]);
      }

      setShowProjectModal(false);
      resetProjectForm();
      await loadAllData();
      showToast(
        "success",
        editingProjectId
          ? "Project updated successfully."
          : "Project created successfully."
      );
    } catch (requestError) {
      showToast(
        "error",
        requestError instanceof Error
          ? requestError.message
          : "Unable to save project."
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteProject = async () => {
    if (deleteProjectId === null) return;

    try {
      await apiRequest(
        `${PROJECTS_URL}/${deleteProjectId}`,
        { method: "DELETE" }
      );

      setProjects((current) =>
        current.filter((project) => project.id !== deleteProjectId)
      );
      setDeleteProjectId(null);
      showToast("success", "Project deleted successfully.");
    } catch (requestError) {
      showToast(
        "error",
        requestError instanceof Error
          ? requestError.message
          : "Unable to delete project."
      );
    }
  };

  const handleKanbanDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    const taskId = Number(String(active.id).replace("task-", ""));
    const nextStatus = String(over.id);

    if (!Number.isFinite(taskId) || !kanbanStatuses.includes(nextStatus)) {
      return;
    }

    const task = tasks.find((item) => item.id === taskId);
    if (!task || getStatus(task) === nextStatus) return;

    await moveTask(task, nextStatus);
  };

  const resetTaskForm = () => {
    setEditingTaskId(null);
    setTaskForm({
      title: "",
      description: "",
      priority: "MEDIUM",
      status: "TODO",
      projectId: "",
      departmentId: "",
      taskType: "",
      startDate: "",
      dueDate: "",
      estimatedHours: "",
      actualHours: "",
      labels: "",
      skillIds: [],
      assigneeIds: [],
    });
  };

  const toggleTaskSkill = (skillId: number) => {
    setTaskForm((current) => ({
      ...current,
      skillIds: current.skillIds.includes(skillId)
        ? current.skillIds.filter((id) => id !== skillId)
        : [...current.skillIds, skillId],
    }));
  };

  const toggleTaskAssignee = (personId: number) => {
    setTaskForm((current) => ({
      ...current,
      assigneeIds: current.assigneeIds.includes(personId)
        ? current.assigneeIds.filter((id) => id !== personId)
        : [...current.assigneeIds, personId],
    }));
  };

  const openEditTask = async (task: Task) => {
    try {
      setSaving(true);

      // Fetch the full task so the edit form always reflects the latest
      // project, department, skills and assignees from the backend.
      const fullTask = await apiRequest<Task>(
        `${TASKS_URL}/${task.id}`
      );

      const taskData = fullTask || task;
      const taskSkills = Array.isArray(taskData.skills)
        ? taskData.skills
            .map((item) => {
              if ("skill" in item) return item.skill?.id;
              return (item as Skill).id;
            })
            .filter((id): id is number => typeof id === "number")
        : [];

      const taskAssignees = Array.isArray(taskData.assignees)
        ? taskData.assignees
            .map((item) => item.person?.id ?? item.user?.id)
            .filter((id): id is number => typeof id === "number")
        : taskData.assignedTo?.id
          ? [taskData.assignedTo.id]
          : [];

      setEditingTaskId(taskData.id);
      setTaskForm({
        title: taskData.title || "",
        description: taskData.description || "",
        priority: taskData.priority || "MEDIUM",
        status: getStatus(taskData),
        projectId: taskData.project?.id ? String(taskData.project.id) : "",
        departmentId: taskData.department?.id ? String(taskData.department.id) : "",
        taskType: taskData.taskType || "",
        startDate: taskData.startDate ? taskData.startDate.slice(0, 10) : "",
        dueDate: taskData.dueDate ? taskData.dueDate.slice(0, 10) : "",
        estimatedHours:
          taskData.estimatedHours === null || taskData.estimatedHours === undefined
            ? ""
            : String(taskData.estimatedHours),
        actualHours:
          taskData.actualHours === null || taskData.actualHours === undefined
            ? ""
            : String(taskData.actualHours),
        labels: taskData.labels || "",
        skillIds: taskSkills,
        assigneeIds: taskAssignees,
      });

      setShowTaskModal(true);
    } catch (requestError) {
      showToast(
        "error",
        requestError instanceof Error
          ? requestError.message
          : "Unable to load task details."
      );
    } finally {
      setSaving(false);
    }
  };

  const openTaskDetails = async (task: Task) => {
    try {
      setLoadingTaskDetails(true);
      const fullTask = await apiRequest<Task>(
        `${TASKS_URL}/${task.id}`
      );
      setSelectedTask(fullTask || task);
    } catch (requestError) {
      showToast(
        "error",
        requestError instanceof Error
          ? requestError.message
          : "Unable to load task details."
      );
      setSelectedTask(task);
    } finally {
      setLoadingTaskDetails(false);
    }
  };

  const saveTask = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (editingTaskId === null) return;

    if (!taskForm.title.trim()) {
      showToast("error", "Task title is required.");
      return;
    }

    if (
      taskForm.startDate &&
      taskForm.dueDate &&
      taskForm.dueDate < taskForm.startDate
    ) {
      showToast(
        "error",
        "Due date cannot be earlier than the start date."
      );
      return;
    }

    try {
      setSaving(true);

      const toNumberOrNull = (value: string) => {
        if (!value.trim()) return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };

      await apiRequest<Task>(
        `${TASKS_URL}/${editingTaskId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            title: taskForm.title.trim(),
            description: taskForm.description.trim() || null,
            priority: taskForm.priority,
            status: taskForm.status,
            completed: taskForm.status === "COMPLETED",
            projectId: taskForm.projectId ? Number(taskForm.projectId) : null,
            departmentId: taskForm.departmentId ? Number(taskForm.departmentId) : null,
            taskType: taskForm.taskType.trim() || null,
            startDate: taskForm.startDate
              ? new Date(`${taskForm.startDate}T00:00:00`).toISOString()
              : null,
            dueDate: taskForm.dueDate
              ? new Date(`${taskForm.dueDate}T00:00:00`).toISOString()
              : null,
            estimatedHours: toNumberOrNull(taskForm.estimatedHours),
            actualHours: toNumberOrNull(taskForm.actualHours),
            labels: taskForm.labels.trim() || null,
            skillIds: taskForm.skillIds,
            assigneeIds: taskForm.assigneeIds,
          }),
        }
      );

      setShowTaskModal(false);
      resetTaskForm();
      await loadAllData();
      showToast("success", "Task updated successfully.");
    } catch (requestError) {
      showToast(
        "error",
        requestError instanceof Error
          ? requestError.message
          : "Unable to update task."
      );
    } finally {
      setSaving(false);
    }
  };

  const createTask = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!taskForm.title.trim()) {
      showToast(
        "error",
        "Task title is required."
      );
      return;
    }

    if (
      taskForm.startDate &&
      taskForm.dueDate &&
      taskForm.dueDate < taskForm.startDate
    ) {
      showToast(
        "error",
        "Due date cannot be earlier than the start date."
      );
      return;
    }

    try {
      setSaving(true);

      const toNumberOrNull = (value: string) => {
        if (!value.trim()) return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };

      await apiRequest(
        TASKS_URL,
        {
          method: "POST",
          body: JSON.stringify({
            title: taskForm.title.trim(),
            description:
              taskForm.description.trim() || null,
            priority: taskForm.priority,
            status: taskForm.status,
            completed: taskForm.status === "COMPLETED",
            projectId: taskForm.projectId
              ? Number(taskForm.projectId)
              : null,
            departmentId: taskForm.departmentId
              ? Number(taskForm.departmentId)
              : null,
            taskType: taskForm.taskType.trim() || null,
            startDate: taskForm.startDate
              ? new Date(`${taskForm.startDate}T00:00:00`).toISOString()
              : null,
            dueDate: taskForm.dueDate
              ? new Date(`${taskForm.dueDate}T00:00:00`).toISOString()
              : null,
            estimatedHours: toNumberOrNull(taskForm.estimatedHours),
            actualHours: toNumberOrNull(taskForm.actualHours),
            labels: taskForm.labels.trim() || null,
            skillIds: taskForm.skillIds,
            assigneeIds: taskForm.assigneeIds,
          }),
        }
      );

      resetTaskForm();
      setShowTaskModal(false);

      await loadAllData();

      showToast(
        "success",
        "Task created successfully."
      );
    } catch (requestError) {
      showToast(
        "error",
        requestError instanceof Error
          ? requestError.message
          : "Unable to create task."
      );
    } finally {
      setSaving(false);
    }
  };

  const extractAiText = (
    payload: unknown
  ): string => {
    if (!payload) return "";

    if (typeof payload === "string") {
      return payload.trim();
    }

    if (Array.isArray(payload)) {
      return payload
        .map((item) => extractAiText(item))
        .filter(Boolean)
        .join("\n");
    }

    if (
      typeof payload === "object"
    ) {
      const data =
        payload as Record<string, unknown>;

      const directKeys = [
        "reply",
        "message",
        "content",
        "text",
        "response",
      ];

      for (const key of directKeys) {
        const value = data[key];

        if (typeof value === "string") {
          return value.trim();
        }
      }

      if (data.data) {
        const nested = extractAiText(
          data.data
        );

        if (nested) return nested;
      }

      if (data.result) {
        const nested = extractAiText(
          data.result
        );

        if (nested) return nested;
      }

      if (data.output) {
        const nested = extractAiText(
          data.output
        );

        if (nested) return nested;
      }
    }

    return "";
  };

  const parseAiResponse = (
    responseText: string,
    contentType: string
  ) => {
    if (!responseText.trim()) {
      return "";
    }

    if (
      contentType.includes("application/json")
    ) {
      try {
        const json = JSON.parse(
          responseText
        );

        return extractAiText(json);
      } catch {
        return responseText.trim();
      }
    }

    const lines = responseText.split(/\r?\n/);
    let output = "";

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) continue;

      let value = trimmed;

      if (value.startsWith("data:")) {
        value = value
          .replace(/^data:\s*/, "")
          .trim();
      }

      if (!value || value === "[DONE]") {
        continue;
      }

      try {
        const json = JSON.parse(value);

        const eventType =
          typeof json?.type === "string"
            ? json.type
            : "";

        if (
          [
            "started",
            "planning",
            "completed",
            "done",
            "thinking",
          ].includes(eventType)
        ) {
          continue;
        }

        const text = extractAiText(json);

        if (text) {
          output +=
            `${output ? "\n" : ""}${text}`;
        }
      } catch {
        output +=
          `${output ? "\n" : ""}${value}`;
      }
    }

    return output.trim() || responseText.trim();
  };

  const performAiRequest = async (
    message: string
  ) => {
    const conversationId =
      aiConversationId || "default";

    const requestBody = JSON.stringify({
      message,
      prompt: message,
      conversationId,
    });

    let response = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept:
          "application/json, text/event-stream",
        "x-conversation-id": conversationId,
      },
      body: requestBody,
    });

    /*
     * Some versions of the backend use /api/ai
     * while the project requirement uses /api/ai/chat.
     * Only fall back when the chat route does not exist.
     */
    if (
      response.status === 404 &&
      AI_URL !== AI_FALLBACK_URL
    ) {
      response = await fetch(
        AI_FALLBACK_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept:
              "application/json, text/event-stream",
          },
          body: requestBody,
        }
      );
    }

    const contentType =
      response.headers.get(
        "content-type"
      ) || "";

    const responseText =
      await response.text();

    if (!response.ok) {
      let backendMessage = "";

      try {
        const parsed = JSON.parse(
          responseText
        );

        backendMessage =
          extractAiText(parsed);
      } catch {
        backendMessage =
          responseText.trim();
      }

      throw new Error(
        backendMessage ||
          `AI request failed with status ${response.status}`
      );
    }

    const result = parseAiResponse(
      responseText,
      contentType
    );

    return result;
  };

  const sendAIMessage = async (
    event?: FormEvent<HTMLFormElement>,
    directMessage?: string
  ) => {
    event?.preventDefault();

    const message = (
      directMessage ?? aiInput
    ).trim();

    if (!message || aiLoading) {
      return;
    }

    setAiInput("");

    setAiMessages((current) => [
      ...current,
      {
        role: "user",
        content: message,
      },
    ]);

    setAiLoading(true);

    try {
      const result =
        await performAiRequest(message);

      setAiMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            result ||
            "The AI completed the request but did not return a visible response.",
        },
      ]);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "AI request failed.";

      setAiMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `Sorry, I couldn't complete that request: ${message}`,
        },
      ]);

      showToast(
        "error",
        "AI request failed. Check the backend and Cloud AI configuration."
      );
    } finally {
      setAiLoading(false);
    }
  };

  const clearAIChat = () => {
    if (aiLoading) {
      return;
    }

    setAiMessages([]);
    setAiInput("");
  };

  const quickAiAction = (
    prompt: string
  ) => {
    setActiveTab("ai");
    setAiInput(prompt);

    window.setTimeout(() => {
      void sendAIMessage(
        undefined,
        prompt
      );
    }, 50);
  };

  const openTasksTab = () => {
    setActiveTab("tasks");
  };

  const openPeopleTab = () => {
    setActiveTab("people");
  };

  const openPersonDetails = (person: Person) => {
    setSelectedPerson(person);
  };

  const openProjectDetails = (project: Project) => {
    setSelectedProject(project);
  };

  const resetTaskFilters = () => {
    setTaskSearch("");
    setTaskStatus("ALL");
    setTaskPriority("ALL");
    setTaskProject("ALL");
    setTaskDepartment("ALL");
    setTaskAssignee("ALL");
    setTaskDue("ALL");
  };

  const resetPeopleFilters = () => {
    setPeopleSearch("");
    setPeopleAvailability("ALL");
    setPeopleDepartment("ALL");
    setPeopleSkill("ALL");
    setPeopleRole("");
    setPeopleMinExperience("ALL");
    setPeopleWorkload("ALL");
  };

  return (
    <>
      <style jsx global>{`
        .form-input,
        .form-select,
        .form-textarea {
          width: 100%;
          border-radius: 0.875rem;
          border: 1px solid rgb(226 232 240);
          background: white;
          color: rgb(15 23 42);
          padding: 0.75rem 0.875rem;
          outline: none;
          transition: all 0.2s ease;
        }

        .form-input:focus,
        .form-select:focus,
        .form-textarea:focus {
          border-color: rgb(99 102 241);
          box-shadow: 0 0 0 3px rgb(99 102 241 / 0.12);
        }

        .form-textarea {
          min-height: 110px;
          resize: vertical;
        }

        .field-label {
          display: block;
          margin-bottom: 0.45rem;
          font-size: 0.78rem;
          font-weight: 700;
          color: rgb(51 65 85);
        }

        .section-title {
          font-size: 0.95rem;
          font-weight: 800;
          letter-spacing: -0.01em;
        }

        .dark .form-input,
        .dark .form-select,
        .dark .form-textarea {
          border-color: rgb(51 65 85);
          background: rgb(15 23 42);
          color: rgb(241 245 249);
        }

        .dark .field-label {
          color: rgb(203 213 225);
        }

        .scrollbar-thin {
          scrollbar-width: thin;
          scrollbar-color: rgb(148 163 184) transparent;
        }

        .gradient-border {
          position: relative;
          isolation: isolate;
        }

        .gradient-border::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(
            135deg,
            rgb(99 102 241 / 0.6),
            rgb(168 85 247 / 0.4),
            rgb(14 165 233 / 0.3)
          );
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
          z-index: -1;
        }
      `}</style>

      <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
        {/* TOASTS */}

        <div className="fixed right-4 top-4 z-[120] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-3">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={cn(
                "rounded-2xl border px-4 py-3 shadow-xl backdrop-blur",
                toast.type === "success"
                  ? "border-emerald-200 bg-white/95 text-emerald-700 dark:border-emerald-900 dark:bg-slate-900/95 dark:text-emerald-300"
                  : "border-red-200 bg-white/95 text-red-700 dark:border-red-900 dark:bg-slate-900/95 dark:text-red-300"
              )}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg">
                  {toast.type === "success"
                    ? "✓"
                    : "⚠"}
                </span>

                <p className="text-sm font-medium">
                  {toast.message}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* HEADER */}

        <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 text-lg text-white shadow-lg shadow-indigo-500/20">
                ✨
              </div>

              <div className="min-w-0">
                <h1 className="truncate text-base font-extrabold tracking-tight sm:text-lg">
                  AI Task Bot
                </h1>

                <p className="hidden text-[11px] font-medium text-slate-500 sm:block dark:text-slate-400">
                  Intelligent team & task management
                </p>
              </div>
            </div>

            <div className="hidden min-w-0 flex-1 justify-center px-6 md:flex">
              <div className="relative w-full max-w-xl">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">⌕</span>
                <input
                  value={globalSearch}
                  onChange={(event) => {
                    setGlobalSearch(event.target.value);
                    setShowGlobalSearch(Boolean(event.target.value.trim()));
                  }}
                  onFocus={() => setShowGlobalSearch(Boolean(globalSearch.trim()))}
                  className="form-input pl-9 pr-4"
                  placeholder="Search people, tasks, projects, skills..."
                  aria-label="Global search"
                />
                {showGlobalSearch && globalSearch.trim() && (
                  <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[70] max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                    {globalSearchResults.people.length > 0 && (
                      <div className="p-2">
                        <p className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">People</p>
                        {globalSearchResults.people.map((item) => (
                          <button key={`person-${item.id}`} type="button" onClick={() => { openPersonDetails(item); setActiveTab("people"); setShowGlobalSearch(false); }} className="flex w-full rounded-xl px-3 py-2 text-left text-xs font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-950/50">{item.fullName}</button>
                        ))}
                      </div>
                    )}
                    {globalSearchResults.tasks.length > 0 && (
                      <div className="p-2">
                        <p className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Tasks</p>
                        {globalSearchResults.tasks.map((item) => (
                          <button key={`task-${item.id}`} type="button" onClick={() => { void openTaskDetails(item); setShowGlobalSearch(false); }} className="flex w-full rounded-xl px-3 py-2 text-left text-xs font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-950/50">#{item.id} — {item.title}</button>
                        ))}
                      </div>
                    )}
                    {globalSearchResults.projects.length > 0 && (
                      <div className="p-2">
                        <p className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Projects</p>
                        {globalSearchResults.projects.map((item) => (
                          <button key={`project-${item.id}`} type="button" onClick={() => { openProjectDetails(item); setActiveTab("projects"); setShowGlobalSearch(false); }} className="flex w-full rounded-xl px-3 py-2 text-left text-xs font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-950/50">{item.name}</button>
                        ))}
                      </div>
                    )}
                    {globalSearchResults.skills.length > 0 && (
                      <div className="p-2">
                        <p className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Skills</p>
                        {globalSearchResults.skills.map((item) => (
                          <button key={`skill-${item.id}`} type="button" onClick={() => { setActiveTab("skills"); setShowGlobalSearch(false); }} className="flex w-full rounded-xl px-3 py-2 text-left text-xs font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-950/50">{item.name}</button>
                        ))}
                      </div>
                    )}
                    {globalSearchResults.departments.length > 0 && (
                      <div className="p-2">
                        <p className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Departments</p>
                        {globalSearchResults.departments.map((item) => (
                          <button key={`department-${item.id}`} type="button" onClick={() => { setActiveTab("departments"); setShowGlobalSearch(false); }} className="flex w-full rounded-xl px-3 py-2 text-left text-xs font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-950/50">{item.name}</button>
                        ))}
                      </div>
                    )}
                    {globalSearchResults.people.length === 0 &&
                      globalSearchResults.tasks.length === 0 &&
                      globalSearchResults.projects.length === 0 &&
                      globalSearchResults.skills.length === 0 &&
                      globalSearchResults.departments.length === 0 && (
                      <p className="p-4 text-center text-xs text-slate-400">No matching records.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  quickAiAction(
                    "Analyze our current team workload and tell me who is overloaded."
                  )
                }
                className="hidden rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 sm:block dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-300"
              >
                ✨ Ask AI
              </button>

              <button
                type="button"
                onClick={() =>
                  setTheme((current) =>
                    current === "dark"
                      ? "light"
                      : "dark"
                  )
                }
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                aria-label="Toggle theme"
              >
                {themeHydrated
                  ? theme === "dark"
                    ? "☀️"
                    : "🌙"
                  : "🌙"}
              </button>
            </div>
          </div>
        </header>

        <div className="flex min-h-[calc(100vh-4rem)]">
          {/* SIDEBAR */}

          <aside className="hidden w-64 flex-shrink-0 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 lg:block">
            <div className="sticky top-20">
              <p className="mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
                Workspace
              </p>

              <nav className="space-y-1">
                {navigation.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      setActiveTab(item.id)
                    }
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                      activeTab === item.id
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                    )}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/5 text-base dark:bg-white/5">
                      {item.icon}
                    </span>

                    {item.label}
                  </button>
                ))}
              </nav>

              <div className="mt-6 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-purple-50 p-4 dark:border-indigo-950 dark:from-indigo-950/40 dark:to-purple-950/30">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
                  ✨
                </div>

                <h3 className="mt-3 text-sm font-bold">
                  AI Project Manager
                </h3>

                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Ask about your team, tasks,
                  skills, availability and
                  assignments.
                </p>

                <button
                  type="button"
                  onClick={() =>
                    setActiveTab("ai")
                  }
                  className="mt-3 text-xs font-bold text-indigo-600 dark:text-indigo-400"
                >
                  Open assistant →
                </button>
              </div>
            </div>
          </aside>

          {/* MOBILE NAV */}

          <div className="fixed bottom-3 left-3 right-3 z-50 flex overflow-x-auto rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-2xl backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
            {navigation.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  setActiveTab(item.id)
                }
                className={cn(
                  "flex min-w-[72px] flex-1 flex-col items-center justify-center rounded-xl px-2 py-2 text-[10px] font-bold transition",
                  activeTab === item.id
                    ? "bg-indigo-600 text-white"
                    : "text-slate-500 dark:text-slate-400"
                )}
              >
                <span className="text-base">
                  {item.icon}
                </span>

                <span className="mt-0.5 whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            ))}
          </div>

          {/* MAIN */}

          <main className="min-w-0 flex-1 p-4 pb-24 sm:p-6 lg:p-8 lg:pb-8">
            {loading ? (
              <div className="flex min-h-[70vh] items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-indigo-100 text-2xl dark:bg-indigo-950">
                    ✨
                  </div>

                  <p className="mt-4 text-sm font-semibold text-slate-600 dark:text-slate-300">
                    Loading your workspace...
                  </p>
                </div>
              </div>
            ) : error ? (
              <div className="mx-auto mt-10 max-w-xl rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm dark:border-red-950 dark:bg-slate-900">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-2xl dark:bg-red-950">
                  ⚠️
                </div>

                <h2 className="mt-4 text-xl font-bold">
                  Unable to load workspace
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {error}
                </p>

                <button
                  type="button"
                  onClick={loadAllData}
                  className="mt-5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <>
                {/* OVERVIEW */}

                {activeTab === "overview" && (
                  <section className="space-y-6">
                    <div className="gradient-border relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-6 text-white shadow-2xl shadow-indigo-900/10 sm:p-8">
                      <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
                      <div className="absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-purple-300/10 blur-3xl" />

                      <div className="relative max-w-3xl">
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold backdrop-blur">
                          <span>✨</span>
                          AI-powered project workspace
                        </div>

                        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
                          Manage your team
                          <br />
                          with intelligence.
                        </h2>

                        <p className="mt-4 max-w-2xl text-sm leading-6 text-indigo-100 sm:text-base">
                          Manage people, skills and
                          tasks while your AI
                          assistant helps you make
                          better project-management
                          decisions.
                        </p>

                        <div className="mt-6 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setShowTaskModal(
                                true
                              )
                            }
                            className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-indigo-700 shadow-lg transition hover:-translate-y-0.5"
                          >
                            + Create Task
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              quickAiAction(
                                "Who is currently available on our team?"
                              )
                            }
                            className="rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/15"
                          >
                            ✨ Ask AI
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* STATS */}

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                      <StatCard
                        icon="📋"
                        label="Total Tasks"
                        value={tasks.length}
                        hint="All workspace tasks"
                        onClick={openTasksTab}
                      />

                      <StatCard
                        icon="⚡"
                        label="Active Tasks"
                        value={activeTasks}
                        hint="Currently in progress"
                        onClick={openTasksTab}
                      />

                      <StatCard
                        icon="✓"
                        label="Completed"
                        value={completedTasks}
                        hint={`${completionRate}% completion rate`}
                        onClick={openTasksTab}
                      />

                      <StatCard
                        icon="👥"
                        label="Team Members"
                        value={people.length}
                        hint={`${availablePeople} available`}
                        onClick={openPeopleTab}
                      />

                      <StatCard
                        icon="🚨"
                        label="Urgent"
                        value={urgentTasks}
                        hint="Needs attention"
                        onClick={openTasksTab}
                      />
                    </div>

                    {/* STATUS + TEAM */}

                    <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
                      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                              Work overview
                            </p>

                            <h3 className="mt-1 text-xl font-bold">
                              Task pipeline
                            </h3>
                          </div>

                          <button
                            type="button"
                            onClick={
                              openTasksTab
                            }
                            className="text-xs font-bold text-indigo-600 dark:text-indigo-400"
                          >
                            View all →
                          </button>
                        </div>

                        <div className="mt-6 space-y-4">
                          {kanbanStatuses.map(
                            (status) => {
                              const count =
                                taskStatusCounts[
                                  status
                                ] || 0;

                              const percentage =
                                tasks.length
                                  ? Math.round(
                                      (count /
                                        tasks.length) *
                                        100
                                    )
                                  : 0;

                              return (
                                <div
                                  key={status}
                                >
                                  <div className="mb-2 flex items-center justify-between text-xs">
                                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                                      {
                                        statusLabels[
                                          status
                                        ]
                                      }
                                    </span>

                                    <span className="font-bold text-slate-500 dark:text-slate-400">
                                      {count}
                                    </span>
                                  </div>

                                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                                      style={{
                                        width: `${Math.max(
                                          percentage,
                                          count
                                            ? 4
                                            : 0
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            }
                          )}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                              Team capacity
                            </p>

                            <h3 className="mt-1 text-xl font-bold">
                              Availability
                            </h3>
                          </div>

                          <button
                            type="button"
                            onClick={
                              openPeopleTab
                            }
                            className="text-xs font-bold text-indigo-600 dark:text-indigo-400"
                          >
                            Manage →
                          </button>
                        </div>

                        <div className="mt-6 flex items-center gap-5">
                          <div
                            className="relative flex h-28 w-28 flex-shrink-0 items-center justify-center rounded-full"
                            style={{
                              background: `conic-gradient(rgb(16 185 129) ${
                                people.length
                                  ? (availablePeople /
                                      people.length) *
                                    100
                                  : 0
                              }%, rgb(226 232 240) 0)`,
                            }}
                          >
                            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white dark:bg-slate-900">
                              <div className="text-center">
                                <p className="text-xl font-black">
                                  {people.length
                                    ? Math.round(
                                        (availablePeople /
                                          people.length) *
                                          100
                                      )
                                    : 0}
                                  %
                                </p>
                                <p className="text-[10px] font-semibold text-slate-400">
                                  available
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="min-w-0 flex-1 space-y-3">
                            <CapacityRow
                              label="Available"
                              value={
                                availablePeople
                              }
                            />

                            <CapacityRow
                              label="Partially Available"
                              value={
                                partiallyAvailablePeople
                              }
                            />

                            <CapacityRow
                              label="Busy"
                              value={busyPeople}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* RECENT TASKS + TEAM */}

                    <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
                      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800 sm:p-6">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                              Latest work
                            </p>

                            <h3 className="mt-1 text-lg font-bold">
                              Recent Tasks
                            </h3>
                          </div>

                          <button
                            type="button"
                            onClick={
                              openTasksTab
                            }
                            className="text-xs font-bold text-indigo-600 dark:text-indigo-400"
                          >
                            See all
                          </button>
                        </div>

                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {tasks
                            .slice(0, 6)
                            .map((task) => {
                              const status =
                                getStatus(task);
                              const priority =
                                getPriority(
                                  task
                                );

                              return (
                                <div
                                  key={task.id}
                                  className="flex items-center gap-3 p-4 sm:p-5"
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleTask(
                                        task
                                      )
                                    }
                                    className={cn(
                                      "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border text-sm transition",
                                      task.completed
                                        ? "border-emerald-500 bg-emerald-500 text-white"
                                        : "border-slate-200 hover:border-indigo-400 dark:border-slate-700"
                                    )}
                                  >
                                    {task.completed
                                      ? "✓"
                                      : ""}
                                  </button>

                                  <div className="min-w-0 flex-1">
                                    <h4
                                      className={cn(
                                        "truncate text-sm font-bold",
                                        task.completed &&
                                          "text-slate-400 line-through"
                                      )}
                                    >
                                      {task.title}
                                    </h4>

                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                      <span className="text-[11px] font-medium text-slate-400">
                                        #{task.id}
                                      </span>

                                      <span className="text-[11px] text-slate-400">
                                        •
                                      </span>

                                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                        {
                                          statusLabels[
                                            status
                                          ]
                                        }
                                      </span>
                                    </div>
                                  </div>

                                  <span
                                    className={cn(
                                      "hidden rounded-full px-2.5 py-1 text-[10px] font-bold sm:inline-flex",
                                      priority ===
                                        "URGENT"
                                        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                        : priority ===
                                          "HIGH"
                                        ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                                        : priority ===
                                          "LOW"
                                        ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                        : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                    )}
                                  >
                                    {
                                      priorityLabels[
                                        priority
                                      ]
                                    }
                                  </span>
                                </div>
                              );
                            })}

                          {tasks.length === 0 && (
                            <div className="p-5">
                              <EmptyState
                                icon="📋"
                                title="No tasks yet"
                                description="Create your first task to start managing your project."
                                buttonLabel="Create Task"
                                onClick={() =>
                                  setShowTaskModal(
                                    true
                                  )
                                }
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="border-b border-slate-100 p-5 dark:border-slate-800 sm:p-6">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            People
                          </p>

                          <h3 className="mt-1 text-lg font-bold">
                            Team Overview
                          </h3>
                        </div>

                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {people
                            .slice(0, 6)
                            .map((person) => (
                              <div
                                key={person.id}
                                className="flex items-center gap-3 p-4 sm:p-5"
                              >
                                {person.profileImage ? (
                                  <Image
                                    src={
                                      person.profileImage
                                    }
                                    alt={
                                      person.fullName
                                    }
                                    width={44}
                                    height={44}
                                    unoptimized
                                    className="h-11 w-11 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                    {getInitials(
                                      person.fullName
                                    )}
                                  </div>
                                )}

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-bold">
                                    {
                                      person.fullName
                                    }
                                  </p>

                                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                    {person.jobTitle ||
                                      person.role ||
                                      "Team member"}
                                    {person.department
                                      ? ` · ${person.department.name}`
                                      : ""}
                                  </p>
                                </div>

                                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                  {availabilityLabels[
                                    person
                                      .availability ||
                                      ""
                                  ] ||
                                    person.availability ||
                                    "Available"}
                                </span>
                              </div>
                            ))}

                          {people.length === 0 && (
                            <div className="p-5">
                              <EmptyState
                                icon="👥"
                                title="No team members"
                                description="Add people to build your team."
                                buttonLabel="Add Person"
                                onClick={() =>
                                  setShowPersonModal(
                                    true
                                  )
                                }
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* PROJECT + PRIORITY ANALYTICS */}

                    <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
                      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                              Project health
                            </p>
                            <h3 className="mt-1 text-xl font-bold">
                              Project progress
                            </h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab("projects")}
                            className="text-xs font-bold text-indigo-600 dark:text-indigo-400"
                          >
                            View projects →
                          </button>
                        </div>

                        <div className="mt-5 grid grid-cols-3 gap-3">
                          <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Total
                            </p>
                            <p className="mt-1 text-2xl font-black">{projects.length}</p>
                          </div>
                          <div className="rounded-2xl bg-emerald-50 p-3 dark:bg-emerald-950/30">
                            <p className="text-xs text-emerald-600 dark:text-emerald-400">
                              Active
                            </p>
                            <p className="mt-1 text-2xl font-black">{activeProjects}</p>
                          </div>
                          <div className="rounded-2xl bg-blue-50 p-3 dark:bg-blue-950/30">
                            <p className="text-xs text-blue-600 dark:text-blue-400">
                              Completed
                            </p>
                            <p className="mt-1 text-2xl font-black">{completedProjects}</p>
                          </div>
                        </div>

                        <div className="mt-5 space-y-4">
                          {projectProgress.map(({ project, total, completed, percentage }) => (
                            <div key={project.id}>
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <span className="truncate text-sm font-semibold">{project.name}</span>
                                <span className="flex-shrink-0 text-xs font-bold text-slate-500 dark:text-slate-400">
                                  {completed}/{total} · {percentage}%
                                </span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          ))}
                          {projectProgress.length === 0 && (
                            <p className="py-4 text-sm text-slate-500 dark:text-slate-400">
                              No projects with tasks yet.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                            Risk & urgency
                          </p>
                          <h3 className="mt-1 text-xl font-bold">
                            Tasks by priority
                          </h3>
                        </div>

                        <div className="mt-6 space-y-4">
                          {[
                            ["URGENT", "Urgent", "bg-red-500"],
                            ["HIGH", "High", "bg-orange-500"],
                            ["MEDIUM", "Medium", "bg-blue-500"],
                            ["LOW", "Low", "bg-slate-400"],
                          ].map(([key, label, barClass]) => {
                            const count = priorityCounts[key] || 0;
                            const percentage = tasks.length
                              ? Math.round((count / tasks.length) * 100)
                              : 0;
                            return (
                              <div key={key}>
                                <div className="mb-2 flex items-center justify-between text-xs">
                                  <span className="font-semibold">{label}</span>
                                  <span className="font-bold text-slate-500 dark:text-slate-400">{count}</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                  <div
                                    className={`h-full rounded-full ${barClass}`}
                                    style={{ width: `${Math.max(percentage, count ? 4 : 0)}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-4 dark:border-red-950 dark:bg-red-950/30">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-red-700 dark:text-red-300">
                                {overdueTasks} overdue task{overdueTasks === 1 ? "" : "s"}
                              </p>
                              <p className="mt-1 text-xs text-red-600/80 dark:text-red-400/80">
                                Review deadlines that need attention.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={openTasksTab}
                              className="rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700"
                            >
                              Review
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* WORKLOAD */}

                    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800 sm:p-6">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                            Team workload
                          </p>
                          <h3 className="mt-1 text-lg font-bold">
                            Active assignments
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={openPeopleTab}
                          className="text-xs font-bold text-indigo-600 dark:text-indigo-400"
                        >
                          Manage team →
                        </button>
                      </div>

                      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">
                        {teamWorkload.map(({ person, assigned }) => (
                          <div key={person.id} className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                              {person.profileImage ? (
                                <Image
                                  src={person.profileImage}
                                  alt={person.fullName}
                                  width={40}
                                  height={40}
                                  unoptimized
                                  className="h-10 w-10 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                  {getInitials(person.fullName)}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold">{person.fullName}</p>
                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                  {person.jobTitle || person.role || "Team member"}
                                </p>
                              </div>
                              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                {assigned}
                              </span>
                            </div>
                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                              <div
                                className="h-full rounded-full bg-indigo-500"
                                style={{ width: `${Math.min(assigned * 20, 100)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                        {teamWorkload.length === 0 && (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Add team members to see workload.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* INSIGHTS */}

                    <div className="grid gap-4 sm:grid-cols-3">
                      <InfoCard
                        icon="🏢"
                        title="Departments"
                        value={
                          departments.length
                        }
                        description="Organizational groups"
                        onClick={() =>
                          setActiveTab(
                            "departments"
                          )
                        }
                      />

                      <InfoCard
                        icon="🧩"
                        title="Skills"
                        value={skills.length}
                        description="Reusable capabilities"
                        onClick={() =>
                          setActiveTab("skills")
                        }
                      />

                      <InfoCard
                        icon="🚨"
                        title="Overdue"
                        value={overdueTasks}
                        description="Tasks needing attention"
                        onClick={openTasksTab}
                      />
                    </div>
                  </section>
                )}

                {/* PEOPLE */}

                {activeTab === "people" && (
                  <section className="space-y-6">
                    <PageHeader
                      eyebrow="People Management"
                      title="Team Members"
                      description="Manage people, skills, availability and workload."
                      actionLabel="+ Add Person"
                      onAction={openCreatePerson}
                    />

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <MiniStat
                        label="Total Members"
                        value={
                          people.length
                        }
                        icon="👥"
                      />

                      <MiniStat
                        label="Available"
                        value={
                          availablePeople
                        }
                        icon="🟢"
                      />

                      <MiniStat
                        label="Partially Available"
                        value={
                          partiallyAvailablePeople
                        }
                        icon="🟡"
                      />

                      <MiniStat
                        label="Busy"
                        value={busyPeople}
                        icon="🔴"
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <input
                        className="form-input"
                        placeholder="Search people..."
                        value={
                          peopleSearch
                        }
                        onChange={(event) =>
                          setPeopleSearch(
                            event.target.value
                          )
                        }
                      />

                      <select
                        className="form-select"
                        value={
                          peopleDepartment
                        }
                        onChange={(event) =>
                          setPeopleDepartment(
                            event.target
                              .value
                          )
                        }
                      >
                        <option value="ALL">
                          All departments
                        </option>

                        {departments.map(
                          (department) => (
                            <option
                              key={
                                department.id
                              }
                              value={
                                department.id
                              }
                            >
                              {
                                department.name
                              }
                            </option>
                          )
                        )}
                      </select>

                      <select
                        className="form-select"
                        value={
                          peopleAvailability
                        }
                        onChange={(event) =>
                          setPeopleAvailability(
                            event.target
                              .value
                          )
                        }
                      >
                        <option value="ALL">
                          All availability
                        </option>

                        {Object.entries(
                          availabilityLabels
                        ).map(
                          ([
                            value,
                            label,
                          ]) => (
                            <option
                              key={value}
                              value={value}
                            >
                              {label}
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <input
                        className="form-input"
                        value={peopleRole}
                        onChange={(event) => setPeopleRole(event.target.value)}
                        placeholder="Filter by role / job title..."
                      />

                      <select className="form-select" value={peopleSkill} onChange={(event) => setPeopleSkill(event.target.value)}>
                        <option value="ALL">All skills</option>
                        {skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
                      </select>

                      <select className="form-select" value={peopleMinExperience} onChange={(event) => setPeopleMinExperience(event.target.value)}>
                        <option value="ALL">Any experience</option>
                        <option value="1">1+ years</option>
                        <option value="2">2+ years</option>
                        <option value="3">3+ years</option>
                        <option value="5">5+ years</option>
                        <option value="10">10+ years</option>
                      </select>

                      <div className="flex gap-2">
                        <select className="form-select" value={peopleWorkload} onChange={(event) => setPeopleWorkload(event.target.value)}>
                          <option value="ALL">Any workload</option>
                          <option value="LIGHT">Light (0–2)</option>
                          <option value="MEDIUM">Medium (3–5)</option>
                          <option value="HIGH">High (6+)</option>
                        </select>
                        <button type="button" onClick={resetPeopleFilters} className="shrink-0 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Reset</button>
                      </div>
                    </div>

                    {filteredPeople.length ===
                    0 ? (
                      <EmptyState
                        icon="👥"
                        title="No people found"
                        description="Try changing your filters or add a new team member."
                        buttonLabel="Add Person"
                        onClick={() =>
                          openCreatePerson()
                        }
                      />
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {filteredPeople.map(
                          (person) => (
                            <div
                              key={person.id}
                              className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
                            >
                              <div className="h-2 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />

                              <div className="p-5">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex min-w-0 items-center gap-3">
                                    {person.profileImage ? (
                                      <Image
                                        src={
                                          person.profileImage
                                        }
                                        alt={
                                          person.fullName
                                        }
                                        width={
                                          52
                                        }
                                        height={
                                          52
                                        }
                                        unoptimized
                                        className="h-13 w-13 rounded-2xl object-cover"
                                      />
                                    ) : (
                                      <div className="flex h-13 w-13 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-lg font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                        {getInitials(
                                          person.fullName
                                        )}
                                      </div>
                                    )}

                                    <div className="min-w-0">
                                      <h3 className="truncate font-bold">
                                        {
                                          person.fullName
                                        }
                                      </h3>

                                      <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                                        {person.jobTitle ||
                                          person.role ||
                                          "Team Member"}
                                      </p>
                                    </div>
                                  </div>

                                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                    {availabilityLabels[
                                      person
                                        .availability ||
                                        ""
                                    ] ||
                                      person.availability ||
                                      "Available"}
                                  </span>
                                </div>

                                <div className="mt-5 grid grid-cols-2 gap-2">
                                  <MetricBox
                                    label="Experience"
                                    value={`${person.experience || 0} yrs`}
                                  />

                                  <MetricBox
                                    label="Tasks"
                                    value={
                                      person
                                        ._count
                                        ?.assignedTasks ??
                                      0
                                    }
                                  />
                                </div>

                                <div className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                                  <p className="truncate">
                                    <span className="font-semibold">
                                      Email:
                                    </span>{" "}
                                    {
                                      person.email
                                    }
                                  </p>

                                  {person.location && (
                                    <p className="truncate">
                                      <span className="font-semibold">
                                        Location:
                                      </span>{" "}
                                      {
                                        person.location
                                      }
                                    </p>
                                  )}

                                  {person.department && (
                                    <p>
                                      <span className="font-semibold">
                                        Department:
                                      </span>{" "}
                                      {
                                        person
                                          .department
                                          .name
                                      }
                                    </p>
                                  )}
                                </div>

                                {person.skills &&
                                  person.skills
                                    .length >
                                    0 && (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                      {person.skills
                                        .slice(
                                          0,
                                          8
                                        )
                                        .map(
                                          (
                                            item
                                          ) => (
                                            <span
                                              key={
                                                item
                                                  .skill
                                                  .id
                                              }
                                              className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                                            >
                                              {
                                                item
                                                  .skill
                                                  .name
                                              }
                                            </span>
                                          )
                                        )}
                                    </div>
                                  )}
                              </div>

                              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/50">
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  ID #
                                  {
                                    person.id
                                  }
                                </span>

                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => openPersonDetails(person)}
                                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                  >
                                    👁️ View
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openEditPerson(person)}
                                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-600 transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70"
                                  >
                                    ✏️ Edit
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDeletePersonId(person.id)
                                    }
                                    className="text-xs font-bold text-red-600 hover:text-red-700 dark:text-red-400"
                                  >
                                    Deactivate
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </section>
                )}

                {/* DEPARTMENTS */}

                {activeTab ===
                  "departments" && (
                  <section className="space-y-6">
                    <PageHeader
                      eyebrow="Organization"
                      title="Departments"
                      description="Organize people and tasks into departments."
                      actionLabel="+ Add Department"
                      onAction={openCreateDepartment}
                    />

                    {departments.length ===
                    0 ? (
                      <EmptyState
                        icon="🏢"
                        title="No departments yet"
                        description="Create your first department."
                        buttonLabel="Add Department"
                        onClick={openCreateDepartment}
                      />
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {departments.map(
                          (department) => (
                            <div
                              key={
                                department.id
                              }
                              className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-xl dark:bg-indigo-950">
                                  🏢
                                </div>

                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  #
                                  {
                                    department.id
                                  }
                                </span>
                              </div>

                              <div className="mt-4 flex items-center justify-end">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openEditDepartment(department)
                                  }
                                  className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-600 transition hover:bg-indigo-100 hover:text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70"
                                  aria-label={`Edit ${department.name}`}
                                  title={`Edit ${department.name}`}
                                >
                                  ✏️ Edit Department
                                </button>
                              </div>

                              <h3 className="mt-4 text-lg font-bold">
                                {
                                  department.name
                                }
                              </h3>

                              <p className="mt-1 min-h-10 text-sm leading-6 text-slate-500 dark:text-slate-400">
                                {department.description ||
                                  "No description provided."}
                              </p>

                              <div className="mt-5 grid grid-cols-2 gap-3">
                                <MetricBox
                                  label="People"
                                  value={
                                    department
                                      ._count
                                      ?.people ??
                                    0
                                  }
                                />

                                <MetricBox
                                  label="Tasks"
                                  value={
                                    department
                                      ._count
                                      ?.tasks ??
                                    0
                                  }
                                />
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </section>
                )}

                {/* SKILLS */}

                {activeTab === "skills" && (
                  <section className="space-y-6">
                    <PageHeader
                      eyebrow="Capabilities"
                      title="Skills"
                      description="Create reusable skills for people and tasks."
                      actionLabel="+ Add Skill"
                      onAction={openCreateSkill}
                    />

                    <div className="grid gap-4 sm:grid-cols-3">
                      <MiniStat
                        label="Total Skills"
                        value={skills.length}
                        icon="🧩"
                      />

                      <MiniStat
                        label="Team Members"
                        value={people.length}
                        icon="👥"
                      />

                      <MiniStat
                        label="Departments"
                        value={
                          departments.length
                        }
                        icon="🏢"
                      />
                    </div>

                    {skills.length === 0 ? (
                      <EmptyState
                        icon="🧩"
                        title="No skills yet"
                        description="Create skills such as React, TypeScript, Python or UI/UX."
                        buttonLabel="Add Skill"
                        onClick={() =>
                          openCreateSkill()
                        }
                      />
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {skills.map((skill) => (
                          <div
                            key={skill.id}
                            className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 text-xl dark:bg-purple-950">
                                🧩
                              </div>

                              <span className="text-xs text-slate-400">
                                #
                                {skill.id}
                              </span>
                            </div>

                            <div className="mt-4 flex items-center justify-between gap-3">
                              <h3 className="text-lg font-bold">
                                {skill.name}
                              </h3>
                              <button
                                type="button"
                                onClick={() => openEditSkill(skill)}
                                className="shrink-0 rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-100 hover:shadow-md dark:border-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-950"
                              >
                                ✏️ Edit Skill
                              </button>
                            </div>

                            <p className="mt-1 min-h-10 text-sm leading-6 text-slate-500 dark:text-slate-400">
                              {skill.description ||
                                "No description provided."}
                            </p>

                            <div className="mt-5 flex gap-2 text-xs">
                              <span className="rounded-full bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                {skill._count
                                  ?.people ??
                                  0}{" "}
                                people
                              </span>

                              <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {skill._count
                                  ?.tasks ??
                                  0}{" "}
                                tasks
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {/* PROJECTS */}

                {activeTab === "projects" && (
                  <section className="space-y-6">
                    <PageHeader
                      eyebrow="Project Management"
                      title="Projects"
                      description="Create and manage project workspaces, managers, members and delivery status."
                      actionLabel="+ Create Project"
                      onAction={openCreateProject}
                    />

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <MiniStat
                        label="Total Projects"
                        value={projects.length}
                        icon="📁"
                      />
                      <MiniStat
                        label="Active"
                        value={projects.filter((project) => project.status === "ACTIVE").length}
                        icon="🟢"
                      />
                      <MiniStat
                        label="Planning"
                        value={projects.filter((project) => project.status === "PLANNING").length}
                        icon="🗓️"
                      />
                      <MiniStat
                        label="Completed"
                        value={projects.filter((project) => project.status === "COMPLETED").length}
                        icon="✓"
                      />
                    </div>

                    {projects.length === 0 ? (
                      <EmptyState
                        icon="📁"
                        title="No projects yet"
                        description="Create your first project and connect your team and tasks to it."
                        buttonLabel="Create Project"
                        onClick={openCreateProject}
                      />
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {projects.map((project) => (
                          <div
                            key={project.id}
                            className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
                          >
                            <div className="h-2 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />
                            <div className="p-5">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h3 className="truncate text-lg font-black">{project.name}</h3>
                                  <p className="mt-1 text-xs text-slate-400">Project #{project.id}</p>
                                </div>
                                <span className={cn(
                                  "rounded-full px-2.5 py-1 text-[10px] font-bold",
                                  project.status === "ACTIVE"
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                    : project.status === "COMPLETED"
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                    : project.status === "CANCELLED"
                                    ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                )}>
                                  {projectStatusLabels[project.status || "PLANNING"] || project.status || "Planning"}
                                </span>
                              </div>

                              <p className="mt-3 min-h-10 text-sm leading-6 text-slate-500 dark:text-slate-400">
                                {project.description || "No description provided."}
                              </p>

                              {project.client && (
                                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                                  <span className="font-bold">Client:</span> {project.client}
                                </p>
                              )}

                              <div className="mt-4 grid grid-cols-2 gap-2">
                                <MetricBox
                                  label="Members"
                                  value={project._count?.members ?? project.members?.length ?? 0}
                                />
                                <MetricBox
                                  label="Tasks"
                                  value={project._count?.tasks ?? project.tasks?.length ?? 0}
                                />
                              </div>

                              <div className="mt-4 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                                <p>
                                  <span className="font-bold">Manager:</span>{" "}
                                  {project.manager?.fullName || "Not assigned"}
                                </p>
                                <p>
                                  <span className="font-bold">Timeline:</span>{" "}
                                  {project.startDate ? new Date(project.startDate).toLocaleDateString() : "—"}
                                  {" → "}
                                  {project.dueDate ? new Date(project.dueDate).toLocaleDateString() : "—"}
                                </p>
                              </div>

                              {project.members && project.members.length > 0 && (
                                <div className="mt-4 flex flex-wrap gap-2">
                                  {project.members.slice(0, 6).map((member, index) => {
                                    const person = member.person;
                                    if (!person) return null;
                                    return (
                                      <span
                                        key={`${project.id}-${person.id}-${index}`}
                                        className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                                      >
                                        {person.fullName}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/50">
                              <button
                                type="button"
                                onClick={() => openProjectDetails(project)}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                👁️ View
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditProject(project)}
                                className="rounded-lg px-3 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/50"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteProjectId(project.id)}
                                className="rounded-lg px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {/* TASKS */}

                {activeTab === "tasks" && (
                  <section className="space-y-6">
                    <PageHeader
                      eyebrow="Task Management"
                      title="Tasks"
                      description="Plan, filter and manage your team's work."
                      actionLabel="+ Create Task"
                      onAction={() =>
                        setShowTaskModal(true)
                      }
                    />

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <MiniStat
                        label="Total"
                        value={tasks.length}
                        icon="📋"
                      />

                      <MiniStat
                        label="In Progress"
                        value={
                          taskStatusCounts[
                            "IN_PROGRESS"
                          ] || 0
                        }
                        icon="⚡"
                      />

                      <MiniStat
                        label="Completed"
                        value={completedTasks}
                        icon="✓"
                      />

                      <MiniStat
                        label="Urgent"
                        value={urgentTasks}
                        icon="🚨"
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <input
                        className="form-input"
                        placeholder="Search tasks..."
                        value={taskSearch}
                        onChange={(event) =>
                          setTaskSearch(
                            event.target.value
                          )
                        }
                      />

                      <select
                        className="form-select"
                        value={taskStatus}
                        onChange={(event) =>
                          setTaskStatus(
                            event.target
                              .value
                          )
                        }
                      >
                        <option value="ALL">
                          All statuses
                        </option>

                        {Object.entries(
                          statusLabels
                        ).map(
                          ([
                            value,
                            label,
                          ]) => (
                            <option
                              key={value}
                              value={value}
                            >
                              {label}
                            </option>
                          )
                        )}
                      </select>

                      <select
                        className="form-select"
                        value={
                          taskPriority
                        }
                        onChange={(event) =>
                          setTaskPriority(
                            event.target
                              .value
                          )
                        }
                      >
                        <option value="ALL">
                          All priorities
                        </option>

                        {Object.entries(
                          priorityLabels
                        ).map(
                          ([
                            value,
                            label,
                          ]) => (
                            <option
                              key={value}
                              value={value}
                            >
                              {label}
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <select className="form-select" value={taskProject} onChange={(event) => setTaskProject(event.target.value)}>
                        <option value="ALL">All projects</option>
                        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                      </select>

                      <select className="form-select" value={taskDepartment} onChange={(event) => setTaskDepartment(event.target.value)}>
                        <option value="ALL">All departments</option>
                        {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                      </select>

                      <select className="form-select" value={taskAssignee} onChange={(event) => setTaskAssignee(event.target.value)}>
                        <option value="ALL">All assignees</option>
                        {people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
                      </select>

                      <div className="flex gap-2">
                        <select className="form-select" value={taskDue} onChange={(event) => setTaskDue(event.target.value)}>
                          <option value="ALL">Any due date</option>
                          <option value="TODAY">Due today</option>
                          <option value="UPCOMING">Upcoming</option>
                          <option value="OVERDUE">Overdue</option>
                        </select>
                        <button type="button" onClick={resetTaskFilters} className="shrink-0 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Reset</button>
                      </div>
                    </div>

                    {/* KANBAN */}

                    <div>
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-bold">
                            Kanban Board
                          </h3>

                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Move tasks through your
                            workflow.
                          </p>
                        </div>
                      </div>

                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => void handleKanbanDragEnd(event)}
                      >
                        <div className="grid gap-4 overflow-x-auto xl:grid-cols-5">
                        {kanbanStatuses.map(
                          (status) => {
                            const columnTasks =
                              filteredTasks.filter(
                                (task) =>
                                  getStatus(
                                    task
                                  ) ===
                                  status
                              );

                            return (
                              <div
                                key={status}
                                className="min-w-[250px] rounded-2xl border border-slate-200 bg-slate-100/70 p-3 dark:border-slate-800 dark:bg-slate-900/60"
                              >
                                <div className="mb-3 flex items-center justify-between px-1">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={cn(
                                        "h-2.5 w-2.5 rounded-full",
                                        status ===
                                          "BACKLOG" &&
                                          "bg-slate-400",
                                        status ===
                                          "TODO" &&
                                          "bg-blue-500",
                                        status ===
                                          "IN_PROGRESS" &&
                                          "bg-indigo-500",
                                        status ===
                                          "REVIEW" &&
                                          "bg-orange-500",
                                        status ===
                                          "COMPLETED" &&
                                          "bg-emerald-500"
                                      )}
                                    />

                                    <h4 className="text-xs font-extrabold uppercase tracking-wide">
                                      {
                                        statusLabels[
                                          status
                                        ]
                                      }
                                    </h4>
                                  </div>

                                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-400">
                                    {
                                      columnTasks.length
                                    }
                                  </span>
                                </div>

                                <KanbanDropZone status={status}>
                                  {columnTasks.map(
                                    (task) => {
                                      const assignee =
                                        getTaskAssignee(
                                          task
                                        );

                                      return (
                                        <KanbanDraggableCard taskId={task.id}>
                                          <div
                                            className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                                          >
                                          <div className="flex items-start justify-between gap-2">
                                            <span
                                              className={cn(
                                                "rounded-full px-2 py-1 text-[9px] font-extrabold",
                                                getPriority(
                                                  task
                                                ) ===
                                                  "URGENT"
                                                  ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                                  : getPriority(
                                                        task
                                                      ) ===
                                                      "HIGH"
                                                  ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                                                  : getPriority(
                                                        task
                                                      ) ===
                                                      "LOW"
                                                  ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                                  : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                              )}
                                            >
                                              {
                                                priorityLabels[
                                                  getPriority(
                                                    task
                                                  )
                                                ]
                                              }
                                            </span>

                                            <span className="text-[10px] font-semibold text-slate-400">
                                              #
                                              {
                                                task.id
                                              }
                                            </span>
                                          </div>

                                          <div className="mt-3 flex items-start justify-between gap-2">
                                            <h5 className="line-clamp-2 text-sm font-bold">
                                              {task.title}
                                            </h5>
                                            <button
                                              type="button"
                                              onPointerDown={(event) => event.stopPropagation()}
                                              onClick={() => void openTaskDetails(task)}
                                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                              aria-label="View task"
                                              title="View task"
                                            >
                                              👁️ View
                                            </button>
                                            <button
                                              type="button"
                                              onPointerDown={(event) => event.stopPropagation()}
                                              onClick={() => void openEditTask(task)}
                                              className="flex-shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100 hover:text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70"
                                               aria-label="Edit task"
                                               title="Edit task"
                                             >
                                               ✏️ Edit Task
                                            </button>
                                          </div>

                                          {task.description && (
                                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                              {
                                                task.description
                                              }
                                            </p>
                                          )}

                                          <div className="mt-3 flex items-center justify-between gap-2">
                                            {assignee ? (
                                              <div className="flex min-w-0 items-center gap-2">
                                                {assignee.profileImage ? (
                                                  <Image
                                                    src={
                                                      assignee.profileImage
                                                    }
                                                    alt={
                                                      assignee.fullName
                                                    }
                                                    width={
                                                      24
                                                    }
                                                    height={
                                                      24
                                                    }
                                                    unoptimized
                                                    className="h-6 w-6 rounded-full object-cover"
                                                  />
                                                ) : (
                                                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[9px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                                    {getInitials(
                                                      assignee.fullName
                                                    )}
                                                  </div>
                                                )}

                                                <span className="truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                                  {
                                                    assignee.fullName
                                                  }
                                                </span>
                                              </div>
                                            ) : (
                                              <span className="text-[10px] font-semibold text-slate-400">
                                                Unassigned
                                              </span>
                                            )}

                                            <select
                                              value={
                                                status
                                              }
                                              onChange={(
                                                event
                                              ) =>
                                                void moveTask(
                                                  task,
                                                  event
                                                    .target
                                                    .value
                                                )
                                              }
                                              className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[9px] font-bold dark:border-slate-700 dark:bg-slate-800"
                                            >
                                              {kanbanStatuses.map(
                                                (
                                                  option
                                                ) => (
                                                  <option
                                                    key={
                                                      option
                                                    }
                                                    value={
                                                      option
                                                    }
                                                  >
                                                    {
                                                      statusLabels[
                                                        option
                                                      ]
                                                    }
                                                  </option>
                                                )
                                              )}
                                            </select>
                                          </div>
                                          </div>
                                        </KanbanDraggableCard>
                                      );
                                    }
                                  )}

                                  {columnTasks.length ===
                                    0 && (
                                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-5 text-center dark:border-slate-700 dark:bg-slate-900/30">
                                      <p className="text-xl">
                                        {status ===
                                        "COMPLETED"
                                          ? "✓"
                                          : "📭"}
                                      </p>

                                      <p className="mt-2 text-[10px] font-semibold text-slate-400">
                                        No tasks here
                                      </p>
                                    </div>
                                  )}
                                </KanbanDropZone>
                              </div>
                            );
                          }
                        )}
                        </div>
                      </DndContext>
                    </div>

                    {/* TASK LIST */}

                    {filteredTasks.length ===
                    0 ? (
                      <EmptyState
                        icon="✓"
                        title="No tasks found"
                        description="Create a task or change your filters."
                        buttonLabel="Create Task"
                        onClick={() =>
                          setShowTaskModal(true)
                        }
                      />
                    ) : (
                      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="border-b border-slate-100 p-5 dark:border-slate-800">
                          <h3 className="font-bold">
                            All Tasks
                          </h3>

                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {filteredTasks.length}{" "}
                            task(s) match your
                            current filters.
                          </p>
                        </div>

                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredTasks.map(
                            (task) => (
                              <div
                                key={task.id}
                                className="p-4 sm:p-5"
                              >
                                <div className="flex items-start gap-4">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleTask(
                                        task
                                      )
                                    }
                                    className={cn(
                                      "mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border transition",
                                      task.completed
                                        ? "border-emerald-500 bg-emerald-500 text-white"
                                        : "border-slate-300 hover:border-indigo-500 dark:border-slate-600"
                                    )}
                                  >
                                    {task.completed
                                      ? "✓"
                                      : ""}
                                  </button>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h3
                                        className={cn(
                                          "font-bold",
                                          task.completed &&
                                            "text-slate-400 line-through"
                                        )}
                                      >
                                        {
                                          task.title
                                        }
                                      </h3>

                                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                        {
                                          statusLabels[
                                            getStatus(
                                              task
                                            )
                                          ]
                                        }
                                      </span>

                                      <span
                                        className={cn(
                                          "rounded-full px-2.5 py-1 text-[10px] font-bold",
                                          getPriority(
                                            task
                                          ) ===
                                            "URGENT"
                                            ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                            : getPriority(
                                                  task
                                                ) ===
                                                "HIGH"
                                            ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                                            : getPriority(
                                                  task
                                                ) ===
                                                "LOW"
                                            ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                            : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                        )}
                                      >
                                        {
                                          priorityLabels[
                                            getPriority(
                                              task
                                            )
                                          ]
                                        }
                                      </span>
                                    </div>

                                    {task.description && (
                                      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                                        {
                                          task.description
                                        }
                                      </p>
                                    )}

                                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                                      <span>
                                        Task #
                                        {
                                          task.id
                                        }
                                      </span>

                                      <span>
                                        Created{" "}
                                        {new Date(
                                          task.createdAt
                                        ).toLocaleDateString()}
                                      </span>

                                      {task.project && (
                                        <span>
                                          Project:{" "}
                                          {
                                            task
                                              .project
                                              .name
                                          }
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex flex-shrink-0 items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => void openTaskDetails(task)}
                                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                      aria-label="View task"
                                      title="View task"
                                    >
                                      👁️ View
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void openEditTask(task)}
                                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100 hover:text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70"
                                       aria-label="Edit task"
                                       title="Edit task"
                                     >
                                       ✏️ Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setDeleteTaskId(
                                          task.id
                                        )
                                      }
                                      className="rounded-xl p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                                      aria-label="Delete task"
                                      title="Delete task"
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {/* AI */}

                {activeTab === "ai" && (
                  <section className="space-y-6">
                    <PageHeader
                      eyebrow="AI Assistant"
                      title="AI Task Bot"
                      description="Use your AI project manager to understand your team and manage work."
                    />

                    {/* QUICK ACTIONS */}

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <QuickAiCard
                        icon="🎯"
                        title="Find Best Assignee"
                        description="Match a task with the right person."
                        onClick={() =>
                          quickAiAction(
                            "Find the best person for a new task based on skills, department, availability, workload and experience."
                          )
                        }
                      />

                      <QuickAiCard
                        icon="➕"
                        title="Create Task with AI"
                        description="Describe a task and let AI structure it."
                        onClick={() =>
                          quickAiAction(
                            "Create a task with AI. Ask me for any missing title, description, project, department, priority, due date and required skills, then show me a confirmation preview before creating it."
                          )
                        }
                      />

                      <QuickAiCard
                        icon="👤"
                        title="Add Team Member with AI"
                        description="Add a person from natural-language details."
                        onClick={() =>
                          quickAiAction(
                            "Add a team member with AI. Ask for any missing required information, extract department, role, skills, experience and availability, then show a confirmation preview before creating the person."
                          )
                        }
                      />

                      <QuickAiCard
                        icon="👥"
                        title="Analyze Workload"
                        description="Find overloaded team members."
                        onClick={() =>
                          quickAiAction(
                            "Analyze our current team workload and identify anyone who is overloaded."
                          )
                        }
                      />

                      <QuickAiCard
                        icon="🧩"
                        title="Show Team Skills"
                        description="Explore our team's capabilities."
                        onClick={() =>
                          quickAiAction(
                            "Show me our team skills and tell me which people have each skill."
                          )
                        }
                      />

                      <QuickAiCard
                        icon="🔄"
                        title="Redistribute Work"
                        description="Find overloaded people and rebalance work."
                        onClick={() =>
                          quickAiAction(
                            "Analyze team workload and recommend how to redistribute active tasks from overloaded people to suitable available team members. Do not make changes until I confirm."
                          )
                        }
                      />

                      <QuickAiCard
                        icon="🚨"
                        title="Find Overdue Tasks"
                        description="Identify work that needs attention."
                        onClick={() =>
                          quickAiAction(
                            "Find our overdue or high-priority tasks and explain what needs attention."
                          )
                        }
                      />
                    </div>

                    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-center gap-3 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-purple-50 p-5 dark:border-slate-800 dark:from-indigo-950/40 dark:to-purple-950/30">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-xl text-white shadow-lg">
                          ✨
                        </div>

                        <div className="min-w-0">
                          <h3 className="font-bold">
                            AI Project Manager
                          </h3>

                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Powered by your configured
                            configured Cloud AI model
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={clearAIChat}
                          disabled={
                            aiLoading ||
                            aiMessages.length === 0
                          }
                          className="ml-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                          title="Clear AI conversation"
                        >
                          🧹 Clear
                        </button>

                        <div className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-bold text-emerald-700 sm:flex dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          AI Ready
                        </div>
                      </div>

                      <div className="scrollbar-thin min-h-[420px] max-h-[620px] space-y-5 overflow-y-auto p-5">
                        {aiMessages.length ===
                          0 && (
                          <div className="flex min-h-[350px] items-center justify-center">
                            <div className="max-w-xl text-center">
                              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-100 to-purple-100 text-4xl dark:from-indigo-950 dark:to-purple-950">
                                ✨
                              </div>

                              <h3 className="mt-5 text-2xl font-black">
                                Your AI project
                                manager
                              </h3>

                              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                                Ask natural-language
                                questions about your
                                real team and tasks.
                              </p>

                              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                                {[
                                  "Who is available?",
                                  "Show me our team skills",
                                  "Who should handle a Node.js API task?",
                                  "Which team members are overloaded?",
                                ].map(
                                  (prompt) => (
                                    <button
                                      key={
                                        prompt
                                      }
                                      type="button"
                                      onClick={() =>
                                        setAiInput(
                                          prompt
                                        )
                                      }
                                      className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-700 dark:hover:bg-indigo-950"
                                    >
                                      <span className="mr-2">
                                        →
                                      </span>
                                      {prompt}
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {aiMessages.map(
                          (message, index) => (
                            <div
                              key={`${message.role}-${index}`}
                              className={cn(
                                "flex gap-3",
                                message.role ===
                                  "user"
                                  ? "justify-end"
                                  : "justify-start"
                              )}
                            >
                              {message.role ===
                                "assistant" && (
                                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950">
                                  ✨
                                </div>
                              )}

                              <div
                                className={cn(
                                  "max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[82%]",
                                  message.role ===
                                    "user"
                                    ? "rounded-br-md bg-indigo-600 text-white"
                                    : "rounded-bl-md bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                                )}
                              >
                                {message.role ===
                                "assistant" ? (
                                  <div className="prose prose-sm max-w-none dark:prose-invert">
                                    <ReactMarkdown
                                      remarkPlugins={[
                                        remarkGfm,
                                      ]}
                                      components={{
                                        table: ({
                                          children,
                                        }) => (
                                          <div className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                                            <table className="min-w-full border-collapse text-sm">
                                              {
                                                children
                                              }
                                            </table>
                                          </div>
                                        ),

                                        thead: ({
                                          children,
                                        }) => (
                                          <thead className="bg-slate-100 dark:bg-slate-800">
                                            {
                                              children
                                            }
                                          </thead>
                                        ),

                                        th: ({
                                          children,
                                        }) => (
                                          <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                                            {
                                              children
                                            }
                                          </th>
                                        ),

                                        td: ({
                                          children,
                                        }) => (
                                          <td className="border-b border-slate-100 px-3 py-2 text-slate-600 dark:border-slate-800 dark:text-slate-300">
                                            {
                                              children
                                            }
                                          </td>
                                        ),

                                        p: ({
                                          children,
                                        }) => (
                                          <p className="mb-2 last:mb-0">
                                            {
                                              children
                                            }
                                          </p>
                                        ),

                                        strong: ({
                                          children,
                                        }) => (
                                          <strong className="font-semibold">
                                            {
                                              children
                                            }
                                          </strong>
                                        ),

                                        ul: ({
                                          children,
                                        }) => (
                                          <ul className="mb-2 list-disc space-y-1 pl-5">
                                            {
                                              children
                                            }
                                          </ul>
                                        ),

                                        ol: ({
                                          children,
                                        }) => (
                                          <ol className="mb-2 list-decimal space-y-1 pl-5">
                                            {
                                              children
                                            }
                                          </ol>
                                        ),

                                        code: ({
                                          children,
                                        }) => (
                                          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm dark:bg-slate-800">
                                            {
                                              children
                                            }
                                          </code>
                                        ),
                                      }}
                                    >
                                      {
                                        message.content
                                      }
                                    </ReactMarkdown>
                                  </div>
                                ) : (
                                  message.content
                                )}
                              </div>
                            </div>
                          )
                        )}

                        {aiLoading && (
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950">
                              ✨
                            </div>

                            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              <span className="animate-pulse">
                                AI
                              </span>

                              <span className="flex gap-1">
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:120ms]" />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:240ms]" />
                              </span>
                            </div>
                          </div>
                        )}

                        <div ref={aiMessagesEndRef} />
                      </div>

                      <form
                        onSubmit={sendAIMessage}
                        className="border-t border-slate-200 p-4 dark:border-slate-800"
                      >
                        <div className="flex gap-2">
                          <input
                            value={aiInput}
                            onChange={(
                              event
                            ) =>
                              setAiInput(
                                event.target
                                  .value
                              )
                            }
                            disabled={
                              aiLoading
                            }
                            className="form-input"
                            placeholder="Ask your AI project manager..."
                          />

                          <button
                            type="submit"
                            disabled={
                              aiLoading ||
                              !aiInput.trim()
                            }
                            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label="Send message"
                          >
                            ➤
                          </button>
                        </div>

                        <p className="mt-2 text-[10px] text-slate-400">
                          Tip: Ask about real people,
                          skills, tasks, workload or
                          assignment decisions.
                        </p>
                      </form>
                    </div>
                  </section>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* CREATE PERSON MODAL */}

      {showPersonModal && (
        <Modal
          title={editingPersonId === null ? "Add Team Member" : "Edit Team Member"}
          description={
            editingPersonId === null
              ? "Create a person with department, skills and availability."
              : "Update this team member's profile, skills and availability."
          }
          onClose={() => {
            setShowPersonModal(false);
            setEditingPersonId(null);
            resetPersonForm();
          }}
        >
          <form
            onSubmit={savePerson}
            className="space-y-6"
          >
            <div>
              <h3 className="section-title">
                Basic Information
              </h3>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Full Name"
                  required
                  className="sm:col-span-2"
                >
                  <input
                    className="form-input"
                    value={
                      personForm.fullName
                    }
                    onChange={(event) =>
                      setPersonForm(
                        (current) => ({
                          ...current,
                          fullName:
                            event.target
                              .value,
                        })
                      )
                    }
                    placeholder="John Doe"
                  />
                </Field>

                <Field
                  label="Email"
                  required
                >
                  <input
                    type="email"
                    className="form-input"
                    value={
                      personForm.email
                    }
                    onChange={(event) =>
                      setPersonForm(
                        (current) => ({
                          ...current,
                          email:
                            event.target
                              .value,
                        })
                      )
                    }
                    placeholder="john@example.com"
                  />
                </Field>

                <Field label="Phone">
                  <input
                    className="form-input"
                    value={
                      personForm.phone
                    }
                    onChange={(event) =>
                      setPersonForm(
                        (current) => ({
                          ...current,
                          phone:
                            event.target
                              .value,
                        })
                      )
                    }
                    placeholder="+92..."
                  />
                </Field>

                <Field label="Profile Image URL">
                  <input
                    className="form-input"
                    value={
                      personForm.profileImage
                    }
                    onChange={(event) =>
                      setPersonForm(
                        (current) => ({
                          ...current,
                          profileImage:
                            event.target
                              .value,
                        })
                      )
                    }
                    placeholder="https://..."
                  />
                </Field>

                <Field label="Location">
                  <input
                    className="form-input"
                    value={
                      personForm.location
                    }
                    onChange={(event) =>
                      setPersonForm(
                        (current) => ({
                          ...current,
                          location:
                            event.target
                              .value,
                        })
                      )
                    }
                    placeholder="Islamabad"
                  />
                </Field>
              </div>

              {personForm.profileImage && (
                <div className="mt-4 flex items-center gap-3">
                  <Image
                    src={
                      personForm.profileImage
                    }
                    alt="Profile preview"
                    width={56}
                    height={56}
                    unoptimized
                    className="h-14 w-14 rounded-full object-cover"
                  />

                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Profile image preview
                  </span>
                </div>
              )}
            </div>

            <div>
              <h3 className="section-title">
                Work Information
              </h3>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Department">
                  <select
                    className="form-select"
                    value={
                      personForm.departmentId
                    }
                    onChange={(event) =>
                      setPersonForm(
                        (current) => ({
                          ...current,
                          departmentId:
                            event.target
                              .value,
                        })
                      )
                    }
                  >
                    <option value="">
                      No department
                    </option>

                    {departments.map(
                      (department) => (
                        <option
                          key={
                            department.id
                          }
                          value={
                            department.id
                          }
                        >
                          {
                            department.name
                          }
                        </option>
                      )
                    )}
                  </select>
                </Field>

                <Field label="Job Title">
                  <input
                    className="form-input"
                    value={
                      personForm.jobTitle
                    }
                    onChange={(event) =>
                      setPersonForm(
                        (current) => ({
                          ...current,
                          jobTitle:
                            event.target
                              .value,
                        })
                      )
                    }
                    placeholder="Frontend Developer"
                  />
                </Field>

                <Field label="Role">
                  <input
                    className="form-input"
                    value={
                      personForm.role
                    }
                    onChange={(event) =>
                      setPersonForm(
                        (current) => ({
                          ...current,
                          role: event.target
                            .value,
                        })
                      )
                    }
                    placeholder="Developer"
                  />
                </Field>

                <Field label="Experience (years)">
                  <input
                    type="number"
                    min="0"
                    className="form-input"
                    value={
                      personForm.experience
                    }
                    onChange={(event) =>
                      setPersonForm(
                        (current) => ({
                          ...current,
                          experience:
                            event.target
                              .value,
                        })
                      )
                    }
                  />
                </Field>

                <Field label="Employment Type">
                  <select
                    className="form-select"
                    value={
                      personForm.employmentType
                    }
                    onChange={(event) =>
                      setPersonForm(
                        (current) => ({
                          ...current,
                          employmentType:
                            event.target
                              .value,
                        })
                      )
                    }
                  >
                    <option value="FULL_TIME">
                      Full Time
                    </option>
                    <option value="PART_TIME">
                      Part Time
                    </option>
                    <option value="CONTRACT">
                      Contract
                    </option>
                    <option value="INTERN">
                      Intern
                    </option>
                    <option value="FREELANCE">
                      Freelance
                    </option>
                  </select>
                </Field>

                <Field label="Joining Date">
                  <input
                    type="date"
                    className="form-input"
                    value={
                      personForm.joiningDate
                    }
                    onChange={(event) =>
                      setPersonForm(
                        (current) => ({
                          ...current,
                          joiningDate:
                            event.target
                              .value,
                        })
                      )
                    }
                  />
                </Field>
              </div>
            </div>

            <div>
              <h3 className="section-title">
                Skills & Availability
              </h3>

              <div className="mt-4">
                <Field label="Availability">
                  <select
                    className="form-select"
                    value={
                      personForm.availability
                    }
                    onChange={(event) =>
                      setPersonForm(
                        (current) => ({
                          ...current,
                          availability:
                            event.target
                              .value,
                        })
                      )
                    }
                  >
                    {Object.entries(
                      availabilityLabels
                    ).map(
                      ([
                        value,
                        label,
                      ]) => (
                        <option
                          key={value}
                          value={value}
                        >
                          {label}
                        </option>
                      )
                    )}
                  </select>
                </Field>
              </div>

              <div className="mt-4">
                <p className="field-label">
                  Skills
                </p>

                {skills.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No skills available.
                    Create skills first.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {skills.map((skill) => (
                      <label
                        key={skill.id}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-700 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40"
                      >
                        <input
                          type="checkbox"
                          checked={personForm.skillIds.includes(
                            skill.id
                          )}
                          onChange={() =>
                            togglePersonSkill(
                              skill.id
                            )
                          }
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                        />

                        <span className="text-sm font-medium">
                          {skill.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="section-title">
                Additional Information
              </h3>

              <div className="mt-4 space-y-4">
                <Field label="Bio">
                  <textarea
                    className="form-textarea"
                    value={personForm.bio}
                    onChange={(event) =>
                      setPersonForm(
                        (current) => ({
                          ...current,
                          bio: event.target
                            .value,
                        })
                      )
                    }
                    placeholder="Short professional bio..."
                  />
                </Field>

                <Field label="Notes">
                  <textarea
                    className="form-textarea"
                    value={
                      personForm.notes
                    }
                    onChange={(event) =>
                      setPersonForm(
                        (current) => ({
                          ...current,
                          notes:
                            event.target
                              .value,
                        })
                      )
                    }
                    placeholder="Internal notes..."
                  />
                </Field>

                <Field label="Preferred Task Types">
                  <input
                    className="form-input"
                    value={
                      personForm.preferredTaskTypes
                    }
                    onChange={(event) =>
                      setPersonForm(
                        (current) => ({
                          ...current,
                          preferredTaskTypes:
                            event.target
                              .value,
                        })
                      )
                    }
                    placeholder="Frontend, API, UI..."
                  />
                </Field>
              </div>
            </div>

            <ModalActions
              cancelLabel="Cancel"
              submitLabel={
                saving
                  ? editingPersonId === null
                    ? "Creating..."
                    : "Saving..."
                  : editingPersonId === null
                    ? "Create Person"
                    : "Save Changes"
              }
              onCancel={() => {
                setShowPersonModal(false);
                setEditingPersonId(null);
                resetPersonForm();
              }}
              disabled={saving}
            />
          </form>
        </Modal>
      )}

      {/* CREATE / EDIT DEPARTMENT MODAL */}

      {showDepartmentModal && (
        <Modal
          title={
            editingDepartmentId === null
              ? "Create Department"
              : "Edit Department"
          }
          description={
            editingDepartmentId === null
              ? "Add a department for organizing your team."
              : "Update the department information."
          }
          onClose={() => {
            setShowDepartmentModal(false);
            setEditingDepartmentId(null);
            resetDepartmentForm();
          }}
        >
          <form
            onSubmit={saveDepartment}
            className="space-y-5"
          >
            <Field
              label="Department Name"
              required
            >
              <input
                className="form-input"
                value={
                  departmentForm.name
                }
                onChange={(event) =>
                  setDepartmentForm(
                    (current) => ({
                      ...current,
                      name: event.target
                        .value,
                    })
                  )
                }
                placeholder="Engineering"
              />
            </Field>

            <Field label="Description">
              <textarea
                className="form-textarea"
                value={
                  departmentForm.description
                }
                onChange={(event) =>
                  setDepartmentForm(
                    (current) => ({
                      ...current,
                      description:
                        event.target
                          .value,
                    })
                  )
                }
                placeholder="Software development team"
              />
            </Field>

            <ModalActions
              cancelLabel="Cancel"
              submitLabel={
                saving
                  ? editingDepartmentId === null
                    ? "Creating..."
                    : "Saving..."
                  : editingDepartmentId === null
                    ? "Create Department"
                    : "Save Changes"
              }
              onCancel={() => {
                setShowDepartmentModal(false);
                setEditingDepartmentId(null);
                resetDepartmentForm();
              }}
              disabled={saving}
            />
          </form>
        </Modal>
      )}

      {/* CREATE SKILL MODAL */}

      {showSkillModal && (
        <Modal
          title={editingSkillId === null ? "Create Skill" : "Edit Skill"}
          description={
            editingSkillId === null
              ? "Add a reusable skill for your team."
              : "Update this skill without changing its team relationships."
          }
          onClose={() => {
            setShowSkillModal(false);
            setEditingSkillId(null);
            resetSkillForm();
          }}
        >
          <form
            onSubmit={createSkill}
            className="space-y-5"
          >
            <Field
              label="Skill Name"
              required
            >
              <input
                className="form-input"
                value={skillForm.name}
                onChange={(event) =>
                  setSkillForm(
                    (current) => ({
                      ...current,
                      name: event.target
                        .value,
                    })
                  )
                }
                placeholder="TypeScript"
              />
            </Field>

            <Field label="Description">
              <textarea
                className="form-textarea"
                value={
                  skillForm.description
                }
                onChange={(event) =>
                  setSkillForm(
                    (current) => ({
                      ...current,
                      description:
                        event.target
                          .value,
                    })
                  )
                }
                placeholder="Type-safe JavaScript development"
              />
            </Field>

            <ModalActions
              cancelLabel="Cancel"
              submitLabel={
                saving
                  ? editingSkillId === null
                    ? "Creating..."
                    : "Saving..."
                  : editingSkillId === null
                    ? "Create Skill"
                    : "Save Changes"
              }
              onCancel={() => {
                setShowSkillModal(false);
                setEditingSkillId(null);
                resetSkillForm();
              }}
              disabled={saving}
            />
          </form>
        </Modal>
      )}

      {/* CREATE / EDIT PROJECT MODAL */}

      {showProjectModal && (
        <Modal
          title={editingProjectId ? "Edit Project" : "Create Project"}
          description={editingProjectId ? "Update project details, manager and members." : "Create a project workspace for your team and tasks."}
          onClose={() => {
            setShowProjectModal(false);
            resetProjectForm();
          }}
        >
          <form onSubmit={saveProject} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project Name" required className="sm:col-span-2">
                <input
                  className="form-input"
                  value={projectForm.name}
                  onChange={(event) =>
                    setProjectForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Website Redesign"
                />
              </Field>

              <Field label="Client">
                <input
                  className="form-input"
                  value={projectForm.client}
                  onChange={(event) =>
                    setProjectForm((current) => ({ ...current, client: event.target.value }))
                  }
                  placeholder="Acme Inc."
                />
              </Field>

              <Field label="Status">
                <select
                  className="form-select"
                  value={projectForm.status}
                  onChange={(event) =>
                    setProjectForm((current) => ({ ...current, status: event.target.value }))
                  }
                >
                  {Object.entries(projectStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Start Date">
                <input
                  type="date"
                  className="form-input"
                  value={projectForm.startDate}
                  onChange={(event) =>
                    setProjectForm((current) => ({ ...current, startDate: event.target.value }))
                  }
                />
              </Field>

              <Field label="Due Date">
                <input
                  type="date"
                  className="form-input"
                  value={projectForm.dueDate}
                  onChange={(event) =>
                    setProjectForm((current) => ({ ...current, dueDate: event.target.value }))
                  }
                />
              </Field>
            </div>

            <Field label="Description">
              <textarea
                className="form-textarea"
                value={projectForm.description}
                onChange={(event) =>
                  setProjectForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Describe the project's goals and scope..."
              />
            </Field>

            <Field label="Project Manager">
              <select
                className="form-select"
                value={projectForm.managerId}
                onChange={(event) =>
                  setProjectForm((current) => ({ ...current, managerId: event.target.value }))
                }
              >
                <option value="">No manager</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName}{person.jobTitle ? ` — ${person.jobTitle}` : ""}
                  </option>
                ))}
              </select>
            </Field>

            <div>
              <p className="field-label">Project Members</p>
              {people.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No active team members available.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {people.map((person) => (
                    <label
                      key={person.id}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-700 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40"
                    >
                      <input
                        type="checkbox"
                        checked={projectForm.memberIds.includes(person.id)}
                        onChange={() => toggleProjectMember(person.id)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{person.fullName}</p>
                        <p className="truncate text-[10px] text-slate-400">
                          {person.department?.name || person.jobTitle || "Team member"}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <ModalActions
              cancelLabel="Cancel"
              submitLabel={saving ? (editingProjectId ? "Saving..." : "Creating...") : editingProjectId ? "Save Changes" : "Create Project"}
              onCancel={() => {
                setShowProjectModal(false);
                resetProjectForm();
              }}
              disabled={saving}
            />
          </form>
        </Modal>
      )}

      {/* CREATE TASK MODAL */}

      {showTaskModal && (
        <Modal
          title={editingTaskId !== null ? "Edit Task" : "Create Task"}
          description={
            editingTaskId !== null
              ? "View and update this task's project, team, skills, dates and status."
              : "Add a new task to your workspace."
          }
          onClose={() => {
            setShowTaskModal(false);
            resetTaskForm();
          }}
        >
          <form
            onSubmit={editingTaskId !== null ? saveTask : createTask}
            className="space-y-5"
          >
            <Field
              label="Task Title"
              required
            >
              <input
                className="form-input"
                value={taskForm.title}
                onChange={(event) =>
                  setTaskForm(
                    (current) => ({
                      ...current,
                      title: event.target
                        .value,
                    })
                  )
                }
                placeholder="Build dashboard UI"
              />
            </Field>

            <Field label="Description">
              <textarea
                className="form-textarea"
                value={
                  taskForm.description
                }
                onChange={(event) =>
                  setTaskForm(
                    (current) => ({
                      ...current,
                      description:
                        event.target
                          .value,
                    })
                  )
                }
                placeholder="Describe the task..."
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project">
                <select
                  className="form-select"
                  value={taskForm.projectId}
                  onChange={(event) =>
                    setTaskForm((current) => ({
                      ...current,
                      projectId: event.target.value,
                    }))
                  }
                >
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Department">
                <select
                  className="form-select"
                  value={taskForm.departmentId}
                  onChange={(event) =>
                    setTaskForm((current) => ({
                      ...current,
                      departmentId: event.target.value,
                    }))
                  }
                >
                  <option value="">No department</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Task Type">
                <input
                  className="form-input"
                  value={taskForm.taskType}
                  onChange={(event) =>
                    setTaskForm((current) => ({
                      ...current,
                      taskType: event.target.value,
                    }))
                  }
                  placeholder="Feature, Bug, Design..."
                />
              </Field>

              <Field label="Labels">
                <input
                  className="form-input"
                  value={taskForm.labels}
                  onChange={(event) =>
                    setTaskForm((current) => ({
                      ...current,
                      labels: event.target.value,
                    }))
                  }
                  placeholder="frontend, urgent, api"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start Date">
                <input
                  type="date"
                  className="form-input"
                  value={taskForm.startDate}
                  onChange={(event) =>
                    setTaskForm((current) => ({
                      ...current,
                      startDate: event.target.value,
                    }))
                  }
                />
              </Field>

              <Field label="Due Date">
                <input
                  type="date"
                  className="form-input"
                  value={taskForm.dueDate}
                  onChange={(event) =>
                    setTaskForm((current) => ({
                      ...current,
                      dueDate: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Estimated Hours">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className="form-input"
                  value={taskForm.estimatedHours}
                  onChange={(event) =>
                    setTaskForm((current) => ({
                      ...current,
                      estimatedHours: event.target.value,
                    }))
                  }
                  placeholder="8"
                />
              </Field>

              <Field label="Actual Hours">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className="form-input"
                  value={taskForm.actualHours}
                  onChange={(event) =>
                    setTaskForm((current) => ({
                      ...current,
                      actualHours: event.target.value,
                    }))
                  }
                  placeholder="0"
                />
              </Field>
            </div>

            <Field label="Required Skills">
              {skills.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No skills are available yet. Add skills from the Skills tab.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {skills.map((skill) => (
                    <label
                      key={skill.id}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-700 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40"
                    >
                      <input
                        type="checkbox"
                        checked={taskForm.skillIds.includes(skill.id)}
                        onChange={() => toggleTaskSkill(skill.id)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{skill.name}</p>
                        {skill.description && (
                          <p className="truncate text-[10px] text-slate-400">{skill.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </Field>

            <Field label="Assignees">
              {people.filter((person) => person.isActive !== false).length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No active team members are available.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {people
                    .filter((person) => person.isActive !== false)
                    .map((person) => (
                      <label
                        key={person.id}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-700 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40"
                      >
                        <input
                          type="checkbox"
                          checked={taskForm.assigneeIds.includes(person.id)}
                          onChange={() => toggleTaskAssignee(person.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{person.fullName}</p>
                          <p className="truncate text-[10px] text-slate-400">
                            {person.department?.name || person.jobTitle || "Team member"}
                          </p>
                        </div>
                      </label>
                    ))}
                </div>
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Priority">
                <select
                  className="form-select"
                  value={
                    taskForm.priority
                  }
                  onChange={(event) =>
                    setTaskForm(
                      (current) => ({
                        ...current,
                        priority:
                          event.target
                            .value,
                      })
                    )
                  }
                >
                  {Object.entries(
                    priorityLabels
                  ).map(
                    ([
                      value,
                      label,
                    ]) => (
                      <option
                        key={value}
                        value={value}
                      >
                        {label}
                      </option>
                    )
                  )}
                </select>
              </Field>

              <Field label="Status">
                <select
                  className="form-select"
                  value={
                    taskForm.status
                  }
                  onChange={(event) =>
                    setTaskForm(
                      (current) => ({
                        ...current,
                        status:
                          event.target
                            .value,
                      })
                    )
                  }
                >
                  {Object.entries(
                    statusLabels
                  ).map(
                    ([
                      value,
                      label,
                    ]) => (
                      <option
                        key={value}
                        value={value}
                      >
                        {label}
                      </option>
                    )
                  )}
                </select>
              </Field>
            </div>

            <ModalActions
              cancelLabel="Cancel"
              submitLabel={
                saving
                  ? editingTaskId !== null
                    ? "Saving..."
                    : "Creating..."
                  : editingTaskId !== null
                    ? "Save Changes"
                    : "Create Task"
              }
              onCancel={() => {
                setShowTaskModal(false);
                resetTaskForm();
              }}
              disabled={saving}
            />
          </form>
        </Modal>
      )}

      {/* TASK DETAIL MODAL */}

      {selectedTask && (
        <Modal
          title={`Task #${selectedTask.id} — ${selectedTask.title}`}
          description="Detailed view of the task, its team, project and progress."
          onClose={() => setSelectedTask(null)}
        >
          {loadingTaskDetails ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn(
                  "rounded-full px-3 py-1 text-xs font-bold",
                  getStatus(selectedTask) === "COMPLETED"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                )}>
                  {statusLabels[getStatus(selectedTask)] || getStatus(selectedTask)}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {priorityLabels[getPriority(selectedTask)] || getPriority(selectedTask)} Priority
                </span>
                {selectedTask.taskType && (
                  <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                    {selectedTask.taskType}
                  </span>
                )}
              </div>

              <div>
                <h3 className="text-lg font-black">Description</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {selectedTask.description || "No description provided."}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <DetailItem label="Project" value={selectedTask.project?.name || "No project"} />
                <DetailItem label="Department" value={selectedTask.department?.name || "No department"} />
                <DetailItem label="Start Date" value={formatDetailDate(selectedTask.startDate)} />
                <DetailItem label="Due Date" value={formatDetailDate(selectedTask.dueDate)} />
                <DetailItem label="Estimated Hours" value={selectedTask.estimatedHours != null ? `${selectedTask.estimatedHours}h` : "Not set"} />
                <DetailItem label="Actual Hours" value={selectedTask.actualHours != null ? `${selectedTask.actualHours}h` : "Not set"} />
                <DetailItem label="Created" value={formatDetailDate(selectedTask.createdAt)} />
                <DetailItem label="Updated" value={formatDetailDate(selectedTask.updatedAt)} />
              </div>

              <div>
                <h3 className="text-lg font-black">Assignees</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(selectedTask.assignees || []).map((item, index) => {
                    const person = item.person || item.user;
                    if (!person) return null;
                    return (
                      <span key={person.id || index} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800">
                        👤 {person.fullName}
                      </span>
                    );
                  })}
                  {(!selectedTask.assignees || selectedTask.assignees.length === 0) && !selectedTask.assignedTo && (
                    <p className="text-sm text-slate-400">Unassigned</p>
                  )}
                  {selectedTask.assignees?.length === 0 && selectedTask.assignedTo && (
                    <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800">
                      👤 {selectedTask.assignedTo.fullName}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-black">Required Skills</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(selectedTask.skills || []).map((item, index) => {
                    const skill = "skill" in item ? item.skill : item;
                    if (!skill) return null;
                    return (
                      <span key={skill.id || index} className="rounded-xl bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                        🧩 {skill.name}
                      </span>
                    );
                  })}
                  {(!selectedTask.skills || selectedTask.skills.length === 0) && (
                    <p className="text-sm text-slate-400">No required skills.</p>
                  )}
                </div>
              </div>

              {selectedTask.labels && (
                <div>
                  <h3 className="text-lg font-black">Labels</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedTask.labels.split(",").map((label) => label.trim()).filter(Boolean).map((label) => (
                      <span key={label} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        #{label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedTask.checklist && selectedTask.checklist.length > 0 && (
                <div>
                  <h3 className="text-lg font-black">Checklist</h3>
                  <div className="mt-3 space-y-2">
                    {selectedTask.checklist.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                        <span className={item.completed ? "text-emerald-600" : "text-slate-400"}>{item.completed ? "☑" : "☐"}</span>
                        <span className={cn("text-sm", item.completed && "text-slate-400 line-through")}>{item.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedTask.comments && selectedTask.comments.length > 0 && (
                <div>
                  <h3 className="text-lg font-black">Comments</h3>
                  <div className="mt-3 space-y-3">
                    {selectedTask.comments.map((comment) => (
                      <div key={comment.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{comment.content}</p>
                        <p className="mt-2 text-[10px] font-semibold text-slate-400">{formatDetailDate(comment.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedTask.activities && selectedTask.activities.length > 0 && (
                <div>
                  <h3 className="text-lg font-black">Activity</h3>
                  <div className="mt-3 space-y-2">
                    {selectedTask.activities.map((activity) => (
                      <div key={activity.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                        <p className="text-sm font-semibold">{activity.action}</p>
                        {activity.details && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{activity.details}</p>}
                        <p className="mt-1 text-[10px] text-slate-400">{formatDetailDate(activity.createdAt)}{activity.isAI ? " • AI" : ""}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-5 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    const task = selectedTask;
                    setSelectedTask(null);
                    void openEditTask(task);
                  }}
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700"
                >
                  ✏️ Edit Task
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTask(null);
                    setDeleteTaskId(selectedTask.id);
                  }}
                  className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50 dark:border-red-900/70 dark:hover:bg-red-950/40"
                >
                  🗑️ Delete Task
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* PERSON DETAIL MODAL */}

      {selectedPerson && (
        <Modal
          title={selectedPerson.fullName}
          description="Team member profile, capabilities, workload and assigned work."
          onClose={() => setSelectedPerson(null)}
        >
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              {selectedPerson.profileImage ? (
                <Image src={selectedPerson.profileImage} alt={selectedPerson.fullName} width={72} height={72} unoptimized className="h-[72px] w-[72px] rounded-2xl object-cover" />
              ) : (
                <div className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-indigo-100 text-xl font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{getInitials(selectedPerson.fullName)}</div>
              )}
              <div>
                <h3 className="text-xl font-black">{selectedPerson.jobTitle || selectedPerson.role || "Team Member"}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{selectedPerson.department?.name || "No department"} • {availabilityLabels[selectedPerson.availability || ""] || selectedPerson.availability || "Available"}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailItem label="Email" value={selectedPerson.email} />
              <DetailItem label="Phone" value={selectedPerson.phone || "Not set"} />
              <DetailItem label="Role" value={selectedPerson.role || "Not set"} />
              <DetailItem label="Experience" value={`${selectedPerson.experience || 0} years`} />
              <DetailItem label="Employment" value={(selectedPerson.employmentType || "Not set").replaceAll("_", " ")} />
              <DetailItem label="Active Tasks" value={String(getPersonActiveTaskCount(selectedPerson.id))} />
            </div>

            <div>
              <h3 className="text-lg font-black">Skills</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {(selectedPerson.skills || []).map((item) => (
                  <span key={item.skill.id} className="rounded-xl bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">🧩 {item.skill.name}</span>
                ))}
                {(!selectedPerson.skills || selectedPerson.skills.length === 0) && <p className="text-sm text-slate-400">No skills assigned.</p>}
              </div>
            </div>

            {selectedPerson.bio && <div><h3 className="text-lg font-black">Bio</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{selectedPerson.bio}</p></div>}

            <div>
              <h3 className="text-lg font-black">Assigned Tasks</h3>
              <div className="mt-3 space-y-2">
                {tasks.filter((task) => task.assignees?.some((assignee) => assignee.person?.id === selectedPerson.id || assignee.personId === selectedPerson.id)).slice(0, 12).map((task) => (
                  <button key={task.id} type="button" onClick={() => { setSelectedPerson(null); void openTaskDetails(task); }} className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                    <span className="min-w-0 truncate text-sm font-semibold">#{task.id} — {task.title}</span>
                    <span className="ml-3 shrink-0 text-[10px] font-bold text-slate-400">{statusLabels[getStatus(task)] || getStatus(task)}</span>
                  </button>
                ))}
                {tasks.filter((task) => task.assignees?.some((assignee) => assignee.person?.id === selectedPerson.id || assignee.personId === selectedPerson.id)).length === 0 && <p className="text-sm text-slate-400">No assigned tasks.</p>}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-5 dark:border-slate-800">
              <button type="button" onClick={() => { const person = selectedPerson; setSelectedPerson(null); openEditPerson(person); }} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">✏️ Edit Person</button>
            </div>
          </div>
        </Modal>
      )}

      {/* PROJECT DETAIL MODAL */}

      {selectedProject && (
        <Modal
          title={selectedProject.name}
          description="Project overview, manager, members, timeline and delivery progress."
          onClose={() => setSelectedProject(null)}
        >
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{projectStatusLabels[selectedProject.status || "PLANNING"] || selectedProject.status || "Planning"}</span>
              {selectedProject.client && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Client: {selectedProject.client}</span>}
            </div>

            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{selectedProject.description || "No description provided."}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailItem label="Project Manager" value={selectedProject.manager?.fullName || "Not assigned"} />
              <DetailItem label="Members" value={String(selectedProject._count?.members ?? selectedProject.members?.length ?? 0)} />
              <DetailItem label="Start Date" value={formatDetailDate(selectedProject.startDate)} />
              <DetailItem label="Due Date" value={formatDetailDate(selectedProject.dueDate)} />
            </div>

            <div>
              <h3 className="text-lg font-black">Team Members</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {(selectedProject.members || []).map((member, index) => member.person ? <span key={`${member.person.id}-${index}`} className="rounded-xl bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">👤 {member.person.fullName}</span> : null)}
                {(!selectedProject.members || selectedProject.members.length === 0) && <p className="text-sm text-slate-400">No members assigned.</p>}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-black">Project Tasks</h3>
              <div className="mt-3 space-y-2">
                {tasks.filter((task) => task.projectId === selectedProject.id).slice(0, 15).map((task) => <button key={task.id} type="button" onClick={() => { setSelectedProject(null); void openTaskDetails(task); }} className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><span className="min-w-0 truncate text-sm font-semibold">#{task.id} — {task.title}</span><span className="ml-3 shrink-0 text-[10px] font-bold text-slate-400">{statusLabels[getStatus(task)] || getStatus(task)}</span></button>)}
                {tasks.filter((task) => task.projectId === selectedProject.id).length === 0 && <p className="text-sm text-slate-400">No tasks in this project.</p>}
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-200 pt-5 dark:border-slate-800">
              <button type="button" onClick={() => { const project = selectedProject; setSelectedProject(null); openEditProject(project); }} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">✏️ Edit Project</button>
            </div>
          </div>
        </Modal>
      )}

      {/* DELETE PROJECT */}

      {deleteProjectId !== null && (
        <ConfirmModal
          title="Delete Project?"
          description="Projects with existing tasks cannot be deleted. If this project has no tasks, it will be permanently removed."
          confirmLabel="Delete Project"
          onCancel={() => setDeleteProjectId(null)}
          onConfirm={deleteProject}
        />
      )}

      {/* DELETE TASK */}

      {deleteTaskId !== null && (
        <ConfirmModal
          title="Delete Task?"
          description="This action will permanently delete the task."
          confirmLabel="Delete Task"
          onCancel={() =>
            setDeleteTaskId(null)
          }
          onConfirm={deleteTask}
        />
      )}

      {/* DEACTIVATE PERSON */}

      {deletePersonId !== null && (
        <ConfirmModal
          title="Deactivate Team Member?"
          description="The person will be deactivated instead of permanently deleted."
          confirmLabel="Deactivate"
          onCancel={() =>
            setDeletePersonId(null)
          }
          onConfirm={deactivatePerson}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* COMPONENTS                                                                 */
/* -------------------------------------------------------------------------- */

function PageHeader({
  eyebrow,
  title,
  description,
  actionLabel,
  onAction,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
          {eyebrow}
        </p>

        <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
          {title}
        </h2>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/15 transition hover:-translate-y-0.5 hover:bg-indigo-700"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  onClick,
}: {
  icon: string;
  label: string;
  value: number;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-lg dark:bg-indigo-950">
          {icon}
        </span>

        <span className="text-2xl font-black tracking-tight">
          {value}
        </span>
      </div>

      <p className="mt-4 text-sm font-bold">
        {label}
      </p>

      <p className="mt-1 text-[11px] text-slate-400">
        {hint}
      </p>
    </button>
  );
}

function MiniStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <span className="text-lg">
          {icon}
        </span>

        <span className="text-2xl font-black">
          {value}
        </span>
      </div>

      <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </p>
    </div>
  );
}

function CapacityRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </span>

      <span className="text-sm font-black">
        {value}
      </span>
    </div>
  );
}

function MetricBox({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
      <p className="text-sm font-black">
        {value}
      </p>

      <p className="mt-0.5 text-[10px] font-medium text-slate-400">
        {label}
      </p>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  value,
  description,
  onClick,
}: {
  icon: string;
  title: string;
  value: number;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between">
        <span className="text-xl">
          {icon}
        </span>

        <span className="text-2xl font-black">
          {value}
        </span>
      </div>

      <p className="mt-3 text-sm font-bold">
        {title}
      </p>

      <p className="mt-1 text-xs text-slate-400">
        {description}
      </p>
    </button>
  );
}

function QuickAiCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-1 hover:border-indigo-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-800"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-lg dark:bg-indigo-950">
        {icon}
      </div>

      <h3 className="mt-3 text-sm font-bold">
        {title}
      </h3>

      <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>

      <span className="mt-3 block text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
        Run AI action →
      </span>
    </button>
  );
}

function EmptyState({
  icon,
  title,
  description,
  buttonLabel,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  buttonLabel?: string;
  onClick?: () => void;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl dark:bg-slate-800">
        {icon}
      </div>

      <h3 className="mt-4 font-bold">
        {title}
      </h3>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
        {description}
      </p>

      {buttonLabel && onClick && (
        <button
          type="button"
          onClick={onClick}
          className="mt-5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
        >
          {buttonLabel}
        </button>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="field-label">
        {label}

        {required && (
          <span className="ml-1 text-red-500">
            *
          </span>
        )}
      </label>

      {children}
    </div>
  );
}

function formatDetailDate(value?: string | null): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString();
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{value}</p>
    </div>
  );
}

function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-black">
              {title}
            </h2>

            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {description}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="scrollbar-thin max-h-[calc(92vh-100px)] overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

function ModalActions({
  cancelLabel,
  submitLabel,
  onCancel,
  disabled,
}: {
  cancelLabel: string;
  submitLabel: string;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex justify-end gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
      <button
        type="button"
        onClick={onCancel}
        disabled={disabled}
        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {cancelLabel}
      </button>

      <button
        type="submit"
        disabled={disabled}
        className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </div>
  );
}

function ConfirmModal({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-xl dark:bg-red-950">
          ⚠️
        </div>

        <h2 className="mt-5 text-xl font-black">
          {title}
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {description}
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}