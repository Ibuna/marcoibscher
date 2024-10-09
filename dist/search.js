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
const express_1 = __importDefault(require("express"));
const js_client_rest_1 = require("@qdrant/js-client-rest");
const openai_1 = __importDefault(require("openai"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = 3000;
const qdrantClient = new js_client_rest_1.QdrantClient({ url: 'http://localhost:6333' });
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
app.use(express_1.default.json());
// Statische Dateien aus dem Verzeichnis "public" bereitstellen
app.use(express_1.default.static('public'));
function searchEmbeddings(query) {
    return __awaiter(this, void 0, void 0, function* () {
        const embeddingResponse = yield openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: query
        });
        const queryEmbedding = embeddingResponse.data[0].embedding;
        const searchResults = yield qdrantClient.search('marcoibscher', {
            vector: queryEmbedding,
            limit: 10
        });
        return searchResults;
    });
}
app.post('/search', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { query } = req.body;
    try {
        const results = yield searchEmbeddings(query);
        const contents = results.map((result) => result.payload.content); // Extrahieren Sie die Inhalte
        // Prompt für OpenAI API erstellen
        const prompt = `Beantworte die folgende Frage basierend auf diesen Informationen:\n\nFrage: ${query}\n\nInformationen:\n${contents.join('\n')}\n\nAntwort:`;
        // Sending a request to the OpenAI API
        const completionResponse = yield openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "Du bist ein ehemaliger Arbeitskollege von Marco und beantwortest die Frage wohlwollend." },
                { role: "user", content: prompt }
            ],
            max_tokens: 500,
        });
        const answerText = completionResponse.choices[0].message.content;
        res.json({ answer: answerText });
    }
    catch (error) {
        const errorMessage = (error instanceof Error) ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: errorMessage });
    }
}));
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
//# sourceMappingURL=search.js.map