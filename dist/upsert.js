"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const js_client_rest_1 = require("@qdrant/js-client-rest");
// Beispiel-Dokument
const document = "Dies ist ein Beispieltext, der in kleinere Chunks zerlegt und in die Qdrant-Datenbank eingefügt werden soll.";
// Funktion zum Zerlegen des Dokuments in Chunks
function chunkDocument(doc, chunkSize) {
    const chunks = [];
    for (let i = 0; i < doc.length; i += chunkSize) {
        chunks.push(doc.slice(i, i + chunkSize));
    }
    return chunks;
}
// Beispiel-Funktion zum Umwandeln eines Chunks in einen Vektor (Dummy-Implementierung)
function embedChunk(chunk, vectorSize) {
    // Hier solltest du ein echtes Embedding-Modell verwenden
    const vector = new Array(vectorSize).fill(0);
    chunk.split('').forEach((char, index) => {
        if (index < vectorSize) {
            vector[index] = char.charCodeAt(0) / 255;
        }
    });
    return vector;
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const client = new js_client_rest_1.QdrantClient({ host: "localhost", port: 6333 });
        // Lösche die Collection, falls sie bereits existiert
        try {
            yield client.deleteCollection("document_chunks");
            console.log("Collection 'document_chunks' gelöscht.");
        }
        catch (error) {
            if (isApiError(error) && ((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) === 404) {
                console.log("Collection 'document_chunks' existiert nicht.");
            }
            else {
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
        yield client.createCollection("document_chunks", {
            vectors: { size: vectorSize, distance: "Dot" },
        });
        const operationInfo = yield client.upsert("document_chunks", {
            wait: true,
            points: points,
        });
        console.debug(operationInfo);
    });
}
// Hilfsfunktion zur Überprüfung, ob es sich um einen ApiError handelt
function isApiError(error) {
    return typeof error === 'object' && error !== null && 'response' in error;
}
main().catch(console.error);
