# Claude Code setup and token policy

This repository follows the current project conventions documented by Anthropic:

- Project instructions: root `CLAUDE.md` (kept below 200 lines)
- Custom subagents: `.claude/agents/*.md`
- Skills: `.claude/skills/<name>/SKILL.md`
- Path-scoped instructions: `.claude/rules/*.md`

Official references:

- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/features-overview

## First run

1. Install/update Claude Code using Anthropic's official instructions.
2. Start `claude` in the repository root and review the trust prompt.
3. Run `/agents` and confirm project agents are visible. Use the interface to inspect their tools/models.
4. Run `/skills` and confirm project skills are visible. `implement-phase` is intentionally user-invocable only.
5. Run `/doctor` if your version provides it.
6. Paste `prompts/START-HERE.md`.

If an organization restricts models, Claude Code may replace a requested alias. The workflow must still work: capability gates matter more than a model name. Do not hardcode dated model IDs in repository instructions.

## Token-efficient orchestration

- Main session works directly for narrow tasks; delegation is not ceremonial.
- `scout`/`docs-analyst` use Haiku for bounded high-volume discovery or reconciliation.
- Sonnet handles ordinary code, tests, research synthesis, and review.
- Opus is reserved for high-consequence cross-domain architecture or difficult root-cause work.
- Default two concurrent workers, maximum three; workers receive narrow prompts and return evidence/file paths.
- Shared truth lives in files, contracts, phase reports, and tests—not repeated chat summaries.
- `CLAUDE.md` contains only always-needed rules. Skills load detailed guidance on demand.
- The main session verifies worker output and owns integration.

Use Claude Code's task view to confirm the actual model used by running subagents and review usage periodically. Lower cost is an optimization subject to quality gates, not permission to skip them.
