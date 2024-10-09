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
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const client = new js_client_rest_1.QdrantClient({ host: "localhost", port: 6333 });
        //await upsertPoints(client);
        yield queryPoints(client);
        yield queryWithFilter(client);
        console.log('Hello, TypeScript');
    });
}
function queryPoints(client) {
    return __awaiter(this, void 0, void 0, function* () {
        let searchResult = yield client.query("test_collection", {
            query: [0.2, 0.1, 0.9, 0.7],
            limit: 3
        });
        console.debug(searchResult.points);
    });
}
function queryWithFilter(client) {
    return __awaiter(this, void 0, void 0, function* () {
        let searchResult = yield client.query("test_collection", {
            query: [0.2, 0.1, 0.9, 0.7],
            filter: {
                must: [{ key: "city", match: { value: "London" } }],
            },
            with_payload: true,
            limit: 3,
        });
        console.debug(searchResult);
    });
}
function upsertPoints(client) {
    return __awaiter(this, void 0, void 0, function* () {
        yield client.createCollection("test_collection", {
            vectors: { size: 4, distance: "Dot" },
        });
        const operationInfo = yield client.upsert("test_collection", {
            wait: true,
            points: [
                { id: 1, vector: [0.05, 0.61, 0.76, 0.74], payload: { city: "Berlin" } },
                { id: 2, vector: [0.19, 0.81, 0.75, 0.11], payload: { city: "London" } },
                { id: 3, vector: [0.36, 0.55, 0.47, 0.94], payload: { city: "Moscow" } },
                { id: 4, vector: [0.18, 0.01, 0.85, 0.80], payload: { city: "New York" } },
                { id: 5, vector: [0.24, 0.18, 0.22, 0.44], payload: { city: "Beijing" } },
                { id: 6, vector: [0.35, 0.08, 0.11, 0.44], payload: { city: "Mumbai" } },
            ],
        });
        console.debug(operationInfo);
    });
}
main().catch(console.error);
//# sourceMappingURL=index.js.map