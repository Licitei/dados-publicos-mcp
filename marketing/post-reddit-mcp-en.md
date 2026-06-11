**Subreddit:** r/mcp (apply the **Showcase** flair). Alternatives: r/LocalLLaMA (reframe around "give your local LLM access to BR public data, local-first, no API key"), r/coolgithubprojects ("[Show]" title), r/opensource ("Promotional" flair), r/datasets, r/SideProject.

**Title:** I built an MCP server for Brazilian public data, no API key, runs fully local [Showcase]

---

**TL;DR:** open-source MCP server (stdio, Bun + TypeScript, AGPL-3.0) that gives an agent structured access to Brazilian public data: procurement, contracts, company/owner records, government sanctions. No API key, no third-party database. The Brazil-specific data is niche, but the architecture problem (how do you serve datasets with wildly different change rates over one MCP boundary?) is the part I want feedback on.

Full disclosure: I work at the company that owns this (Licitei) and I built it. It is open source under AGPL-3.0 and there is nothing to pay for or sign up to. Repo: https://github.com/Licitei/dados-publicos-mcp

## The problem

Public procurement data in Brazil is spread across a dozen official sources with very different shapes. The free CNPJ (company registry) lookups only take the company number, never a name. There is no free API that lets you search a company by owner name, or find two suppliers that share an owner (a classic collusion / shell-company signal). The legislation lives on government HTML pages. So an agent that reasons about a public tender ends up scraping at response time, which is slow and not auditable.

I wanted an agent to answer things like "does this CNPJ have an active sanction in CEIS/CNEP?", "which companies list this person as an owner?", "what is the fiscal-health rating of the city that opened this tender?" with predictable, local tools.

## The architecture (the generally interesting part)

The thing I kept getting wrong was treating every source the same. They are not. So the server is split into three layers by how fast the underlying data changes:

1. **Legislation** (changes rarely): downloaded once from the official source, indexed into SQLite with FTS5, then queried fully offline.
2. **Transactional data** (changes constantly): tenders, contracts, company registration. Queried live against public PNCP and BrasilAPI/MinhaReceita endpoints, with a short in-memory TTL cache.
3. **Heavy local indices** (changes slowly, huge): the Receita Federal CNPJ base is around 7.5 GB. These get downloaded from the official source and rebuilt on the user's own machine (`~/.local/share` on Linux/Mac, `%LOCALAPPDATA%` on Windows). This is what enables the searches no free official API gives you: company by name, owner by name, owners-in-common across suppliers, full-text over official gazettes.

Splitting by change rate decided everything else: what to cache, what to ship offline, what stays online. The whole thing runs with no API key and no shared backend, the indices are yours and you can audit and rebuild any of them.

Two implementation notes other MCP authors might find useful:

- **`console.log` corrupts a stdio MCP server.** It writes to stdout, which is the JSON-RPC channel. One stray log and the client drops the connection. All logging goes to stderr. Easy to forget, painful to debug.
- **Errors as values, not exceptions.** Nothing throws across the MCP boundary. I use `better-result` plus a declarative error catalog (`evlog`), so every failure is a typed value with a machine code and human `message`/`why`/`fix`. When an index is missing the tool returns `INDICE_AUSENTE` with the exact rebuild command instead of a stack trace, so the model gets a next step instead of a crash.

The big-file downloads are HTTP Range resumable: a partial file resumes only on a `206`, and a `200` restarts from zero (the server ignored the Range header, so appending would corrupt the file). Retries are limited to `408, 413, 429, 500, 502, 503, 504`.

## Try it

Right now you clone the repo and point your client at `src/index.ts` with Bun:

```json
{
  "mcpServers": {
    "dados-publicos-mcp": {
      "command": "bun",
      "args": ["/path/to/dados-publicos-mcp/src/index.ts"]
    }
  }
}
```

78 MCP tools, 12 official sources, 43 norms in the legislation catalog, 240 tests. 7 runtime deps. (An npm package / `bunx` install is planned, not live yet.)

## Scope I deliberately kept honest

It returns raw structured data. No scoring, no supplier viability, no proposal generation. The agent reasons, the decision stays human. I left DataJud (court records) out because the CNJ public API omits the `partes` field for privacy reasons, so it could not answer the question people actually want.

## The question for this sub

For the live layer I went with a short in-memory TTL cache, but for an MCP server that a user runs in short stdio sessions, the cache rarely survives long enough to help. How are you handling caching of live API calls in stdio servers that get spun up and torn down per session? Persist to disk and risk staleness, or just accept the cold call every time? Curious what has worked for you.

Repo again: https://github.com/Licitei/dados-publicos-mcp — and the longer write-up on the due-diligence use case: https://www.licitei.com.br/blog/due-diligence-fornecedores-dados-publicos-ia
