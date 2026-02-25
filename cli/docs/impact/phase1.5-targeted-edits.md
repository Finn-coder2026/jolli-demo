---
jrn: IMPACT_PHASE15_001
attention:
  - op: file
    path: cli/src/client/commands/impact/ImpactAgentRunner.ts
  - op: file
    path: cli/src/client/commands/AgentToolHost.ts
  - op: file
    path: backend/src/router/AgentConvoRouter.ts
---

# Impact Agent Phase 1.5: Targeted Edits

## Problem

Phase 1 uses `write_file` to update documentation, which:
- Rewrites the entire file even for small changes
- Makes it hard to review what actually changed
- Provides no explanation for why each change was made
- Risks unintended modifications to unrelated content

## Solution

Replace `write_file` with a new `edit_article` tool that:
1. Makes **targeted text replacements** (not whole-file rewrites)
2. Requires **reasoning** for each edit
3. Produces **reviewable patches** in the audit trail

---

## New Tool: `edit_article`

Follows Claude Code's Edit tool pattern: exact string matching with **uniqueness requirement**.

### Schema

```typescript
interface EditArticleTool {
  name: "edit_article";
  arguments: {
    path: string;           // Article path (must match context.article.path)
    edits: Array<{
      old_string: string;   // Exact text to find (MUST be unique in file)
      new_string: string;   // Replacement text
      reason: string;       // Why this change is needed
    }>;
  };
}
```

### Key Design Principles (from Claude Code)

1. **Exact matching**: `old_string` must match character-for-character (whitespace, newlines, etc.)
2. **Uniqueness required**: If `old_string` appears multiple times → edit **fails**
3. **Include context padding**: Agent must include enough surrounding text to ensure uniqueness
4. **No fuzzy matching**: Safer, more predictable behavior

### Example Usage

```json
{
  "name": "edit_article",
  "arguments": {
    "path": "docs/auth/login.md",
    "edits": [
      {
        "old_string": "## Authentication\n\nThe login endpoint accepts username and password.",
        "new_string": "## Authentication\n\nThe login endpoint accepts username, password, and an optional MFA token.",
        "reason": "Code change added MFA token parameter to login function"
      },
      {
        "old_string": "## Parameters\n\n| Name | Type | Required |\n|------|------|----------|",
        "new_string": "## Parameters\n\n| Name | Type | Required |\n|------|------|----------|\n| mfaToken | string | No |",
        "reason": "Document new optional mfaToken parameter"
      }
    ]
  }
}
```

**Note**: The `old_string` includes the section headers ("## Authentication", "## Parameters") as **context padding** to ensure uniqueness. A simple sentence like "The login endpoint..." might appear elsewhere.

### Execution Behavior

1. Read current file content
2. For each edit in order:
   - Count occurrences of `old_string` in content
   - If count == 0 → error "Text not found"
   - If count > 1 → error "Text not unique - include more context"
   - If count == 1 → replace with `new_string`
3. Write updated content
4. Return summary of applied edits with reasons

### Error Handling

**Text not found:**
```json
{
  "success": false,
  "error": "Edit 0: Text not found in file. The old_string you provided does not exist in the file.\n\nActual file content:\n```\n[first 500 chars of file]...\n```\n\nPlease use exact text from the file above."
}
```

*Note: The error message includes a preview of the actual file content (first 500 characters) to help the agent self-correct without needing an additional read_file call.*

**Text not unique (appears multiple times):**
```json
{
  "success": false,
  "error": "Edit 0: Text appears 3 times in file - include more surrounding context to make it unique",
  "hint": "Add a heading, preceding paragraph, or other unique text to old_string"
}
```

---

## Updated System Prompt

Add to impact agent prompt:

