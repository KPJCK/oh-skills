# Sample Parallel Plan

**Goal:** test fixture.

---

### Task types-define: define shared types

**Files:**

- Create: src/types.ts

**Depends-on:**

- none

- [ ] **Step 1: Write the failing test**

(steps elided for fixture brevity)

### Task parser-tokenize: tokenize source

**Files:**

- Create: src/parser/tokenize.ts
- Create: tests/parser/tokenize.test.ts

**Depends-on:**

- types-define

- [ ] **Step 1: Write the failing test**

(steps elided)

### Task renderer-init: scaffold renderer

**Files:**

- Create: src/renderer.ts

**Depends-on:**

- types-define

(steps elided)

### Task index-wire: wire parser + renderer in index

**Files:**

- Modify: src/index.ts

**Depends-on:**

- parser-tokenize
- renderer-init

(steps elided)
