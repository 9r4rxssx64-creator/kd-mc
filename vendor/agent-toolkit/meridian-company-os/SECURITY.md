# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| `main` before first public release | Yes |
| Tagged releases | Yes, once published |
| Older untagged commits | No |

## Threat Model

Meridian OS is local-first. The default app runs as a Vite web app with in-memory seeded company state, browser `localStorage` for selected Kimi connection metadata, and development middleware for Kimi integration.

The primary sensitive boundary is the local runtime bridge:

- The bridge can spawn the user's local Kimi Code CLI at `~/.kimi-code/bin/kimi`.
- The spawned CLI uses the user's own Kimi credentials stored outside this repo.
- The bridge accepts chat input from the same-origin web app and returns model output plus short trace metadata.
- The bridge should be run only on a trusted local machine and treated as a localhost development surface.

## Kimi Local Runtime

Runtime endpoints:

```text
GET  /local-runtime/status
POST /local-runtime/kimi/chat
```

Current protections:

- The bridge reports readiness but never returns refresh tokens, access tokens, or credential file contents.
- Chat requests are capped at 8k characters.
- Only one local Kimi chat can run at a time.
- Each chat has a 180-second timeout.
- The CLI runs in a dedicated `.kimi-runtime` workdir.
- The runtime requires user-consented local setup: install Kimi Code and run `kimi login`.

Security expectations for changes:

- Do not expose arbitrary command execution through the bridge.
- Do not accept a client-supplied binary path.
- Do not return environment variables, credential JSON, access tokens, refresh tokens, or device codes.
- Do not remove the concurrency guard or timeout without replacing them with stricter controls.
- Do not deploy the local runtime bridge as a public server.

## OAuth Device Flow

OAuth endpoints:

```text
POST /kimi-oauth/device
POST /kimi-oauth/token
```

The OAuth path follows RFC 8628 through a Vite proxy to `auth.kimi.com`. The client id follows the public opencode integration and lives in the Vite middleware rather than the browser bundle.

Client persistence rules:

- Connected status may be stored in `localStorage`.
- `deviceCode` is held only while the flow is pending and is removed after authorization or error.
- Access tokens and refresh tokens are not persisted by the client.
- Device codes and tokens must not be logged, rendered into traces, or exported.

## Browser Storage

Meridian stores Kimi connection metadata under the `meridian.kimiConnection` key. This storage is origin-scoped by the browser. Anyone with local browser profile access may inspect or delete that metadata.

Do not store company secrets, real financial records, credentials, API keys, or private customer data in the seeded in-memory store or browser storage.

## Reporting A Vulnerability

Please report security issues privately to:

```text
security@meridian-os.dev
```

Include:

- Affected version or commit.
- Steps to reproduce.
- Expected impact.
- Any logs or screenshots that do not expose secrets.

Do not open a public issue for credential exposure, command execution, token handling, cross-origin access, or local-runtime vulnerabilities.
