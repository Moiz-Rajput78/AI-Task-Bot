import prisma from "../lib/prisma";

export type AssignmentCandidate = {
  personId: number;
  name: string;
  email: string;
  department: string | null;
  role: string | null;
  experience: number;
  availability: string;
  skills: string[];
  activeTaskCount: number;

  skillMatch: number;
  departmentMatch: number;
  availabilityScore: number;
  workloadScore: number;
  experienceScore: number;

  totalScore: number;
};

function calculateSkillMatch(
  requiredSkills: string[],
  personSkills: string[]
): number {
  if (requiredSkills.length === 0) {
    return 100;
  }

  const normalizedRequired =
    requiredSkills.map((skill) =>
      skill.trim().toLowerCase()
    );

  const normalizedPersonSkills =
    personSkills.map((skill) =>
      skill.trim().toLowerCase()
    );

  const matchedSkills =
    normalizedRequired.filter((requiredSkill) =>
      normalizedPersonSkills.some(
        (personSkill) =>
          personSkill === requiredSkill ||
          personSkill.includes(requiredSkill) ||
          requiredSkill.includes(personSkill)
      )
    );

  return Math.round(
    (matchedSkills.length /
      normalizedRequired.length) *
      100
  );
}

function calculateDepartmentMatch(
  taskDepartment: string | null,
  personDepartment: string | null
): number {
  if (!taskDepartment) {
    return 100;
  }

  if (!personDepartment) {
    return 0;
  }

  return taskDepartment
    .trim()
    .toLowerCase() ===
    personDepartment.trim().toLowerCase()
    ? 100
    : 0;
}

function calculateAvailabilityScore(
  availability: string
): number {
  switch (availability) {
    case "AVAILABLE":
      return 100;

    case "PARTIALLY_AVAILABLE":
      return 60;

    case "BUSY":
      return 20;

    case "ON_LEAVE":
      return 0;

    case "INACTIVE":
      return 0;

    default:
      return 0;
  }
}

function calculateWorkloadScore(
  activeTaskCount: number
): number {
  /*
   * Fewer active tasks = better workload score.
   *
   * 0 tasks  -> 100
   * 1 task   -> 50
   * 2 tasks  -> 33
   * 3 tasks  -> 25
   * etc.
   */

  return Math.round(
    100 / (1 + activeTaskCount)
  );
}

function calculateExperienceScore(
  experience: number,
  maximumExperience: number
): number {
  if (maximumExperience <= 0) {
    return 100;
  }

  return Math.round(
    Math.min(
      experience / maximumExperience,
      1
    ) * 100
  );
}

export async function recommendTaskAssignees(
  taskId: number
): Promise<{
  task: {
    id: number;
    title: string;
    description: string | null;
    department: string | null;
    requiredSkills: string[];
  };

  candidates: AssignmentCandidate[];

  bestCandidate: AssignmentCandidate | null;
}> {
  // ==========================================
  // GET TASK
  // ==========================================

  const task = await prisma.task.findUnique({
    where: {
      id: taskId,
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

  if (!task) {
    throw new Error("Task not found");
  }

  const requiredSkills =
    task.skills.map(
      (item) => item.skill.name
    );

  // ==========================================
  // GET ACTIVE PEOPLE
  // ==========================================

  const people = await prisma.person.findMany({
    where: {
      isActive: true,
    },

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
            select: {
              id: true,
              status: true,
            },
          },
        },
      },
    },

    orderBy: {
      fullName: "asc",
    },
  });

  // ==========================================
  // MAX EXPERIENCE
  // ==========================================

  const maximumExperience =
    people.reduce(
      (maximum, person) =>
        Math.max(
          maximum,
          person.experience
        ),
      0
    );

  // ==========================================
  // SCORE EVERY PERSON
  // ==========================================

  const candidates: AssignmentCandidate[] =
    people.map((person) => {
      const personSkills =
        person.skills.map(
          (item) => item.skill.name
        );

      const activeTaskCount =
        person.assignedTasks.filter(
          (assignment) =>
            assignment.task.status !==
            "COMPLETED"
        ).length;

      const skillMatch =
        calculateSkillMatch(
          requiredSkills,
          personSkills
        );

      const departmentMatch =
        calculateDepartmentMatch(
          task.department?.name ?? null,
          person.department?.name ?? null
        );

      const availabilityScore =
        calculateAvailabilityScore(
          person.availability
        );

      const workloadScore =
        calculateWorkloadScore(
          activeTaskCount
        );

      const experienceScore =
        calculateExperienceScore(
          person.experience,
          maximumExperience
        );

      // ========================================
      // FINAL SCORE
      // ========================================

      const totalScore =
        skillMatch * 0.4 +
        departmentMatch * 0.2 +
        availabilityScore * 0.15 +
        workloadScore * 0.15 +
        experienceScore * 0.1;

      return {
        personId: person.id,

        name: person.fullName,

        email: person.email,

        department:
          person.department?.name ??
          null,

        role: person.role,

        experience:
          person.experience,

        availability:
          person.availability,

        skills: personSkills,

        activeTaskCount,

        skillMatch,

        departmentMatch,

        availabilityScore,

        workloadScore,

        experienceScore,

        totalScore:
          Math.round(
            totalScore * 100
          ) / 100,
      };
    });

  // ==========================================
  // RANK CANDIDATES
  // ==========================================

  candidates.sort(
    (a, b) =>
      b.totalScore -
      a.totalScore
  );

  const bestCandidate =
    candidates.length > 0
      ? candidates[0]
      : null;

  return {
    task: {
      id: task.id,
      title: task.title,
      description: task.description,

      department:
        task.department?.name ??
        null,

      requiredSkills,
    },

    candidates,

    bestCandidate,
  };
}