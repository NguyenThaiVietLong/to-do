import { addDays, todayISO } from "./date";
import type { AppState, Task, TaskList } from "./types";

/**
 * First-run sample data. A brand-new install with an empty dashboard teaches
 * nothing, so we seed a year of history — but from a fixed PRNG seed, so the
 * charts look the same every time you reset and the layout can be eyeballed.
 */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const LISTS: TaskList[] = [
  { id: "tasks", name: "Tasks", icon: "🏠" },
  { id: "work", name: "Work", icon: "💼" },
  { id: "groceries", name: "Groceries", icon: "🛒" },
  { id: "personal", name: "Personal", icon: "🌿" },
  { id: "study", name: "Study", icon: "📚" },
];

const OPEN_TASKS: Record<string, string[]> = {
  tasks: [
    "Renew passport",
    "Book dentist appointment",
    "Reply to landlord about the lease",
    "Back up the laptop",
  ],
  work: [
    "Write the Q3 planning doc",
    "Review the auth pull request",
    "Prepare Monday stand-up notes",
    "Follow up with the design team",
    "Fix the flaky checkout test",
  ],
  groceries: ["Olive oil", "Greek yoghurt", "Coffee beans", "Rice", "Tomatoes"],
  personal: [
    "Call Mum on Sunday",
    "Plan the weekend hike",
    "Sort out gym membership",
  ],
  study: [
    "Finish IELTS writing task 2",
    "Review React server components",
    "Practise listening for 30 minutes",
    "Read one chapter of the SQL book",
  ],
};

const DONE_TASKS: Record<string, string[]> = {
  tasks: ["Take out the bins", "Water the plants", "Pay the electricity bill", "Tidy the desk"],
  work: ["Ship the release notes", "Close three support tickets", "Update the roadmap", "Run the deploy", "Refactor the date helpers"],
  groceries: ["Milk", "Bread", "Eggs", "Bananas", "Pasta", "Chicken"],
  personal: ["Morning run", "Read 20 pages", "Meditate for 10 minutes", "Stretch"],
  study: ["Vocabulary drill", "Grammar exercise", "Watch one lecture", "Flashcard review"],
};

const STEPS: Record<string, string[]> = {
  "Write the Q3 planning doc": ["Collect team input", "Draft the outline", "Share for review"],
  "Plan the weekend hike": ["Pick the trail", "Check the weather", "Pack the bag"],
  "Finish IELTS writing task 2": ["Read the question", "Plan the paragraphs", "Write and time it"],
};

export function buildSeed(): AppState {
  const rand = mulberry32(20260719);
  const today = todayISO();
  const tasks: Task[] = [];
  let n = 0;
  const id = () => `t${(n += 1)}`;

  // --- Open tasks -----------------------------------------------------------
  for (const list of LISTS) {
    for (const title of OPEN_TASKS[list.id] ?? []) {
      const r = rand();
      const hasDue = r > 0.35;
      tasks.push({
        id: id(),
        listId: list.id,
        title,
        note: "",
        completed: false,
        completedAt: null,
        createdAt: addDays(today, -Math.floor(rand() * 20) - 1),
        // A couple land in the past on purpose so "overdue" styling is visible.
        dueDate: hasDue ? addDays(today, Math.floor(rand() * 10) - 2) : null,
        myDay: rand() > 0.62,
        important: rand() > 0.75,
        steps: (STEPS[title] ?? []).map((s, i) => ({
          id: `${id()}s${i}`,
          title: s,
          done: i === 0 && rand() > 0.5,
        })),
      });
    }
  }

  // --- A year of completions, so the heatmap and the bar chart have shape ----
  const DAYS = 371; // 53 whole weeks
  const listIds = LISTS.map((l) => l.id);

  for (let back = DAYS - 1; back >= 0; back--) {
    const date = addDays(today, -back);
    const dow = new Date(fromParts(date)).getDay();
    const weekend = dow === 0 || dow === 6;

    // Weekends are quieter; a slow ramp makes the recent months look busier.
    const momentum = 0.45 + (0.55 * (DAYS - back)) / DAYS;
    let count = Math.floor(rand() * (weekend ? 3 : 6) * momentum);

    // Two gap weeks read as a holiday and make the streak logic visible.
    if (back > 96 && back < 111) count = 0;
    // Guarantee an unbroken run up to today so "current streak" is non-zero.
    if (back < 9) count = Math.max(count, 1 + Math.floor(rand() * 3));

    for (let i = 0; i < count; i++) {
      const listId = listIds[Math.floor(rand() * listIds.length)];
      const pool = DONE_TASKS[listId];
      const title = pool[Math.floor(rand() * pool.length)];
      tasks.push({
        id: id(),
        listId,
        title,
        note: "",
        completed: true,
        completedAt: date,
        createdAt: addDays(date, -Math.floor(rand() * 4)),
        dueDate: rand() > 0.5 ? date : null,
        myDay: false,
        important: rand() > 0.88,
        steps: [],
      });
    }
  }

  // No sample roadmaps: a roadmap starts counting from the day it is switched
  // on, so a seeded one would open at 0% against a year of history behind it.
  return { lists: LISTS, tasks, roadmaps: [] };
}

function fromParts(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}
