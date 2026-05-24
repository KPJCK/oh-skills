// src/skills/nice/dag.ts
//
// Pure functions for parsing plan.md into a DAG of TaskNodes and
// validating that DAG. No I/O. Consumed by commands/plan.ts (post-plan
// validation) and commands/go.ts (parallel dispatch).

export type TaskNode = {
  id: string;
  title: string;
  creates: string[];
  modifies: string[];
  dependsOn: string[];
  bodyStart: number; // 1-based line number of the `### Task` heading
};

export type Dag = {
  nodes: Map<string, TaskNode>;
  order: string[]; // task IDs in source order
};

const TASK_HEADING_RE = /^###\s+Task\s+([a-z0-9][a-z0-9-]*):\s*(.+?)\s*$/;
const FILES_HEADING_RE = /^\*\*Files:\*\*\s*$/;
const DEPENDS_HEADING_RE = /^\*\*Depends-on:\*\*\s*$/;
const BULLET_RE = /^\s*[-*]\s+(.+?)\s*$/;
const STEP_RE = /^\s*[-*]\s+\[[ x]\]/; // task step checkbox — ends a field block
const CREATE_RE = /^Create:\s*(.+?)\s*$/i;
const MODIFY_RE = /^Modify:\s*(.+?)\s*$/i;

type FieldKind = "files" | "depends" | null;

export function parsePlan(planMd: string): Dag {
  const lines = planMd.split("\n");
  const nodes = new Map<string, TaskNode>();
  const order: string[] = [];

  let current: TaskNode | null = null;
  let field: FieldKind = null;

  const finishCurrent = () => {
    if (current) {
      nodes.set(current.id, current);
      order.push(current.id);
    }
    current = null;
    field = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNo = i + 1;

    const headingMatch = line.match(TASK_HEADING_RE);
    if (headingMatch) {
      finishCurrent();
      current = {
        id: headingMatch[1]!,
        title: headingMatch[2]!,
        creates: [],
        modifies: [],
        dependsOn: [],
        bodyStart: lineNo,
      };
      field = null;
      continue;
    }

    if (!current) continue;

    if (FILES_HEADING_RE.test(line)) {
      field = "files";
      continue;
    }
    if (DEPENDS_HEADING_RE.test(line)) {
      field = "depends";
      continue;
    }

    if (field === null) continue;

    const trimmed = line.trim();
    if (trimmed === "") continue; // tolerate blank lines inside a field
    if (STEP_RE.test(line)) {
      // task step checkbox ends the field block
      field = null;
      continue;
    }
    const bullet = line.match(BULLET_RE);
    if (!bullet) {
      // a non-bullet, non-blank line ends the field
      field = null;
      continue;
    }
    const value = bullet[1]!;

    if (field === "files") {
      const created = value.match(CREATE_RE);
      const modified = value.match(MODIFY_RE);
      if (created) current.creates.push(created[1]!);
      else if (modified) current.modifies.push(modified[1]!);
      // any other bullet shape is ignored (validator will catch missing files if needed)
    } else if (field === "depends") {
      if (value.trim().toLowerCase() === "none") continue;
      current.dependsOn.push(value.trim());
    }
  }
  finishCurrent();

  return { nodes, order };
}

export function validateUniqueIds(dag: Dag): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of dag.order) {
    if (seen.has(id)) dupes.add(id);
    else seen.add(id);
  }
  return [...dupes].map((id) => `duplicate task ID: ${id}`);
}

export function validateMissingFields(dag: Dag): string[] {
  // We can't tell "missing block" from "empty block" after parsing without
  // re-scanning. Heuristic: treat "no creates AND no modifies" as missing-Files,
  // and "no dependsOn AND no explicit 'none'" as ambiguous — but since `none`
  // also yields []  we can't distinguish. Accept that this validator catches
  // only missing-Files; missing-Depends-on is impossible to detect from the
  // parsed DAG alone. (If we need stricter detection later, parsePlan can
  // record which fields it actually saw.)
  const errs: string[] = [];
  for (const node of dag.nodes.values()) {
    if (node.creates.length === 0 && node.modifies.length === 0) {
      errs.push(
        `task '${node.id}' (line ${node.bodyStart}) has no Files declared`,
      );
    }
  }
  return errs;
}

