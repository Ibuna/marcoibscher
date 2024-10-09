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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const mammoth_1 = __importDefault(require("mammoth"));
const sentence_splitter_1 = require("sentence-splitter");
const openai_1 = __importDefault(require("openai"));
const dotenv_1 = __importDefault(require("dotenv"));
const axios_1 = __importDefault(require("axios"));
const js_client_rest_1 = require("@qdrant/js-client-rest");
dotenv_1.default.config();
// Funktion zum Lesen von PDF-Dateien
function readPdf(filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        const dataBuffer = fs_1.default.readFileSync(filePath);
        const data = yield (0, pdf_parse_1.default)(dataBuffer);
        return data.text;
    });
}
// Funktion zum Lesen von Word-Dokumenten
function readWord(filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = yield mammoth_1.default.extractRawText({ path: filePath });
        return data.value;
    });
}
// Funktion zum Zerlegen des Textes in Sätze
function splitTextIntoSentences(text) {
    const result = (0, sentence_splitter_1.split)(text);
    return result
        .filter((node) => node.type === 'Sentence')
        .map((node) => node.raw);
}
/// Funktion zum Erstellen von semantischen Chunks mit OpenAI GPT-3.5
function createSemanticChunksWithGPT(text, chunkSize, openai) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
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
        const response = yield openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            max_tokens: maxTokens
        });
        const messageContent = (_a = response.choices[0].message) === null || _a === void 0 ? void 0 : _a.content;
        if (messageContent) {
            try {
                const cleanedJsonString = cleanText(messageContent);
                const chunksObject = JSON.parse(cleanedJsonString);
                if (typeof chunksObject === 'object' && chunksObject !== null) {
                    const chunks = Object.entries(chunksObject).map(([key, content]) => ({
                        key,
                        content: content
                    }));
                    // Embed the chunks
                    const embeddings = yield Promise.all(chunks.map((chunk) => __awaiter(this, void 0, void 0, function* () {
                        const embeddingResponse = yield openai.embeddings.create({
                            model: "text-embedding-ada-002",
                            input: chunk.content
                        });
                        return {
                            content: chunk.content,
                            embedding: embeddingResponse.data[0].embedding
                        };
                    })));
                    // Insert embeddings into Qdrant
                    yield insertIntoQdrant(embeddings);
                    return chunks;
                }
                else {
                    console.error("Die Antwort ist kein gültiges Objekt:", messageContent);
                    return [];
                }
            }
            catch (error) {
                console.error("Fehler beim Parsen der JSON-Antwort: " + messageContent, error);
                return [];
            }
        }
        else {
            console.error("Keine Antwort von der OpenAI API erhalten.");
            return [];
        }
    });
}
function cleanText(text) {
    return text
        .replace(/\\u00[0-7][0-9a-fA-F]/g, '') // Entferne nur spezifische Unicode-Escape-Sequenzen, die keine Umlaute betreffen
        .replace(/\n+/g, '\n') // Reduziere mehrere aufeinanderfolgende Zeilenumbrüche auf einen einzigen
        .replace(/\s+/g, ' ') // Reduziere mehrere Leerzeichen auf ein einzelnes Leerzeichen
        .trim(); // Entferne führende und nachfolgende Leerzeichen
}
function insertIntoQdrant(embeddings) {
    return __awaiter(this, void 0, void 0, function* () {
        const qdrantUrl = process.env.QDRANT_URL;
        const collectionName = process.env.QDRANT_COLLECTION;
        const client = new js_client_rest_1.QdrantClient({ url: qdrantUrl });
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
            const response = yield client.upsert(collectionName, {
                points
            });
            console.log("Qdrant response:", response); // Debugging: Log the response
        }
        catch (error) {
            console.error(`Error inserting into Qdrant: ${error.message}`);
        }
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const openai = new openai_1.default({
            apiKey: process.env.OPENAI_API_KEY,
        });
        const qdrantUrl = process.env.QDRANT_URL;
        const collectionName = process.env.QDRANT_COLLECTION;
        // Check if collection exists
        try {
            yield axios_1.default.get(`${qdrantUrl}/collections/${collectionName}`);
            // If the collection exists, delete it
            yield axios_1.default.delete(`${qdrantUrl}/collections/${collectionName}`);
            console.log(`Collection ${collectionName} deleted.`);
        }
        catch (error) {
            if (error.response && error.response.status === 404) {
                console.log(`Collection ${collectionName} does not exist.`);
            }
            else {
                console.error("Error checking/deleting collection:", error);
                return;
            }
        }
        // Create a new collection
        yield axios_1.default.put(`${qdrantUrl}/collections/${collectionName}`, {
            vectors: {
                size: 1536, // Size of the embeddings
                distance: "Cosine"
            }
        });
        console.log(`Collection ${collectionName} created.`);
        /* Beispielinhalt erstellen
        const exampleEmbeddings = [
            {
                content: "Dies ist ein Beispielinhalt.",
                embedding: Array(1536).fill(0.5) // Beispiel-Embedding mit 1536 Dimensionen
            }
        ];
    
        // Beispielinhalt in Qdrant einfügen
        await insertIntoQdrant(exampleEmbeddings);
        */
        // Verzeichnis mit den Dokumenten
        const documentsDir = './documents';
        const files = fs_1.default.readdirSync(documentsDir);
        for (const file of files) {
            const filePath = path_1.default.join(documentsDir, file);
            let text = '';
            if (file.endsWith('.pdf')) {
                text = yield readPdf(filePath);
            }
            else if (file.endsWith('.docx')) {
                text = yield readWord(filePath);
            }
            else {
                console.log(`Unsupported file type: ${file}`);
                continue;
            }
            const chunks = yield createSemanticChunksWithGPT(text, 1000, openai); // Erstelle semantische Chunks von maximal 1000 Zeichen
            // Hier kannst du die Chunks weiterverarbeiten, z.B. in eine Datenbank einfügen
            console.log(chunks);
        }
    });
}
main().catch(console.error);
//# sourceMappingURL=upsert.js.map