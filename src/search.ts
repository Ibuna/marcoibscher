import express from 'express';
import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAIApi from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const port = 3000;

const qdrantClient = new QdrantClient({ url: 'http://localhost:6333' });
const openai = new OpenAIApi({
    apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.json());

// Statische Dateien aus dem Verzeichnis "public" bereitstellen
app.use(express.static('public'));

async function searchEmbeddings(query: string): Promise<any> {
    const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: query
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    const searchResults = await qdrantClient.search(
        'marcoibscher',
        {
            vector: queryEmbedding,
            limit: 10
        }
    );

    return searchResults;
}

app.post('/search', async (req, res) => {
    const { query } = req.body;
    try {
        const results = await searchEmbeddings(query);

        const contents = results.map((result: any) => result.payload.content); // Extrahieren Sie die Inhalte

        // Prompt für OpenAI API erstellen
        const prompt = `Beantworte die folgende Frage basierend auf diesen Informationen:\n\nFrage: ${query}\n\nInformationen:\n${contents.join('\n')}\n\nAntwort:`;

        // Sending a request to the OpenAI API
        const completionResponse = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "Du bist ein ehemaliger Arbeitskollege von Marco und beantwortest die Frage wohlwollend." },
                { role: "user", content: prompt }
            ],
            max_tokens: 500,
        });

        const answerText = completionResponse.choices[0].message.content;
        res.json({ answer: answerText });
    } catch (error) {
        const errorMessage = (error instanceof Error) ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: errorMessage });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});