```
## Making Changes

Use the `edit_article` tool to make targeted changes. Do NOT use `write_file`.

For each edit, provide:
- `old_string`: The exact text to replace (copy from the file exactly, including enough context to be UNIQUE)
- `new_string`: The new text
- `reason`: Brief explanation linking the change to the code diff

IMPORTANT: The old_string MUST be unique in the file. If your text might appear multiple times,
include surrounding context (like a heading or preceding paragraph) to make it unique.

Example:
- Code change: Added `timeout` parameter to `fetchData()`
- Good old_string: "## API Reference\n\nThe fetchData function accepts a URL parameter."
- Bad old_string: "The fetchData function" (too short, might match elsewhere)

Guidelines:
- Make minimal, focused edits
- Include enough context in old_string for uniqueness (err on the side of more context)
- Preserve formatting exactly (whitespace, newlines matter)
- One logical change per edit entry
- If no changes needed, explain why and don't call edit_article
```

---

## Implementation Changes

### 1. AgentToolHost.ts

Add `edit_article` tool handler with uniqueness check:

```typescript
async function executeEditArticle(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const { path, edits } = args as {
    path: string;
    edits: Array<{ old_string: string; new_string: string; reason: string }>;
  };

  // Read current content
  const absolutePath = validatePath(filePath, context.workspaceRoot);
  const file = Bun.file(absolutePath);

  if (!(await file.exists())) {
    return { success: false, output: "", error: `File not found: ${filePath}` };
  }

  let content = await file.text();
  let updated = content;
  const appliedEdits: Array<{ index: number; reason: string }> = [];

  // Apply edits in order
  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];

    // Count occurrences to check uniqueness
    const occurrences = updated.split(edit.old_string).length - 1;

    if (occurrences === 0) {
      // Include a snippet of the actual file content to help the agent self-correct
      const preview = content.length > 500 ? `${content.slice(0, 500)}...\n\n[File truncated - ${content.length} chars total]` : content;
      return {
        success: false,
        output: "",
        error: `Edit ${i}: Text not found in file. The old_string you provided does not exist in the file.\n\nActual file content:\n\`\`\`\n${preview}\n\`\`\`\n\nPlease use exact text from the file above.`
      };
    }

    if (occurrences > 1) {
      return {
        success: false,
        error: `Edit ${i}: Text appears ${occurrences} times - include more context to make it unique`,
        hint: "Add surrounding text (heading, preceding line) to old_string"
      };
    }

    // Safe to replace - exactly one occurrence
    updated = updated.replace(edit.old_string, edit.new_string);
    appliedEdits.push({ index: i, reason: edit.reason });
  }

  // Write updated content
  const dir = path.dirname(absolutePath);
  await Bun.---
jrn: IMPACT_PHASE15_001
attention:
  - op: file
    path: cli/src/client/commands/impact/ImpactAgentRunner.ts
  - op: file
    path: cli/src/client/commands/AgentToolHost.ts
  - op: file
    path: backend/src/router/AgentConvoRouter.ts
---

# Impact Agent Phase 1.5: Targeted Edits

## Problem

Phase 1 uses `write_file` to update documentation, which:
- Rewrites the entire file even for small changes
- Makes it hard to review what actually changed
- Provides no explanation for why each change was made
- Risks unintended modifications to unrelated content

## Solution

Replace `write_file` with a new `edit_article` tool that:
1. Makes **targeted text replacements** (not whole-file rewrites)
2. Requires **reasoning** for each edit
3. Produces **reviewable patches** in the audit trail

---

## New Tool: `edit_article`

Follows Claude Code's Edit tool pattern: exact string matching with **uniqueness requirement**.

### Schema

```typescript
interface EditArticleTool {
  name: "edit_article";
  arguments: {
    path: string;           // Article path (must match context.article.path)
    edits: Array<{
      old_string: string;   // Exact text to find (MUST be unique in file)
      new_string: string;   // Replacement text
      reason: string;       // Why this change is needed
    }>;
  };
}
```

### Key Design Principles (from Claude Code)

1. **Exact matching**: `old_string` must match character-for-character (whitespace, newlines, etc.)
2. **Uniqueness required**: If `old_string` appears multiple times → edit **fails**
3. **Include context padding**: Agent must include enough surrounding text to ensure uniqueness
4. **No fuzzy matching**: Safer, more predictable behavior

### Example Usage

