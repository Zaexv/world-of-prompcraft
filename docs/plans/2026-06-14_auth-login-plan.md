# Auth: Username + Password Login

**Status:** Planned · **Date:** 2026-06-14 · **Branch (proposed):** `feat/auth-login`

Add basic username/password authentication. Today login is implicit: the `join`
WebSocket message claims any username with no credential check.

## Decisions (locked)

- **Storage:** new `Account` model, separate from `Player`. Keeps credentials out
  of the game-state dataclass. `Account.username` ↔ `Player.username`.
- **Transport:** authenticate at WS `join` (no new HTTP endpoints). Extend `join`
  with `password` + `mode`.
- **Hashing:** bcrypt via `passlib[bcrypt]`. Never store plaintext.
- **UX:** two screens — Login (user+pass) and Register (full character creation +
  pass) — with a toggle link.
- **Sessions:** no token. Each connect requires username+password (re-login).

## Current State (research)

| Concern | Location | Note |
|---|---|---|
| Player key | everywhere | `username` (1–20 `[A-Za-z0-9_]`) is PK |
| DB model | `server/src/persistence/gamedata/models.py:6-32` | `Player.username` PK; no password field |
| ORM wrapper | `server/src/persistence/store.py` | `save_player` / `load_player` keyed by username |
| WS entry | `server/src/ws/handlers/join.py:28-65` | validates username; no auth; `register()` + state load |
| Pre-auth gate | `server/src/ws/handler.py:100-104` | only `join` + `ping` bypass registration check |
| Join msg (client) | `client/src/network/MessageProtocol.ts:26-32` | `JoinRequest`: username, race, faction, position, meshCatalog |
| Join send | `client/src/core/GameBootstrapper.ts:246` | `ws.send({type:'join', ...})` |
| Login UI | `client/src/ui/LoginScreen.ts`, `client/src/ui/screens/CharacterCreation.ts` | username/race/faction; no password |
| Validator | `client/src/ui/FormValidator.ts:50-60` | `validatePassword()` exists, **unused** |
| Error msg | `join.py:48-51` | `join_error` already supported client+server |

## Flow

- **register:** `Account` must NOT exist → hash + create `Account` → create/attach
  `Player` using incoming race/faction. (Register form + password.)
- **login:** `Account` must exist → verify password → load persisted `Player`.
  race/faction ignored (already persisted). (Login screen: username + password.)
- Mismatch / duplicate → reuse `join_error` → client shows error, retry.

## Server Changes

| File | Change |
|---|---|
| `persistence/gamedata/models.py` | Add `Account` model: `username` PK, `password_hash`, `created_at` |
| Django migration | New table for `Account` |
| `persistence/store.py` | `create_account(username, password)`, `get_account(username)`, `verify_password(username, password)` |
| `ws/handlers/join.py:43-65` | Branch on `mode`; register → create Account; login → verify before `manager.register()` + state load; reject via `join_error` |
| `pyproject.toml` | Add `passlib[bcrypt]` |

## Client Changes

| File | Change |
|---|---|
| `ui/LoginScreen.ts` | Login vs Register toggle; Login = username + password only |
| `ui/screens/CharacterCreation.ts` | Add password field to register form |
| `ui/FormValidator.ts:50-60` | Wire existing `validatePassword()` |
| `core/GameBootstrapper.ts:246` | Add `password` + `mode` to join `ws.send` |
| `network/MessageProtocol.ts:26-32` | Add `password`, `mode` to `JoinRequest` |

## Legacy Migration

Existing username-only `Player` rows have no `Account`. Register check tests
**Account** existence (not Player) → a legacy username can be registered → new
`Account` created, existing `Player` state attached/preserved.

- **Edge / risk:** anyone can claim a legacy username's state by registering it
  first. Acceptable for demo; flag for prod.

## Security Notes

- Password sent over `ws://` plaintext on localhost. **Prod: require `wss://`/TLS.**
- No rate limiting / lockout — out of scope; note for later.
- bcrypt default cost factor (12) is fine.

## Build Order

1. Server: model + migration + store helpers.
2. Server: `join.py` mode branch + credential verify.
3. Client: protocol + bootstrap fields.
4. Client: Login/Register screens + validator wiring.
5. `make check` (ruff/mypy/eslint/tsc + tests); add tests for register/login/reject.
