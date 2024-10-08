import { QdrantClient } from "@qdrant/js-client-rest";
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

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

// Funktion zum Zerlegen des Textes in Chunks
function chunkText(text: string, chunkSize: number): string[] {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
}

// Beispiel-Funktion zum Umwandeln eines Chunks in einen Vektor (Dummy-Implementierung)
function embedChunk(chunk: string, vectorSize: number): number[] {
    // Hier solltest du ein echtes Embedding-Modell verwenden
    const vector = new Array(vectorSize).fill(0);
    chunk.split('').forEach((char, index) => {
        if (index < vectorSize) {
            vector[index] = char.charCodeAt(0) / 255;
        }
    });
    return vector;
}

async function main() {
    const client = new QdrantClient({ host: "localhost", port: 6333 });

    // Lösche die Collection, falls sie bereits existiert
    try {
        await client.deleteCollection("document_chunks");
        console.log("Collection 'document_chunks' gelöscht.");
    } catch (error) {
        if (isApiError(error) && error.response?.status === 404) {
            console.log("Collection 'document_chunks' existiert nicht.");
        } else {
            throw error;
        }
    }

    // Verzeichnis mit den Dokumenten
    const documentsDir = './documents';
    const files = fs.readdirSync(documentsDir);

    const allChunks: { id: number, vector: number[], payload: { text: string } }[] = [];
    let idCounter = 1;
    const vectorSize = 20; // Feste Länge der Vektoren

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

        const chunks = chunkText(text, 1000); // Zerlege den Text in Chunks von 1000 Zeichen
        const points = chunks.map((chunk) => ({
            id: idCounter++,
            vector: embedChunk(chunk, vectorSize),
            payload: { text: chunk }
        }));

        allChunks.push(...points);
    }

    // Füge die Chunks in die Qdrant-Datenbank ein
    await client.createCollection("document_chunks", {
        vectors: { size: vectorSize, distance: "Dot" },
    });

    const operationInfo = await client.upsert("document_chunks", {
        wait: true,
        points: allChunks,
    });

    console.debug(operationInfo);
}

// Hilfsfunktion zur Überprüfung, ob es sich um einen ApiError handelt
function isApiError(error: unknown): error is { response?: { status: number } } {
    return typeof error === 'object' && error !== null && 'response' in error;
}

main().catch(console.error);