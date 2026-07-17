# Claude Code Project Context Guidance

The handoff package follows current official Claude Code project-memory guidance.

Key points from the official documentation:

| Guidance                                                                                    | Package implication                                                                                                |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Project-level `CLAUDE.md` is read at the start of sessions                                  | The package includes a concise root `CLAUDE.md` containing permanent instructions and imports                      |
| `CLAUDE.md` should contain facts, commands, architecture, conventions, and repeatable rules | Business and engineering invariants are summarized there rather than relying on chat history                       |
| Official guidance targets fewer than about 200 lines for a `CLAUDE.md`                      | Detailed specifications are split into `docs/` and topic-specific `.claude/rules/` files                           |
| `@path` syntax can import additional files                                                  | The root file imports the controlling source-of-truth documents                                                    |
| `.claude/rules/` supports topic/path-specific instructions                                  | Financial, database, testing, and migration rules are separated so they can be scoped                              |
| Instructions are context rather than hard enforcement                                       | Critical protections must also exist as database constraints, backend authorization, tests, hooks, and permissions |
| `CLAUDE.md` and project rules should avoid contradictions                                   | The package defines an authority order and marks unresolved rules explicitly rather than inventing an answer       |

## Official sources

[1]: https://code.claude.com/docs/en/memory 'Claude Code Docs — How Claude remembers your project'
[2]: https://code.claude.com/docs/en/claude-directory 'Claude Code Docs — Explore the .claude directory'