export function validateDependsOnExist(dag: Dag): string[] {
  const errs: string[] = [];
  for (const node of dag.nodes.values()) {
    for (const dep of node.dependsOn) {
      if (!dag.nodes.has(dep)) {
        errs.push(
          `task '${node.id}' depends on unknown task '${dep}'`,
        );
      }
    }
  }
  return errs;
}

export function validateNoCycle(dag: Dag): string[] {
  // Kahn's algorithm: repeatedly remove zero-indegree nodes.
  // If any node remains at the end, those nodes are in (or downstream of) a cycle.
  const indegree = new Map<string, number>();
  for (const id of dag.nodes.keys()) indegree.set(id, 0);
  for (const node of dag.nodes.values()) {
    for (const dep of node.dependsOn) {
      if (dag.nodes.has(dep)) {
        // increment THIS node's indegree (it depends on dep, so dep → node)
        indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of indegree) {
    if (deg === 0) queue.push(id);
  }

  const removed = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    removed.add(id);
    // for every node that depends on `id`, decrement its indegree
    for (const other of dag.nodes.values()) {
      if (other.dependsOn.includes(id) && !removed.has(other.id)) {
        const d = (indegree.get(other.id) ?? 0) - 1;
        indegree.set(other.id, d);
        if (d === 0) queue.push(other.id);
      }
    }
  }

  const stuck = [...dag.nodes.keys()].filter((id) => !removed.has(id));
  if (stuck.length === 0) return [];
  return [`cycle detected among tasks: ${stuck.sort().join(", ")}`];
}

export function validateNoCreateCollisions(dag: Dag): string[] {
  const owners = new Map<string, string[]>(); // file → task IDs
  for (const node of dag.nodes.values()) {
    for (const f of node.creates) {
      const list = owners.get(f) ?? [];
      list.push(node.id);
      owners.set(f, list);
    }
  }
  const errs: string[] = [];
  for (const [file, ids] of owners) {
    if (ids.length > 1) {
      errs.push(
        `file '${file}' is Created by multiple tasks: ${ids.join(", ")}`,
      );
    }
  }
  return errs;
}

export function validateModifyEdgesAreOrdered(dag: Dag): string[] {
  // Build transitive-dependency closures for every node.
  const closure = new Map<string, Set<string>>();
  function depsOf(id: string): Set<string> {
    const cached = closure.get(id);
    if (cached) return cached;
    const seen = new Set<string>();
    const stack: string[] = [...(dag.nodes.get(id)?.dependsOn ?? [])];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const d of dag.nodes.get(cur)?.dependsOn ?? []) stack.push(d);
    }
    closure.set(id, seen);
    return seen;
  }

  // Map each modified file to the list of task IDs that modify it.
  const modifiers = new Map<string, string[]>();
  for (const node of dag.nodes.values()) {
    for (const f of node.modifies) {
      const list = modifiers.get(f) ?? [];
      list.push(node.id);
      modifiers.set(f, list);
    }
  }

  const errs: string[] = [];
  for (const [file, ids] of modifiers) {
    if (ids.length < 2) continue;
    // For each unordered pair, verify one transitively depends on the other.
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]!;
        const b = ids[j]!;
        const aDepsB = depsOf(a).has(b);
        const bDepsA = depsOf(b).has(a);
        if (!aDepsB && !bDepsA) {
          errs.push(
            `file '${file}' is Modified by tasks '${a}' and '${b}' but neither depends on the other`,
          );
        }
      }
    }
  }
  return errs;
}

export function nextReadySet(dag: Dag, done: Set<string>): TaskNode[] {
  // Preserve source order so deterministic ordering surfaces in dispatch.
  const ready: TaskNode[] = [];
  for (const id of dag.order) {
    const node = dag.nodes.get(id);
    if (!node) continue;
    if (done.has(id)) continue;
    if (node.dependsOn.every((d) => done.has(d))) {
      ready.push(node);
    }
  }
  return ready;
}

export function validateReadySetFileSafety(set: TaskNode[]): string[] {
  const owners = new Map<string, string[]>();
  for (const node of set) {
    for (const f of [...node.creates, ...node.modifies]) {
      const list = owners.get(f) ?? [];
      list.push(node.id);
      owners.set(f, list);
    }
  }
  const errs: string[] = [];
  for (const [file, ids] of owners) {
    if (ids.length > 1) {
      errs.push(
        `ready-set file collision: '${file}' is touched by tasks ${ids.join(", ")} — cannot dispatch in parallel`,
      );
    }
  }
  return errs;
}
