import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { split } from 'sentence-splitter';
import OpenAIApi from 'openai';
import dotenv from 'dotenv';
import axios from 'axios';
import { QdrantClient } from '@qdrant/js-client-rest';
dotenv.config();

// Manuelle Definition der Typen
interface TxtNode {
    type: string;
    raw: string;
    value?: string;
    children?: TxtNode[];
}

// Funktion zum Lesen von PDF-Dateien
async function readPdf(filePath: string): Promise<string> {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
}

// Funktion zum Lesen von Word-Dokumenten
async function readWord(filePath: string): Promise<string> {
    const data = await mammoth.extractRawText({ path: filePath });
    return data.value;
}

// Funktion zum Zerlegen des Textes in Sätze
function splitTextIntoSentences(text: string): string[] {
    const result = split(text);
    return result
        .filter((node: TxtNode) => node.type === 'Sentence')
        .map((node: TxtNode) => node.raw);
}

/// Funktion zum Erstellen von semantischen Chunks mit OpenAI GPT-3.5
async function createSemanticChunksWithGPT(text: string, chunkSize: number, openai: OpenAIApi): Promise<{ key: string, content: string }[]> {
    let prompt = `
        Teile den folgenden Text in sinnvolle Chunks von maximal ${chunkSize} Zeichen und gib sie in einem JSON-Format zurück. Jedes Chunk-Objekt soll nur den Chunk-Text enthalten und als Key eine fortlaufende Zahl haben. Der gesamte Text, einschließlich Auflistungen und aller anderen Teile, soll in den Chunks verarbeitet werden. Es soll nichts verloren gehen.

        Text:
        ${text}

        Beispiel für das gewünschte JSON-Format:
        {
        "1": "Erster Chunk-Text...",
        "2": "Zweiter Chunk-Text...",
        "3": "Dritter Chunk-Text..."
        }
    `;

    prompt = cleanText(prompt);

    // Berechne die Anzahl der Token im Prompt
    const promptTokens = prompt.split(/\s+/).length;

    // Setze die maximale Anzahl von Token für die Antwort
    const maxTokens = 4096 - promptTokens;

    const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens
    });

    const messageContent = response.choices[0].message?.content;
    if (messageContent) {
        try {
            const cleanedJsonString = cleanText(messageContent);
            const chunksObject = JSON.parse(cleanedJsonString);
            if (typeof chunksObject === 'object' && chunksObject !== null) {
                const chunks = Object.entries(chunksObject).map(([key, content]) => ({
                    key,
                    content: content as string
                }));

                // Embed the chunks
                const embeddings = await Promise.all(chunks.map(async chunk => {
                    const embeddingResponse = await openai.embeddings.create({
                        model: "text-embedding-ada-002",
                        input: chunk.content
                    });
                    return {
                        content: chunk.content,
                        embedding: embeddingResponse.data[0].embedding
                    };
                }));

                // Insert embeddings into Qdrant
                await insertIntoQdrant(embeddings);

                return chunks;
            } else {
                console.error("Die Antwort ist kein gültiges Objekt:", messageContent);
                return [];
            }
        } catch (error) {
            console.error("Fehler beim Parsen der JSON-Antwort: " + messageContent, error);
            return [];
        }
    } else {
        console.error("Keine Antwort von der OpenAI API erhalten.");
        return [];
    }
}

function cleanText(text: string): string {
    return text
        .replace(/\\u00[0-7][0-9a-fA-F]/g, '') // Entferne nur spezifische Unicode-Escape-Sequenzen, die keine Umlaute betreffen
        .replace(/\n+/g, '\n') // Reduziere mehrere aufeinanderfolgende Zeilenumbrüche auf einen einzigen
        .replace(/\s+/g, ' ') // Reduziere mehrere Leerzeichen auf ein einzelnes Leerzeichen
        .trim(); // Entferne führende und nachfolgende Leerzeichen
}

async function insertIntoQdrant(embeddings: { content: string, embedding: number[] }[]) {
    const qdrantUrl = process.env.QDRANT_URL;
    const collectionName = process.env.QDRANT_COLLECTION;

    const client = new QdrantClient({ url: qdrantUrl });

    if (!collectionName) {
        throw new Error("QDRANT_COLLECTION is not defined in the environment variables.");
    }

    const points = embeddings.map((embedding, index) => ({
        id: index + 1, // Ensure IDs start from 1
        vector: embedding.embedding,
        payload: { content: embedding.content }
    }));

    console.log("Points to be inserted:", JSON.stringify(points, null, 2)); // Debugging: Log the points

    try {
        const response = await client.upsert(collectionName, {
            points
        });
        console.log("Qdrant response:", response); // Debugging: Log the response
    } catch (error: any) {
        console.error(`Error inserting into Qdrant: ${error.message}`);
    }
}

async function main() {
    const openai = new OpenAIApi({
        apiKey: process.env.OPENAI_API_KEY,
    });

    const qdrantUrl = process.env.QDRANT_URL;
    const collectionName = process.env.QDRANT_COLLECTION;

    // Check if collection exists
    try {
        await axios.get(`${qdrantUrl}/collections/${collectionName}`);
        // If the collection exists, delete it
        await axios.delete(`${qdrantUrl}/collections/${collectionName}`);
        console.log(`Collection ${collectionName} deleted.`);
    } catch (error: any) {
        if (error.response && error.response.status === 404) {
            console.log(`Collection ${collectionName} does not exist.`);
        } else {
            console.error("Error checking/deleting collection:", error);
            return;
        }
    }

    // Create a new collection
    await axios.put(`${qdrantUrl}/collections/${collectionName}`, {
        vectors: {
            size: 1536, // Size of the embeddings
            distance: "Cosine"
        }
    });
    console.log(`Collection ${collectionName} created.`);

    // Verzeichnis mit den Dokumenten
    const documentsDir = './documents';
    const files = fs.readdirSync(documentsDir);

    for (const file of files) {
        const filePath = path.join(documentsDir, file);
        let text = '';

        if (file.endsWith('.pdf')) {
            text = await readPdf(filePath);
        } else if (file.endsWith('.docx')) {
            text = await readWord(filePath);
        } else {
            console.log(`Unsupported file type: ${file}`);
            continue;
        }

        const chunks = await createSemanticChunksWithGPT(text, 1000, openai); // Erstelle semantische Chunks von maximal 1000 Zeichen

        // Hier kannst du die Chunks weiterverarbeiten, z.B. in eine Datenbank einfügen
        console.log(chunks);
    }
}

main().catch(console.error);