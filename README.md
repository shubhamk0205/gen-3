# NotebookLM RAG

A self-hosted clone of Google NotebookLM. Upload a PDF / TXT / MD file and chat with it. Answers are grounded in the document — the LLM only sees retrieved chunks of your file, never its own knowledge.

Built for **Assignment 03 — Google NotebookLM RAG**.

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router, TypeScript) |
| UI | React 19 + Tailwind CSS |
| RAG orchestration | LangChain |
| Document parsing | `pdf-parse` (PDF) + UTF-8 (TXT/MD) |
| Chunking | `RecursiveCharacterTextSplitter` — 1000 chars, 150 overlap |
| Embeddings | OpenAI `text-embedding-3-small` *or* Jina `jina-embeddings-v2-base-en` (free) |
| Vector DB | Qdrant (local Docker or Qdrant Cloud) |
| Generation | OpenAI `gpt-4o-mini` via OpenAI API or OpenRouter (configurable) |
| Deploy | Vercel + Qdrant Cloud |

---

## RAG pipeline

```
PDF/TXT  →  text extraction  →  recursive chunking  →  OpenAI embeddings
                                                              │
                                                              ▼
                                                         Qdrant collection
                                                              │
user question ─→ embed query ─→ similarity search (top-4) ─→ build prompt
                                                              │
                                                              ▼
                                                       gpt-4o-mini answer
                                                       (with chunk citations)
```

Files that implement each stage:

- **Extraction & chunking:** [lib/rag.ts](lib/rag.ts), [app/api/upload/route.ts](app/api/upload/route.ts)
- **Embedding & indexing:** `indexDocuments` in [lib/rag.ts](lib/rag.ts)
- **Retrieval:** `retrieveContext` in [lib/rag.ts](lib/rag.ts)
- **Generation (grounded prompt):** [app/api/chat/route.ts](app/api/chat/route.ts)
- **UI:** [app/page.tsx](app/page.tsx)

### Chunking strategy

`RecursiveCharacterTextSplitter` from `@langchain/textsplitters` with:

- `chunkSize: 1000` — large enough for a coherent passage, small enough that each embedding stays focused.
- `chunkOverlap: 150` — overlap preserves continuity across boundaries so an answer that straddles a split still has full context.
- Separator hierarchy `["\n\n", "\n", ". ", " ", ""]` — splits on paragraphs first, then lines, then sentences, only falling back to character-level cuts as a last resort. This keeps semantic units intact whenever possible.

### Grounding

The chat route builds a system message containing only the retrieved chunks (top-4 by cosine similarity) and instructs the model:

> *Only use the context below. If the answer is not in the context, say "I couldn't find that in the document." and stop.*

The model is also instructed to cite chunks with `[chunk N]` markers. Each response in the UI shows the source chunks that were retrieved, expandable below the answer.

---

## Run locally

### 1. Prerequisites

- Node.js 20+
- An [OpenAI API key](https://platform.openai.com/api-keys)
- A Qdrant instance — either:
  - **Local:** `docker run -p 6333:6333 qdrant/qdrant`
  - **Cloud:** free tier at [cloud.qdrant.io](https://cloud.qdrant.io)

### 2. Install

```bash
npm install
```

### 3. Configure

Copy `.env.example` to `.env.local` and fill in:

```bash
cp .env.example .env.local
```

You need three credentials:

**Chat model** — pick either:
```env
# Option 1: real OpenAI key
OPENAI_API_KEY=sk-...

# Option 2: OpenRouter (cheaper, supports many models)
OPENAI_API_KEY=sk-or-v1-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_CHAT_MODEL=openai/gpt-4o-mini
```

**Embeddings** — pick either:
```env
# Option A: OpenAI (requires real OpenAI key above; OpenRouter does NOT support embeddings)
# Nothing else to set — uses OPENAI_API_KEY automatically.

# Option B: Jina AI (free, 10M tokens, no payment required)
# Sign up at https://jina.ai/embeddings, then:
JINA_API_KEY=jina_...
```

**Vector DB:**
```env
QDRANT_URL=https://your-cluster.eu-west-2-0.aws.cloud.qdrant.io   # or http://localhost:6333
QDRANT_API_KEY=...                                                # only for Qdrant Cloud
```

### 4. Start

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), upload a document, and start asking questions.

---

## Deploy (Vercel + Qdrant Cloud)

1. **Provision Qdrant Cloud**
   - Sign up at [cloud.qdrant.io](https://cloud.qdrant.io) (free tier is plenty for this assignment).
   - Create a cluster and copy its **URL** and **API key**.

2. **Push to GitHub**
   ```bash
   git add .
   git commit -m "NotebookLM RAG"
   git remote add origin https://github.com/<you>/notebooklm-rag.git
   git push -u origin main
   ```

3. **Deploy on Vercel**
   - [vercel.com/new](https://vercel.com/new) → import the repo.
   - Add the env vars in **Project Settings → Environment Variables** (same set as `.env.local`):
     - `OPENAI_API_KEY` (required)
     - `OPENAI_BASE_URL` (only if using OpenRouter)
     - `OPENAI_CHAT_MODEL` (optional override)
     - `JINA_API_KEY` (only if using Jina embeddings)
     - `QDRANT_URL`, `QDRANT_API_KEY`
   - Click **Deploy**.

That's it. The live URL is your submission.

---

## Project structure

```
.
├── app
│   ├── api
│   │   ├── chat/route.ts      # RAG retrieval + grounded generation
│   │   └── upload/route.ts    # extract → chunk → embed → index
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx               # chat UI
├── lib
│   └── rag.ts                 # shared RAG primitives
├── .env.example
├── next.config.js
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## Verification checklist

- [x] User can upload PDF / TXT / MD
- [x] Text is extracted, chunked, embedded, and stored in Qdrant
- [x] Each upload gets an isolated collection — old data is purged on re-upload of the same id
- [x] User question is embedded and matched against the collection (top-4)
- [x] LLM answers strictly from retrieved chunks; refuses if absent
- [x] Sources panel shows the exact chunks used for each answer
- [x] Deployable to Vercel with no local-only dependencies

---

## Notes on cost & limits

- Embedding model: `text-embedding-3-small` (cheap; ~$0.02 / 1M tokens).
- Chat model: `gpt-4o-mini` (override via `OPENAI_CHAT_MODEL`).
- File limit: 12 MB per upload (configurable in `app/api/upload/route.ts`).
- Vercel function timeout: 60 s — sufficient for documents up to a few hundred pages.