```json
{
  "name": "edit_article",
  "arguments": {
    "path": "docs/auth/login.md",
    "edits": [
      {
        "old_string": "## Authentication\n\nThe login endpoint accepts username and password.",
        "new_string": "## Authentication\n\nThe login endpoint accepts username, password, and an optional MFA token.",
        "reason": "Code change added MFA token parameter to login function"
      },
      {
        "old_string": "## Parameters\n\n| Name | Type | Required |\n|------|------|----------|",
        "new_string": "## Parameters\n\n| Name | Type | Required |\n|------|------|----------|\n| mfaToken | string | No |",
        "reason": "Document new optional mfaToken parameter"
      }
    ]
  }
}
```

**Note**: The `old_string` includes the section headers ("## Authentication", "## Parameters") as **context padding** to ensure uniqueness. A simple sentence like "The login endpoint..." might appear elsewhere.

### Execution Behavior

1. Read current file content
2. For each edit in order:
   - Count occurrences of `old_string` in content
   - If count == 0 → error "Text not found"
   - If count > 1 → error "Text not unique - include more context"
   - If count == 1 → replace with `new_string`
3. Write updated content
4. Return summary of applied edits with reasons

### Error Handling

**Text not found:**
```json
{
  "success": false,
  "error": "Edit 0: Text not found in file. The old_string you provided does not exist in the file.\n\nActual file content:\n```\n[first 500 chars of file]...\n```\n\nPlease use exact text from the file above."
}
```

*Note: The error message includes a preview of the actual file content (first 500 characters) to help the agent self-correct without needing an additional read_file call.*

**Text not unique (appears multiple times):**
```json
{
  "success": false,
  "error": "Edit 0: Text appears 3 times in file - include more surrounding context to make it unique",
  "hint": "Add a heading, preceding paragraph, or other unique text to old_string"
}
```

---

## Updated System Prompt

Add to impact agent prompt:

```
## Making Changes

Use the `edit_article` tool to make targeted changes. Do NOT use `write_file`.

For each edit, provide:
- `old_string`: The exact text to replace (copy from the file exactly, including enough context to be UNIQUE)
- `new_string`: The new text
- `reason`: Brief explanation linking the change to the code diff

IMPORTANT: The old_string MUST be unique in the file. If your text might appear multiple times,
include surrounding context (like a heading or preceding paragraph) to make it unique.

Example:
- Code change: Added `timeout` parameter to `fetchData()`
- Good old_string: "## API Reference\n\nThe fetchData function accepts a URL parameter."
- Bad old_string: "The fetchData function" (too short, might match elsewhere)

Guidelines:
- Make minimal, focused edits
- Include enough context in old_string for uniqueness (err on the side of more context)
- Preserve formatting exactly (whitespace, newlines matter)
- One logical change per edit entry
- If no changes needed, explain why and don't call edit_article
```

---

## Implementation Changes

### 1. AgentToolHost.ts

Add `edit_article` tool handler with uniqueness check:

```typescript
async function executeEditArticle(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const { path, edits } = args as {
    path: string;
    edits: Array<{ old_string: string; new_string: string; reason: string }>;
  };

  // Read current content
  const absolutePath = validatePath(filePath, context.workspaceRoot);
  const file = Bun.file(absolutePath);

  if (!(await file.exists())) {
    return { success: false, output: "", error: `File not found: ${filePath}` };
  }

  let content = await file.text();
  let updated = content;
  const appliedEdits: Array<{ index: number; reason: string }> = [];

  // Apply edits in order
  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];

    // Count occurrences to check uniqueness
    const occurrences = updated.split(edit.old_string).length - 1;

    if (occurrences === 0) {
      // Include a snippet of the actual file content to help the agent self-correct
      const preview = content.length > 500 ? `${content.slice(0, 500)}...\n\n[File truncated - ${content.length} chars total]` : content;
      return {
        success: false,
        output: "",
        error: `Edit ${i}: Text not found in file. The old_string you provided does not exist in the file.\n\nActual file content:\n\`\`\`\n${preview}\n\`\`\`\n\nPlease use exact text from the file above.`
      };
    }

    if (occurrences > 1) {
      return {
        success: false,
        error: `Edit ${i}: Text appears ${occurrences} times - include more context to make it unique`,
        hint: "Add surrounding text (heading, preceding line) to old_string"
      };
    }

    // Safe to replace - exactly one occurrence
    updated = updated.replace(edit.old_string, edit.new_string);
    appliedEdits.push({ index: i, reason: edit.reason });
  }

