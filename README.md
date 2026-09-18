# Client review site

What the **client** sees: how customers are talking to their AI assistants, and
what came of it. No technical detail, by construction.

The developer console is next door in [`../client-ui`](../client-ui). Same
workspace, different audience.

```bash
npm install
cp .env.example .env     # add PERFOX_API_KEY

npm run proxy            # terminal 1 — http://localhost:8788
npm run dev              # terminal 2 — http://localhost:5181
```

## The design rule

**Technical detail is removed on the server, not hidden in the UI.**

`server/index.js` is not a passthrough. It calls the workspace API, re-shapes
every response, and serves only the reduced result. A client who opens devtools
sees exactly what the page shows — there is nothing else to find.

Concretely, this process:

- has **no** `/api/mcp/*`, no `/api/discover`, no vendor passthrough — those
  routes return 404 because they don't exist here
- is **read-only** — POST/PUT/PATCH/DELETE all return 405
- never emits `workflow_id`, `tool_name`, `tool_input`, `tool_output`,
  `tool_latency_ms`, `active_version`, `node_count`, credentials or connected
  MCP servers
- returns a plain "Could not load this right now" on upstream failure, rather
  than forwarding vendor error text

Verified by an automated sweep of every endpoint against a forbidden-pattern
list. The one match was the word "credentials" inside customer conversation
summaries — real content, not a leak.

## Pages

| Page | Answers |
|---|---|
| **Overview** | How much is happening, on which channels, and how it ends |
| **Conversations** | Every conversation, searchable, with the full transcript |
| **Customers** | Who has been in touch and how often |
| **Channels** | Which routes customers arrive on, and how busy each is |
| **Assistants** | Which assistants are live and what each one handles |

## Translation layer

Raw values are database-shaped. These are what the client reads instead:

| Workspace | Client sees |
|---|---|
| `web` | Website |
| `phone` / `whatsapp` | Phone / WhatsApp |
| `resolved` | **Resolved** — the customer got what they needed |
| `ended` | **Completed** — finished normally |
| `abandoned` | **Left early** — the customer stopped replying |
| `active` | **In progress** |

Transcripts keep customer messages, assistant replies, and call markers
(started / ended / recorded / customer identified). `tool_call`, `tool_result`
and `status_change` rows are dropped — they describe how the assistant works,
not what the customer experienced.

## Two things deliberately not shown

**Average conversation length.** The only timestamps available are the record's
`created_at` and `updated_at`. On an abandoned session those sit hours apart, so
the average computed to 7.6 hours. Presenting that as "average chat length"
would be plainly false, so the figure is omitted rather than shown wrong.

**Channel "connected" status.** Every assistant in this workspace declares only
`web`, yet WhatsApp and Phone conversations exist — those are wired up outside
what the API reports. Marking WhatsApp "not connected" would contradict its 37
conversations, so the Channels page reports **observed activity** instead:
active if customers used it in the last week, quiet otherwise.

## Worth raising with the team

Four conversation summaries describe an assistant asking a customer for their
**password** or login credentials. That's a product issue, not a UI one, and
it's visible to the client on the Conversations page.

Separately: **66% of conversations end in "Left early"** and only 17% resolve.
The client will see this immediately, so it's better to have an answer ready.
