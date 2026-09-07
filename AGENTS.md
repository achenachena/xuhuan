# Project engineering constraints

- Production player identity is verified exclusively with Telegram Mini App `initData`.
- Do not add paid authentication, JWT/session infrastructure, payment providers, or another identity service without an explicit product decision.
- Reuse an existing opaque resource UUID for public references when it is safe; do not create a separate capability-token table by default.
- Add a hash, token, signature, or secret only when it is required for concrete correctness or security, and document that reason next to the design.
- Prefer the smallest change that serves the current free, single-player game. Do not add speculative services, generic frameworks, telemetry, or compatibility layers without a concrete current need.
- When replacing a feature, remove its unreferenced code, copy, assets, and configuration. Preserve campaign content, player saves, historical SQL migrations, and necessary security or deployment boundaries.
