import { OpenAIEmbeddings } from "@langchain/openai";
import { JinaEmbeddings } from "@langchain/community/embeddings/jina";
import { QdrantVectorStore } from "@langchain/qdrant";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import { QdrantClient } from "@qdrant/js-client-rest";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";

export const COLLECTION_PREFIX = "notebooklm_";

export function getQdrantConfig() {
  const url = process.env.QDRANT_URL;
  if (!url) {
    throw new Error(
      "QDRANT_URL is not set. Set it in .env.local (e.g. http://localhost:6333 or your Qdrant Cloud URL)."
    );
  }
  const apiKey = process.env.QDRANT_API_KEY;
  return { url, apiKey };
}

/**
 * Pick an embedding provider based on which env vars are configured.
 *
 * - JINA_API_KEY  → Jina AI embeddings (free, 768-dim)
 * - else OPENAI_API_KEY (without OpenRouter base URL) → OpenAI text-embedding-3-small (1536-dim)
 *
 * If only an OpenRouter key is supplied (sk-or-…) we refuse, because OpenRouter
 * does not proxy OpenAI's embedding endpoint.
 */
export function getEmbeddings(): EmbeddingsInterface {
  if (process.env.JINA_API_KEY) {
    return new JinaEmbeddings({
      apiKey: process.env.JINA_API_KEY,
      model: process.env.JINA_EMBEDDING_MODEL || "jina-embeddings-v2-base-en",
    });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error(
      "No embedding provider configured. Set JINA_API_KEY (free at jina.ai/embeddings) or OPENAI_API_KEY."
    );
  }

  const baseURL = process.env.OPENAI_BASE_URL;
  const isOpenRouter =
    openaiKey.startsWith("sk-or-") || baseURL?.includes("openrouter.ai");
  if (isOpenRouter) {
    throw new Error(
      "Your OPENAI_API_KEY is an OpenRouter key, which does not support embeddings. " +
        "Add JINA_API_KEY (free at https://jina.ai/embeddings) or use a real OpenAI key for embeddings."
    );
  }

  return new OpenAIEmbeddings({
    apiKey: openaiKey,
    model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
  });
}

export function getChatConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for chat completion.");
  }
  const baseURL = process.env.OPENAI_BASE_URL;
  const isOpenRouter =
    apiKey.startsWith("sk-or-") || baseURL?.includes("openrouter.ai");
  const model =
    process.env.OPENAI_CHAT_MODEL ||
    (isOpenRouter ? "openai/gpt-4o-mini" : "gpt-4o-mini");
  return {
    apiKey,
    baseURL: baseURL || (isOpenRouter ? "https://openrouter.ai/api/v1" : undefined),
    model,
  };
}

export function collectionFor(documentId: string) {
  return `${COLLECTION_PREFIX}${documentId}`;
}

/**
 * Chunking strategy: RecursiveCharacterTextSplitter.
 *
 * Splits on a hierarchy of separators (paragraphs → lines → sentences → words)
 * with 1000-char chunks and 150-char overlap. Overlap preserves continuity so
 * an answer that straddles a chunk boundary still has the surrounding context.
 */
export async function chunkText(
  rawText: string,
  metadata: Record<string, unknown> = {}
): Promise<Document[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 150,
    separators: ["\n\n", "\n", ". ", " ", ""],
  });
  const docs = await splitter.createDocuments([rawText], [metadata]);
  return docs.map(
    (d, i) =>
      new Document({
        pageContent: d.pageContent,
        metadata: { ...d.metadata, chunk: i },
      })
  );
}

export async function indexDocuments(
  documentId: string,
  docs: Document[]
): Promise<{ chunks: number; collection: string }> {
  const embeddings = getEmbeddings();
  const { url, apiKey } = getQdrantConfig();
  const collection = collectionFor(documentId);

  // Drop any prior collection with the same id so re-uploads start clean.
  const client = new QdrantClient({ url, apiKey });
  try {
    await client.deleteCollection(collection);
  } catch {
    // not-found is fine
  }

  await QdrantVectorStore.fromDocuments(docs, embeddings, {
    url,
    apiKey,
    collectionName: collection,
  });

  return { chunks: docs.length, collection };
}

export async function retrieveContext(
  documentId: string,
  query: string,
  k = 4
): Promise<Document[]> {
  const embeddings = getEmbeddings();
  const { url, apiKey } = getQdrantConfig();
  const collection = collectionFor(documentId);

  const store = await QdrantVectorStore.fromExistingCollection(embeddings, {
    url,
    apiKey,
    collectionName: collection,
  });

  return store.similaritySearch(query, k);
}
