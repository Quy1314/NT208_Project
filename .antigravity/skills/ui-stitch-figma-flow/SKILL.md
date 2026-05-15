---
name: ui-stitch-figma-flow
description: Run a one-screen UI workflow end-to-end in autopilot mode: infer brief, call Stitch MCP directly, refine with Figma MCP directly, then update project code to match the existing stack (e.g. JS/TS/C#). Use when user asks for Stitch -> Figma -> code update flow without prompt preview.
---

# UI Stitch Figma Flow

## Purpose
Execute one-screen workflow directly (no prompt preview):
1. Normalize brief from user input (or infer defaults).
2. Call Stitch MCP directly to generate screen output.
3. Send Stitch result directly to Figma MCP for refinement.
4. Update project code to match the refined design and existing codebase conventions.
5. Run targeted validation (lint/build/test where relevant).

## Trigger Scenarios
Use this skill when user asks for:
- "stitch -> figma flow"
- "design 1 screen from brief"
- "generate prompt for Stitch MCP"
- "refine Stitch HTML/CSS in Figma MCP"
- "web/app/mobile screen design workflow"
- Explicit mention of `@design_ui` (treat as strong trigger signal)

## Accepted Input
- Project topic (required)
- Project type: `web` | `app` | `mobile app` (required)
- Screen goal (required, one screen only), for example:
  - login page
  - landing page
  - admin dashboard
  - settings page
  - checkout page
- Optional style direction:
  - modern, minimal, enterprise, fintech, education, dark mode, luxury

If input is short or vague, infer sensible defaults from project type and screen goal.

## Behavioral Rules
- Always produce **exactly one screen**.
- **Autopilot by default**: do not send prompt drafts to user for pre-review.
- Directly execute this sequence:
  - Cursor -> Stitch MCP -> HTML/CSS -> Cursor -> Figma MCP -> update local project code
- For HTML-to-Figma capture, always use **full-screen capture** by default:
  - capture the full page (`body`) instead of partial selector blocks
  - prefer viewport/page-level capture for landing pages unless user explicitly asks otherwise
- Infer project stack from repository and update code accordingly:
  - JS/TS: React/Next/Vue conventions and existing components/styles
  - C#: ASP.NET/Razor/Blazor conventions and existing architecture
- Reuse existing components, tokens, styles, naming, and folder structure when possible.
- Keep changes surgical and production-oriented; avoid unrelated refactors.
- Ask user only when a critical input is truly missing (e.g., no target screen and cannot infer).

## Output Format (Always)
Return exactly 4 sections in this order:

### 1) Brief chuẩn hóa
- Topic
- Project type
- Target screen
- Primary users
- Core purpose
- Key sections + hierarchy
- Style direction

### 2) MCP Execution Log (Autopilot)
- Stitch MCP: tool(s) called + key output summary
- Figma MCP: tool(s) called + key refinement summary
- Confirm no prompt-preview step was used

### 3) Code Update Plan theo Stack dự án
- Detected stack and framework from repository
- Files to update and mapping from refined design -> code
- Notes for JS/TS or C# adaptation based on existing project conventions

### 4) Kết quả cập nhật + kiểm tra
- What was changed in code
- Validation performed (lint/build/test/manual)
- Remaining gaps or follow-up items

## Stitch Prompt Template
Use this template and fill placeholders:

```text
You are designing one UI screen for a {project_type} product.

Project topic: {project_topic}
Target screen: {screen_goal}
Style direction: {style_or_inferred}

Design objective:
- Create exactly one production-oriented screen.
- Prioritize clarity, hierarchy, and realistic UX structure.

Required output:
1) Semantic, clean HTML for one screen only.
2) Organized CSS with clear section grouping.
3) Structure suitable for direct refinement in Figma MCP.

Screen requirements:
- Define top-level layout and section hierarchy.
- Include key sections needed for {screen_goal}.
- Include primary and secondary CTA placement.
- Include basic states (hover/focus/active/disabled/loading/empty/error where relevant).
- Use consistent spacing, typography, and visual rhythm.
- Keep naming practical and easy to map into components later.

Constraints:
- Do not generate multiple screens.
- Do not output backend logic.
- Keep this refine-ready for a Figma handoff step.
```

## Figma MCP Prompt Template
Use this template after Stitch returns HTML/CSS:

```text
Use the following Stitch-generated HTML/CSS as the base for refinement into one finalized Figma screen.

Project topic: {project_topic}
Project type: {project_type}
Target screen: {screen_goal}
Style direction: {style_or_inferred}

Input HTML/CSS:
{paste_stitch_output_here}

Refinement requirements in Figma:
- Keep scope to exactly one screen.
- Apply auto layout for major containers and nested blocks.
- Convert repeated patterns into reusable components.
- Create variants for key interactive elements and states.
- Establish clear visual hierarchy and CTA emphasis.
- Apply consistent spacing system and typography scale.
- Use a color system appropriate for the product context.
- Create a basic prototype flow for key actions on this screen.
- Add subtle micro interactions and suitable effects/animations.

Extra emphasis:
- If this is landing page, dashboard, or mobile app, use richer but controlled prototype/animation detail.

Final output:
- One polished screen in Figma, ready for UI sign-off and handoff/code.
```

## Quick Inference Defaults
If style is missing, infer:
- `web + landing page` -> modern, clean, brand-forward
- `web + admin dashboard` -> enterprise, data-dense, high readability
- `mobile app + login/settings` -> minimal, touch-first, clear CTA
- `app + checkout` -> trustworthy, conversion-focused, low friction

If user persona is missing, infer primary persona from screen goal.

## Autopilot Enforcement
- Default mode is execution-first, not prompt-first.
- Do not output "Prompt cho Stitch/Figma" unless user explicitly asks to review prompts.
- If user explicitly mentions `@design_ui`, activate this skill immediately and prioritize direct MCP execution.
- If user says "chạy trực tiếp", "không cần gửi prompt", or equivalent:
  - skip prompt-preview completely
  - call MCP directly
  - update code immediately after MCP refinement
  - report concise execution results only.
- If user asks for "toàn màn hình", "full màn hình", "full page", or equivalent:
  - enforce full-page capture mode
  - use page-level/body selector capture (not component-level selector)
  - keep this as default behavior in subsequent captures unless user changes it.

## Example Use Case
Input:
- Chủ đề: hệ thống quản lý trường học
- Loại project: web
- Mục tiêu màn hình: admin dashboard

Expected response shape:
1. Brief chuẩn hóa cho web admin dashboard giáo dục.
2. One Stitch MCP prompt for dashboard HTML/CSS generation.
3. One Figma MCP prompt for refining that HTML/CSS.
4. One checklist validating auto layout, components, variants, prototype/effects.
