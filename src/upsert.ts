import { QdrantClient } from "@qdrant/js-client-rest";

// Beispiel-Dokument
const document = "Dies ist ein Beispieltext, der in kleinere Chunks zerlegt und in die Qdrant-Datenbank eingefügt werden soll.";

// Funktion zum Zerlegen des Dokuments in Chunks
function chunkDocument(doc: string, chunkSize: number): string[] {
    const chunks = [];
    for (let i = 0; i < doc.length; i += chunkSize) {
        chunks.push(doc.slice(i, i + chunkSize));
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

    // Zerlege das Dokument in Chunks
    const chunks = chunkDocument(document, 20);

    // Erstelle die Vektoren für die Chunks
    const vectorSize = 20; // Feste Länge der Vektoren
    const points = chunks.map((chunk, index) => ({
        id: index + 1,
        vector: embedChunk(chunk, vectorSize),
        payload: { text: chunk }
    }));

    // Füge die Chunks in die Qdrant-Datenbank ein
    await client.createCollection("document_chunks", {
        vectors: { size: vectorSize, distance: "Dot" },
    });

    const operationInfo = await client.upsert("document_chunks", {
        wait: true,
        points: points,
    });

    console.debug(operationInfo);
}

// Hilfsfunktion zur Überprüfung, ob es sich um einen ApiError handelt
function isApiError(error: unknown): error is { response?: { status: number } } {
    return typeof error === 'object' && error !== null && 'response' in error;
}

main().catch(console.error);