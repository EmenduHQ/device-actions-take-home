# Open questions

These are real problems we are facing. We have no single right answer, and we don't want a finished design. Bring your thinking to the session. If you like, add a few lines per question at the end of `DECISIONS.md`.

1. **Many repos, one way of building.** With AI, it's cheap to start a new repository: an API, a frontend, a connector, a demo someone in sales builds in two days. Guardrails and the design system live inside each repo, so every new repo starts without them, and copies drift apart. How do standards reach repos that don't exist yet, and how would you notice drift?

2. **A different stack.** An agent picks Python or Go for a new service. Rules written for one TypeScript repo no longer apply. How do you express architecture and design rules so that they survive a change of stack?

3. **Docs that lie.** Agent instructions and READMEs slowly stop matching the code. How do you keep what the docs claim true to the tree?

4. **Rules or judgement.** What should be a deterministic gate, what should be guidance for the agent, and what should stay with human review? Where does each one stop working?

5. **Events.** Device jobs, status histories and webhooks to partners. How would you make an event-driven flow easy to trace for a reviewer and safe for a partner who receives events twice or out of order?
