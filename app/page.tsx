"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type DocumentInfo = {
  documentId: string;
  filename: string;
  pages: number;
  chunks: number;
  chars: number;
};

type Source = {
  chunk: number;
  source: string;
  preview: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

export default function Home() {
  const [doc, setDoc] = useState<DocumentInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, thinking]);

  async function handleUpload(file: File) {
    setUploadError(null);
    setUploading(true);
    setMessages([]);
    setDoc(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setDoc(data);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSend() {
    if (!doc || !input.trim() || thinking) return;
    setChatError(null);
    const userMsg: Message = { role: "user", content: input.trim() };
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setThinking(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: doc.documentId,
          message: userMsg.content,
          history,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat failed");
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.answer, sources: data.sources },
      ]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setThinking(false);
    }
  }

  function reset() {
    setDoc(null);
    setMessages([]);
    setInput("");
    setUploadError(null);
    setChatError(null);
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-ink text-zinc-200">
      <Sidebar
        doc={doc}
        uploading={uploading}
        uploadError={uploadError}
        fileRef={fileRef}
        onPick={handleUpload}
        onReset={reset}
      />

      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <h1 className="text-base font-semibold tracking-tight">NotebookLM RAG</h1>
              <p className="text-xs text-muted">Chat grounded in your document</p>
            </div>
          </div>
          {doc && (
            <div className="hidden text-right text-xs text-muted md:block">
              <div className="text-zinc-300">{doc.filename}</div>
              <div>
                {doc.pages > 0 ? `${doc.pages} pages · ` : ""}
                {doc.chunks} chunks indexed
              </div>
            </div>
          )}
        </header>

        <div ref={scrollerRef} className="scrollbar-thin flex-1 overflow-y-auto">
          {!doc ? (
            <EmptyState />
          ) : messages.length === 0 ? (
            <Welcome filename={doc.filename} onPick={(q) => setInput(q)} />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
              {messages.map((m, i) => (
                <ChatBubble key={i} msg={m} />
              ))}
              {thinking && <Thinking />}
            </div>
          )}
        </div>

        <div className="border-t border-line bg-panel px-6 py-4">
          {chatError && (
            <p className="mx-auto mb-2 max-w-3xl text-xs text-red-400">{chatError}</p>
          )}
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={!doc || thinking}
              rows={1}
              placeholder={
                doc
                  ? "Ask anything about your document…"
                  : "Upload a document to start"
              }
              className="scrollbar-thin min-h-[44px] max-h-40 flex-1 resize-none rounded-xl border border-line bg-ink px-4 py-3 text-sm placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!doc || thinking || !input.trim()}
              className="h-11 rounded-xl bg-accent px-4 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send
            </button>
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-[11px] text-muted">
            Answers are generated only from chunks retrieved from your document.
          </p>
        </div>
      </main>
    </div>
  );
}

function Sidebar({
  doc,
  uploading,
  uploadError,
  fileRef,
  onPick,
  onReset,
}: {
  doc: DocumentInfo | null;
  uploading: boolean;
  uploadError: string | null;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onPick: (file: File) => void;
  onReset: () => void;
}) {
  const [drag, setDrag] = useState(false);

  return (
    <aside className="hidden w-80 flex-col border-r border-line bg-panel md:flex">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-sm font-semibold">Source</h2>
        <p className="text-xs text-muted">PDF, TXT, or MD up to 12 MB</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onPick(f);
          }}
          className={`flex flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition ${
            drag ? "border-accent bg-accent/5" : "border-line bg-ink"
          }`}
        >
          <div className="mb-2 text-2xl">📄</div>
          <p className="mb-3 text-xs text-muted">
            Drop a file here, or browse from your computer
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-lg border border-line bg-ink px-3 py-1.5 text-xs hover:border-accent hover:text-white disabled:opacity-50"
          >
            {uploading ? "Indexing…" : "Choose file"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
            }}
          />
        </div>

        {uploadError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {uploadError}
          </div>
        )}

        {uploading && (
          <div className="rounded-lg border border-line bg-ink p-3 text-xs text-muted">
            <div className="mb-1 font-medium text-zinc-200">Processing</div>
            Extracting text → chunking → embedding → indexing…
          </div>
        )}

        {doc && !uploading && (
          <div className="space-y-3 rounded-lg border border-line bg-ink p-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted">
                Indexed
              </div>
              <div className="break-all text-sm font-medium text-zinc-100">
                {doc.filename}
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              {doc.pages > 0 && (
                <Stat label="Pages" value={doc.pages.toString()} />
              )}
              <Stat label="Chunks" value={doc.chunks.toString()} />
              <Stat
                label="Characters"
                value={doc.chars.toLocaleString()}
              />
              <Stat label="Embedding" value="3-small" />
            </dl>
            <button
              onClick={onReset}
              className="w-full rounded-lg border border-line py-1.5 text-xs hover:border-accent hover:text-white"
            >
              Upload a different file
            </button>
          </div>
        )}

        <div className="rounded-lg border border-line bg-ink p-3 text-[11px] leading-relaxed text-muted">
          <div className="mb-1 font-medium text-zinc-300">How it works</div>
          1. Text extracted from your file
          <br />
          2. Split into ~1000-char chunks (150 overlap)
          <br />
          3. Embedded with OpenAI <code>text-embedding-3-small</code>
          <br />
          4. Stored in Qdrant vector DB
          <br />
          5. Top-4 chunks retrieved per question and passed to GPT
        </div>
      </div>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-zinc-200">{value}</dd>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 text-5xl">📚</div>
      <h2 className="mb-2 text-2xl font-semibold tracking-tight">
        Upload a document to begin
      </h2>
      <p className="max-w-md text-sm text-muted">
        Drop a PDF, TXT, or MD file in the sidebar. The system will chunk,
        embed, and index it. Then ask anything — answers are grounded in the
        file.
      </p>
    </div>
  );
}

function Welcome({
  filename,
  onPick,
}: {
  filename: string;
  onPick: (q: string) => void;
}) {
  const suggestions = [
    "Summarize this document in 5 bullet points",
    "What are the key topics covered?",
    "List the most important takeaways",
    "Are there any examples or code samples?",
  ];
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-16 text-center">
      <div className="mb-3 text-4xl">✨</div>
      <h2 className="mb-2 text-xl font-semibold">Indexed: {filename}</h2>
      <p className="mb-8 text-sm text-muted">
        Ask anything about it. Try one of these to get started:
      </p>
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-xl border border-line bg-panel px-4 py-3 text-left text-sm hover:border-accent hover:text-white"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-accent text-white"
            : "border border-line bg-panel text-zinc-100"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        ) : (
          <div className="prose-invert-tight">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {msg.content}
            </ReactMarkdown>
          </div>
        )}
        {!isUser && msg.sources && msg.sources.length > 0 && (
          <Sources sources={msg.sources} />
        )}
      </div>
    </div>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-line pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] uppercase tracking-wide text-muted hover:text-zinc-300"
      >
        {open ? "Hide" : "Show"} sources ({sources.length})
      </button>
      {open && (
        <ul className="mt-2 space-y-2">
          {sources.map((s) => (
            <li
              key={s.chunk}
              className="rounded-lg border border-line bg-ink p-2 text-xs text-zinc-300"
            >
              <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">
                chunk {s.chunk} · {s.source}
              </div>
              <div className="line-clamp-3 whitespace-pre-wrap">{s.preview}…</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl border border-line bg-panel px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:0ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-bold text-white">
      N
    </div>
  );
}
