# Custom channel plugins

A custom channel lets you connect any transport to Nexus (WebRTC, Matrix, XMPP, a company messenger, a hardware button…) without changing Nexus itself. You write a small program — the *plugin* — and Nexus talks to it over stdin/stdout. Messages the plugin reports become regular Nexus tasks, exactly like Telegram or Slack messages; answers, progress and permission requests are handed back to the plugin to deliver.

Setup: **Connections → Channels → Custom channel**.

## How Nexus runs the plugin

- The plugin is an executable file given by an **absolute path**, plus up to 16 arguments. It is started directly, **without a shell**.
- Environment is cleared; only `PATH`, `HOME`, `LANG` and `NEXUS_CHANNEL_PROTOCOL=1` are set.
- `stderr` is discarded (so a plugin cannot leak secrets into Nexus logs by accident). Use `log` messages instead.
- The optional secret is stored in the macOS Keychain and is sent **only** in the first `hello` line over stdin — never in argv, environment or files.
- The process is started when the channel is enabled, restarted if it exits or if its command, arguments, channel ID or secret change, and stopped when the channel is disabled or removed. It lives only while Nexus is running.
- All the usual channel rules apply: only senders from the allowed list create tasks, “Discussion” mode by default, “Execution” only if allowed in the channel settings, permission requests are answered once with `/allow CODE`. A bare “yes”/“no” is **not** accepted from plugins (Nexus cannot know whether the sender ID can be forged), so `/allow CODE` is always required.

## Protocol (version 1)

One JSON object per line (UTF-8, `\n`-terminated, at most 256 KB per line). Unknown fields and unknown message types are ignored, so the protocol can grow without breaking plugins.

### Nexus → plugin

| Message | Meaning |
|---|---|
| `{"type":"hello","protocol":1,"secret":"…","channelId":"…"}` | First line after start. `secret` and `channelId` may be empty strings. |
| `{"type":"ping","id":1}` | “Check connection” button. Answer with a `result`. |
| `{"type":"send","id":2,"reply":{"to":"…","thread":"…","subject":"…"},"text":"…"}` | Deliver text to a conversation. `reply` is what you sent with the incoming message. The text is not split — split it yourself if your transport has a limit. Answer with a `result` within 60 seconds. |

### Plugin → Nexus

| Message | Meaning |
|---|---|
| `{"type":"ready","name":"My bridge"}` | Optional; the name is shown after “Check connection”. |
| `{"type":"message","conversation":"room-1","sender":"alice","text":"…","reply":{…},"display":"Alice"}` | An incoming message. `conversation`, `sender` and `text` are required. `sender` is matched against the allowed list. `reply` defaults to `{"to": conversation}`. Up to 20 000 characters of text; up to 200 messages are queued between polls (Nexus polls every second). |
| `{"type":"result","id":2,"ok":true}` / `{"type":"result","id":2,"ok":false,"error":"…"}` | Answer to `ping` or `send` with the same `id`. |
| `{"type":"log","text":"…"}` | A line for the channel log in Nexus (shown as “Plugin: …”). |

## Minimal example (Python)

```python
#!/usr/bin/env python3
import sys, json

def out(obj):
    print(json.dumps(obj), flush=True)

for line in sys.stdin:
    msg = json.loads(line)
    if msg["type"] == "hello":
        out({"type": "ready", "name": "Echo"})
        # A real plugin would connect to its transport here and emit messages as they arrive:
        out({"type": "message", "conversation": "demo", "sender": "me", "text": "/status"})
    elif msg["type"] == "ping":
        out({"type": "result", "id": msg["id"], "ok": True})
    elif msg["type"] == "send":
        sys.stderr.write(f"to {msg['reply']['to']}: {msg['text']}\n")  # deliver it to your transport
        out({"type": "result", "id": msg["id"], "ok": True})
```

Make it executable (`chmod +x`), enter its absolute path in the channel settings, add `me` to the allowed senders and enable the channel.

A plugin that receives messages from its transport on another thread should write to stdout from one place (a lock or a queue) so lines never interleave.

## WebRTC

Nexus does not ship a WebRTC stack. A WebRTC bridge is a plugin: it handles signalling, ICE/TURN and the data channel itself (for example with `aiortc`, `pion` or `webrtc-rs`), turns incoming data-channel text into `message` lines and sends `send` texts back over the data channel. Authentication of the remote peer is the plugin's job; use the allowed-senders list as a second gate.
