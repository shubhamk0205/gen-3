import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { retrieveContext, getChatConfig } from "@/lib/rag";

export const runtime = "nodejs";
export const maxDuration = 60;

type Msg = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `You are NotebookLM, a helpful assistant that answers questions strictly using the provided document excerpts.

Rules:
- Only use the context below. If the answer is not in the context, say "I couldn't find that in the document." and stop.
- Do not invent facts, page numbers, or quotes.
- Keep answers concise and clear. Use short bullet lists when helpful.
- Whenever you state a specific fact, cite the source with [chunk N] where N is the chunk index from the context.
- Quote short phrases verbatim from the document when it strengthens the answer.`;

function formatContext(
  chunks: { pageContent: string; metadata: Record<string, unknown> }[]
) {
  return chunks
    .map((c, i) => {
      const idx = (c.metadata?.chunk as number | undefined) ?? i;
      const src = (c.metadata?.source as string | undefined) ?? "document";
      return `[chunk ${idx}] (source: ${src})\n${c.pageContent}`;
    })
    .join("\n\n---\n\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const documentId: string | undefined = body.documentId;
    const message: string | undefined = body.message;
    const history: Msg[] = Array.isArray(body.history) ? body.history : [];

    if (!documentId) {
      return NextResponse.json({ error: "documentId is required" }, { status: 400 });
    }
    if (!message || !message.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    const chunks = await retrieveContext(documentId, message, 4);

    if (chunks.length === 0) {
      return NextResponse.json({
        answer: "I couldn't find that in the document.",
        sources: [],
      });
    }

    const context = formatContext(
      chunks.map((c) => ({ pageContent: c.pageContent, metadata: c.metadata }))
    );

    const chatConfig = getChatConfig();
    const client = new OpenAI({
      apiKey: chatConfig.apiKey,
      baseURL: chatConfig.baseURL,
    });
    const completion = await client.chat.completions.create({
      model: chatConfig.model,
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "system",
          content: `Document context (most relevant chunks):\n\n${context}`,
        },
        ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: message },
      ],
    });

    const answer = completion.choices[0]?.message?.content ?? "";

    const sources = chunks.map((c, i) => ({
      chunk: (c.metadata?.chunk as number | undefined) ?? i,
      source: (c.metadata?.source as string | undefined) ?? "document",
      preview: c.pageContent.slice(0, 220),
    }));

    return NextResponse.json({ answer, sources });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Chat failed";
    console.error("[chat] error", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
