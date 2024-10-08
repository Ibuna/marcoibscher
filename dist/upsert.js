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
const js_client_rest_1 = require("@qdrant/js-client-rest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const mammoth_1 = __importDefault(require("mammoth"));
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
// Funktion zum Zerlegen des Textes in Chunks
function chunkText(text, chunkSize) {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
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
        // Verzeichnis mit den Dokumenten
        const documentsDir = './documents';
        const files = fs_1.default.readdirSync(documentsDir);
        const allChunks = [];
        let idCounter = 1;
        const vectorSize = 20; // Feste Länge der Vektoren
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
            const chunks = chunkText(text, 1000); // Zerlege den Text in Chunks von 1000 Zeichen
            const points = chunks.map((chunk) => ({
                id: idCounter++,
                vector: embedChunk(chunk, vectorSize),
                payload: { text: chunk }
            }));
            allChunks.push(...points);
        }
        // Füge die Chunks in die Qdrant-Datenbank ein
        yield client.createCollection("document_chunks", {
            vectors: { size: vectorSize, distance: "Dot" },
        });
        const operationInfo = yield client.upsert("document_chunks", {
            wait: true,
            points: allChunks,
        });
        console.debug(operationInfo);
    });
}
// Hilfsfunktion zur Überprüfung, ob es sich um einen ApiError handelt
function isApiError(error) {
    return typeof error === 'object' && error !== null && 'response' in error;
}
main().catch(console.error);
