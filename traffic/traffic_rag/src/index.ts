import { Hono } from 'hono'

// Cloudflare Workers AI and Vectorize Types
interface VectorizeIndex {
  query(vector: number[], options: { topK: number; returnMetadata: boolean }): Promise<{ matches: VectorizeMatch[] }>;
  upsert(vectors: VectorizeVector[]): Promise<void>;
}

interface VectorizeVector {
  id: string;
  values: number[];
  metadata?: Record<string, any>;
}

interface VectorizeMatch {
  id: string;
  score: number;
  values?: number[];
  metadata?: Record<string, any>;
}

type Bindings = {
  AI: any
  VECTORIZE: VectorizeIndex
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', (c) => {
  return c.text('Advanced RAG on Cloudflare Workers AI is running!')
})

// Utility: Simple Recursive Character Splitter
function chunkText(text: string, chunkSize: number = 800, overlap: number = 100): string[] {
  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + chunkSize;
    if (endIndex > text.length) {
      endIndex = text.length;
    } else {
      const lastSpace = text.lastIndexOf(' ', endIndex);
      if (lastSpace > startIndex) {
        endIndex = lastSpace;
      }
    }

    chunks.push(text.slice(startIndex, endIndex).trim());
    startIndex = endIndex - overlap;
    if (startIndex < 0) startIndex = 0;
    if (startIndex >= text.length - overlap) break;
  }

  return chunks;
}

// Ingestion Endpoint
app.post('/ingest', async (c) => {
  const { text, title } = await c.req.json()
  if (!text) return c.json({ error: 'Text is required' }, 400)

  const chunks = chunkText(text);
  const vectors: VectorizeVector[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Generate embedding
    const { data: [embedding] } = await c.env.AI.run('@cf/baai/bge-small-en-v1.5', {
      text: [chunk]
    });

    vectors.push({
      id: `${title || 'doc'}-${Date.now()}-${i}`,
      values: embedding,
      metadata: { text: chunk, title: title || 'Untitled' }
    });
  }

  // Batch upsert to Vectorize
  await c.env.VECTORIZE.upsert(vectors);

  return c.json({ 
    message: 'Successfully ingested document', 
    chunks: chunks.length 
  })
})

// Query Endpoint
app.post('/query', async (c) => {
  const { question } = await c.req.json()
  if (!question) return c.json({ error: 'Question is required' }, 400)

  // Step 1: Query Expansion (Indian Traffic Context)
  const expansionPrompt = `
    You are an expert in Indian traffic laws, the Motor Vehicles Act (including 2019/2025 updates), and the Bharatiya Nyaya Sanhita (BNS 2023).
    User question: ${question}
    Generate 3 variations of this question to improve retrieval from Indian legal databases (e.g., mention "Sections", "BNS", "Challan", "MORTH guidelines").
    Separate with newlines.
  `;

  const expansionResult = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
    prompt: expansionPrompt
  });

  const queries = [question, ...expansionResult.response.split('\n').filter((q: string) => q.trim())];

  // Step 2: Multi-Query Vector Search
  const allMatches = await Promise.all(queries.map(async (q) => {
    const { data: [embedding] } = await c.env.AI.run('@cf/baai/bge-small-en-v1.5', {
      text: [q]
    });
    const { matches } = await c.env.VECTORIZE.query(embedding, { topK: 5, returnMetadata: true });
    return matches;
  }));

  // Step 3: Deduplicate
  const uniqueMatches = new Map<string, VectorizeMatch>();
  allMatches.flat().forEach(match => {
    if (!uniqueMatches.has(match.id)) uniqueMatches.set(match.id, match);
  });

  const candidates = Array.from(uniqueMatches.values());

  // Step 4: Re-ranking (Indian Legal Expert)
  const rerankPrompt = `
    You are a senior Indian Legal Counsel specializing in road safety and traffic litigation.
    Question: ${question}
    Below are snippets from the Motor Vehicles Act and Bharatiya Nyaya Sanhita (BNS).
    Identify the chunks that contain accurate legal provisions, penalties, or protocols for the Indian context.
    List the IDs of the relevant chunks, separated by commas.
    
    Chunks:
    ${candidates.map(c => `ID: ${c.id}\nText: ${c.metadata?.text}`).join('\n\n')}
  `;

  const rerankResult = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
    prompt: rerankPrompt
  });

  const relevantIds = rerankResult.response.split(',').map((id: string) => id.trim());
  const contextChunks = candidates
    .filter(c => relevantIds.includes(c.id) || relevantIds.some((rid: string) => rid.includes(c.id)))
    .map(c => c.metadata?.text);

  const context = (contextChunks.length > 0 ? contextChunks : candidates.slice(0, 3).map(c => c.metadata?.text))
    .join('\n\n---\n\n');

  // Step 5: Final Generation (Official Legal Stance)
  const finalPrompt = `
    You are an authoritative AI assistant specializing in Indian Traffic Laws (MV Act & BNS 2023).
    Answer the following question using the provided context. 
    Ensure you specify the relevant Section or Act if available in the context.
    Mention if the rules are as per the latest 2024-2025 updates if relevant.
    
    Question: ${question}
    Context:
    ${context}
    
    Answer:
  `;

  const { response } = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
    prompt: finalPrompt
  });

  return c.json({ 
    answer: response, 
    contextUsed: contextChunks.length || 3,
    expandedQueries: queries
  });
})

export default app
