PROMPT LIBRARY
Vibe coding prompts, organized as one pipeline from idea to shipped feature.

How to use: copy the prompt you need, fill in the [BRACKETS], paste it into your AI coding tool. These are per-task prompts - they are NOT standing rules. Standing rules live in AGENTS.md.

When a prompt here and a rule in AGENTS.md disagree, section 4 of that file decides:

- WORKFLOW RULES - versioning, commit message format, report shape, test requirement, branch naming - can be set aside by a prompt that says so explicitly and gives a reason. Say so in the report.
- NON-NEGOTIABLE RULES - protecting user data and content datasets, never committing secrets, never making destructive changes, never claiming unverified work as done - can never be set aside. If a prompt asks for one of these, stop and ask.

These prompts assume a typical app project (a frontend, a backend, a database). Skip or adapt the parts that do not apply: a command-line tool has no frontend, a static site has no database, and a small prototype may have no authentication or payments.


====================================================================
PHASE 1 - THINK BEFORE BUILDING
====================================================================

1.1  IDEA TO PRD
--------------------------------------------------------------------
Use when: you have a rough idea and want a real plan before any code.

Act as a senior product manager.

Here is my idea: [YOUR IDEA]

Ask me the most important questions first. Then create a PRD covering:
- Problem
- Target users
- Core features
- User stories
- Requirements
- Edge cases
- MVP scope

Do not invent unclear requirements.


1.2  PRD TO TECH STACK
--------------------------------------------------------------------
Use when: the plan is clear and you need to choose technologies.

Analyze this PRD:
[PASTE PRD]

Recommend the best tech stack for this project. Cover the parts that apply, such as: language and runtime, frontend, backend, database, authentication, APIs, testing, and deployment.

Explain why you chose each technology.

Prioritize simplicity, security, and scalability.

Do not start coding yet.


1.3  PLAN THE ARCHITECTURE
--------------------------------------------------------------------
Use when: stack is chosen and you need to see how the pieces fit together.

Using this PRD and tech stack:
[PASTE THEM]

Design the application architecture. Show the parts that apply:
- Project structure
- Frontend / backend flow
- Database structure
- API structure
- Authentication flow
- Data flow

Identify important security and performance risks.

Do not write code yet.


1.4  DESIGN THE DATABASE
--------------------------------------------------------------------
Use when: you need the data model defined before building features. Skip if the project has no database.

Design the database for this application:
[DESCRIBE APP]

Define:
- Tables / models
- Fields
- Relationships
- Primary and foreign keys
- Constraints
- Important indexes

Explain your design briefly. Then provide the schema in [SQL / Prisma / etc.].


1.5  UI AND UX DESIGN BRIEF
--------------------------------------------------------------------
Use when: the plan exists and you want the interface designed before coding.

Act as a product designer.

From this PRD, produce a design brief:
- User flows
- Screen inventory
- Layout for each screen
- Component list
- Design tokens (colors, type scale, spacing)
- States (empty, loading, error, success)
- Accessibility notes

No generic purple-gradient defaults.


====================================================================
PHASE 2 - BUILD
====================================================================

2.1  BUILD ONE FEATURE
--------------------------------------------------------------------
Use when: implementing. One feature per prompt - never the whole app at once.

Implement ONLY this feature:
[FEATURE]

First explain:
- Implementation plan
- Files to create or change
- Dependencies needed

Then write the code.

If the change is non-trivial or touches shared systems, stop after the plan and wait for my confirmation before writing code.

Follow the existing architecture. Do not modify unrelated code.

Handle loading, errors, validation, and edge cases.


====================================================================
PHASE 3 - REVIEW AND HARDEN
====================================================================

3.1  REVIEW THE CODE
--------------------------------------------------------------------
Use when: a feature is written and you want a critical second pass.

Review this code as a senior engineer:
[CODE]

Find:
- Bugs
- Security issues
- Performance problems
- Bad architecture
- Duplicated logic

For each issue, explain: Problem, then Why, then Fix.

Do not rewrite everything unnecessarily.


3.2  FIND SECURITY GAPS
--------------------------------------------------------------------
Use when: before deploying anything that touches auth, data, or APIs.

Audit this codebase like a security engineer. Find:
- Authentication and authorization flaws
- Exposed secrets
- Injection risks
- Insecure API routes
- Missing rate limits
- Unsafe data exposure

Rank by severity, explain the exploit, then give the exact fix.

Do this before you deploy, not after.


3.3  CLEAN UP AND REFACTOR DEAD CODE
--------------------------------------------------------------------
Use when: the codebase has accumulated leftovers.

Scan this project for dead code: unused files, components, imports, dependencies, environment variables, and commented-out blocks.

Show me the list with proof each item is unused BEFORE deleting anything.

Then refactor duplicated logic into shared utilities - behavior must stay identical.

Smaller codebase means a smarter agent.


====================================================================
PHASE 4 - TEST AND DEBUG
====================================================================

4.1  TEST IT
--------------------------------------------------------------------
Use when: a feature is done and you need to know it actually works.

Create tests for this feature:
[FEATURE + CODE]

Cover:
- Happy path
- Invalid input
- Edge cases
- Errors
- Authentication
- API and database failures

Tell me which tests should be unit, integration, or end-to-end. Then write the most important tests.


4.2  E2E TEST YOUR APP
--------------------------------------------------------------------
Use when: the critical user journeys need automated coverage. Skip if the project has no interactive user journeys.

Set up end-to-end testing for this project.

Write E2E tests covering the critical user journeys that exist in this app - for example signup, login, the core action, payment, and logout. Cover the happy path and failure states. Use stable test selectors, add fixtures for authentication, and a script I can run in CI.


4.3  DEBUG AN ERROR FAST
--------------------------------------------------------------------
Use when: something is broken and you want to stop the guessing loop.

Here is the error and the relevant code:
[ERROR + CODE]

Do NOT change anything yet.

List the 3 most likely root causes, ranked by probability. For each one, tell me exactly what to log or check to confirm it. Only after we confirm the cause, write the fix.

Diagnose first. Patch second.


====================================================================
PHASE 5 - SHIP AND COMPOUND
====================================================================

5.1  WRITE CLEAN GIT COMMITS
--------------------------------------------------------------------
Use when: you have staged changes and want a readable history.

Review my staged changes. Split them into logical atomic commits.

For each commit give: a Conventional Commits message (feat / fix / refactor / chore), a scope, and a body explaining WHY, not what.

Give me the git commands to run, in order.

Your git history becomes documentation.


5.2  TURN A TASK INTO A SKILL
--------------------------------------------------------------------
Use when: you just finished something you will need to do again.

I just did this task with you. Turn it into a reusable skill:
- A clear name
- A description of exactly when to trigger it
- Step-by-step instructions
- Examples
- Common failure modes

Write it so a fresh model with zero context can execute it perfectly.

Do it once. Never explain it again.
