import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { split } from 'sentence-splitter';
import OpenAIApi from 'openai';
import dotenv from 'dotenv';
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
        .replace(/\\u00[0-9a-fA-F]{2}/g, '') // Entferne Unicode-Escape-Sequenzen
        .replace(/\n+/g, '\n') // Reduziere mehrere aufeinanderfolgende Zeilenumbrüche auf einen einzigen
        .replace(/\s+/g, ' ') // Reduziere mehrere Leerzeichen auf ein einzelnes Leerzeichen
        .trim(); // Entferne führende und nachfolgende Leerzeichen
}


async function main() {
    const openai = new OpenAIApi({
        apiKey: process.env.OPENAI_API_KEY,
    });

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