mkdir -p ${dir}`.quiet();
  await Bun.write(absolutePath, content);

  const result: EditArticleResult = {
    success: true,
    output: `Applied ${appliedEdits.length} edit${appliedEdits.length !== 1 ? "s" : ""} to ${filePath}`,
    appliedEdits
  };
  return result;
}
```

### 2. ImpactAgentRunner.ts

Track edit reasons in audit:

```typescript
// In wrappedExecute (tool host wrapper)
if (toolName === "edit_article" && result.success) {
  const filePath = args.path as string;
  if (filePath) {
    // Read the updated file content for diff generation
    try {
      const updatedPath = path.join(workspaceRoot, filePath);
      const updatedContent = await fs.readFile(updatedPath, "utf8");
      state.writtenFiles.set(filePath, updatedContent);
    } catch {
      // Fall back to marking as edited if read fails
      state.writtenFiles.set(filePath, "edited");
    }
    // Extract and store edit reasons from the result
    const editResult = result as EditArticleResult;
    if (editResult.appliedEdits) {
      for (const edit of editResult.appliedEdits) {
        state.editReasons.push(edit.reason);
      }
    }
  }
}
```

### 3. AuditTrail.ts

Extend audit entry:

```typescript
interface ArticleAuditEntry {
  // ... existing fields
  editReasons?: Array<string>;  // NEW: Reasons for each edit
}
```

### 4. AgentConvoRouter.ts

Update tool manifest for impact mode:

```typescript
const impactTools = [
  {
    name: "read_file",
    description: "Read a file from the workspace",
    // ...
  },
  {
    name: "edit_article",
    description: "Make targeted edits to the documentation article. Each edit must have a unique old_string.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the article" },
        edits: {
          type: "array",
          items: {
            type: "object",
            properties: {
              old_string: {
                type: "string",
                description: "Exact text to find. MUST be unique in the file - include surrounding context if needed"
              },
              new_string: { type: "string", description: "Replacement text" },
              reason: { type: "string", description: "Why this change is needed (reference the code change)" }
            },
            required: ["old_string", "new_string", "reason"]
          }
        }
      },
      required: ["path", "edits"]
    }
  }
];
```

---

## Audit Trail Improvements

### Before (Phase 1)
```json
{
  "status": "updated",
  "patch": "--- a/docs/auth.md\n+++ b/docs/auth.md\n@@ -10,3 +10,5 @@\n..."
}
```

### After (Phase 1.5)
```json
{
  "status": "updated",
  "patch": "--- a/docs/auth.md\n+++ b/docs/auth.md\n@@ -10,3 +10,5 @@\n...",
  "editReasons": [
    "Document new timeout parameter added in commit abc123",
    "Update example to show MFA token usage"
  ]
}
```

---

## Migration Path

1. **Keep `write_file` available** as fallback for edge cases (new files, major rewrites)
2. **Default to `edit_article`** in system prompt
3. **Track tool usage** in analytics to measure adoption

---

## Benefits

| Aspect | Phase 1 (write_file) | Phase 1.5 (edit_article) |
|--------|---------------------|--------------------------|
| Change scope | Entire file | Targeted sections |
| Reviewability | Diff entire file | See each edit + reason |
| Risk | May change unrelated | Minimal blast radius |
| Audit trail | Just the patch | Patch + reasoning |
| Debugging | "Why did it change X?" | Explicit per-edit reasons |

---

## Design Decisions

1. **Multi-occurrence handling**: ✅ **Require unique match, error if ambiguous**
   - Follows Claude Code's pattern
   - Safer - no accidental replacements
   - Agent must include enough context to make matches unique

2. **Fuzzy matching**: ✅ **No** - exact match only
   - More predictable, safer behavior
   - Whitespace matters - agent must copy exactly

3. **Batching**: ✅ **Atomic** - all edits succeed or none applied
   - Roll back on first failure
   - Prevents partial/broken state
