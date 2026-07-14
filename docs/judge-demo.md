# Judge Demo Narrative

FiberOps demos best as an operator story, not as a page-by-page walkthrough.

## The story

Alice runs a Fiber payment service.

1. A customer sends a payment.
2. The payment fails.
3. Alice does not know why.
4. Instead of opening six RPC endpoints, she opens FiberOps.
5. FiberOps gathers evidence from the relevant node set.
6. It shows payment state, sender liquidity, route readiness, node disagreement, and the next operator action.
7. Alice solves the problem in seconds instead of reconstructing the failure manually.

## Recommended live demo order

Use the built-in scenario buttons and presets in `Simulations` instead of trying to recreate failures on demand.

1. **Healthy Payment**
   Show what a known-good baseline looks like.

2. **Low Liquidity**
   Show a failed payment where outbound liquidity is too low.

3. **Offline Node**
   Show that FiberOps distinguishes node reachability failure from routing failure.

4. **Fee Budget Too Low**
   Show that the route exists, but the sender constraints still reject it.

5. **Route Not Found**
   Show a graph/routing failure that is different from pure liquidity failure.

6. **Replay History**
   Open `Activity` and show that a previous investigation can be revisited instead of re-run from scratch.

7. **Live Mode**
   Use live presets to prove the same workflow against real Fiber nodes or the bundled lab.

## What to say while demoing

Lead with the problem:

> Fiber payments fail for several different reasons, but raw RPC does not explain them in operator language.

Then show the payoff:

> FiberOps turns one failed payment into a clear diagnosis with evidence, node context, route readiness, and next action.

Avoid:

- walking every tab in sequence
- describing the UI as if the UI itself is the product
- trying to trigger a real failure live from scratch

Prefer:

- one operator story
- one baseline success
- two or three contrasting failures
- one historical replay
- one live-node proof

## Judge checklist mapping

This story order demonstrates:

- **Completeness** through screenshots, docs, and a guided flow
- **Technical soundness** through consistent diagnosis and live/replay parity
- **UX / abstraction** by replacing manual RPC reasoning with a single operator explanation
- **Product viability** by showing a real operator problem solved quickly
- **Novelty** through Fiber-specific route and multi-node reasoning

The weaker category is **Autonomy** because FiberOps is an operator tool, not a self-directed execution agent. If asked, position that deliberately:

> FiberOps is intentionally read-only and evidence-first. Its job is to help operators make the right decision before automation takes action.
