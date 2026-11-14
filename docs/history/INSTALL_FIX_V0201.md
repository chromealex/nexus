# NEXUS v0.20.1: Claude installer

- Claude Code is now automatically installable through the existing NEXUS-managed npm installation pipeline (`@anthropic-ai/claude-code`).
- When Claude is absent, the Agents tab shows **Install**, with confirmation, real CLI logs, cancellation, and verification.
- When Claude is already found (including `~/.local/bin`), Agents shows **INSTALLED**, not Setup guide.
- Removed **Setup guide** and **Official setup guide** from the Agents UI; unsupported installers show disabled **Unavailable** rather than a misleading setup action.
- Existing account management, chats, quota detection, and other agent installers are preserved.
- Installation requires Node.js 22+ in a location NEXUS can detect.
- After installing, use Accounts to add and authorize a profile; installation alone does not authenticate.

This patch has not been built or tested on macOS in this environment.
