import { createHash } from "node:crypto";
import { getGoogleAccessToken } from "./lib/google-auth.mjs";
import {
    isRecipeDocumentPath,
    partitionMismatchPaths,
} from "./lib/firestore-paths.mjs";

const args = Object.fromEntries(
    process.argv.slice(2).map((entry) => {
        const [key, ...value] = entry.replace(/^--/, "").split("=");
        return [key, value.join("=")];
    })
);

const projectId = args.project ?? "recepten-app-87beb";
const sourceDatabase = args.source ?? "(default)";
const restoredDatabase = args.restored;
const sourceReadTime = args["source-read-time"];
const ignoredPaths = (args["ignore-paths"] ?? "")
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean);
if (!restoredDatabase || restoredDatabase === "(default)") {
    throw new Error("Gebruik --restored=<tijdelijke-database>; productie is niet toegestaan.");
}

const token = getGoogleAccessToken();
const headers = { Authorization: `Bearer ${token}` };

async function jsonRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            ...headers,
            ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
    });
    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} voor ${url}`);
    }
    return response.json();
}

async function collectionIds(database, documentPath = "") {
    const suffix = documentPath
        ? `/documents/${documentPath}:listCollectionIds`
        : "/documents:listCollectionIds";
    const result = await jsonRequest(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${database}${suffix}`,
        {
            method: "POST",
            body: JSON.stringify({
                pageSize: 1000,
                ...(database === sourceDatabase && sourceReadTime
                    ? { readTime: sourceReadTime }
                    : {}),
            }),
        }
    );
    return result.collectionIds ?? [];
}

function canonical(value) {
    if (Array.isArray(value)) {
        return `[${value.map(canonical).join(",")}]`;
    }
    if (value && typeof value === "object") {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}

async function allDocuments(database) {
    const queue = [...(await collectionIds(database))];
    const documents = new Map();
    while (queue.length > 0) {
        const collectionPath = queue.shift();
        let pageToken = "";
        do {
            const url = new URL(
                `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${database}/documents/${collectionPath}`
            );
            url.searchParams.set("pageSize", "1000");
            if (database === sourceDatabase && sourceReadTime) {
                url.searchParams.set("readTime", sourceReadTime);
            }
            if (pageToken) {
                url.searchParams.set("pageToken", pageToken);
            }
            const page = await jsonRequest(url);
            for (const document of page.documents ?? []) {
                const relativePath = document.name.replace(/^.*\/documents\//, "");
                documents.set(relativePath, {
                    hash: createHash("sha256")
                        .update(canonical(document.fields ?? {}))
                        .digest("hex"),
                    hasImage: Boolean(document.fields?.image),
                });
                for (const subcollection of await collectionIds(database, relativePath)) {
                    queue.push(`${relativePath}/${subcollection}`);
                }
            }
            pageToken = page.nextPageToken ?? "";
        } while (pageToken);
    }
    return documents;
}

const [source, restored] = await Promise.all([
    allDocuments(sourceDatabase),
    allDocuments(restoredDatabase),
]);
const paths = [...new Set([...source.keys(), ...restored.keys()])].sort();
const allMismatches = paths.filter(
    (path) =>
        !source.has(path) ||
        !restored.has(path) ||
        source.get(path).hash !== restored.get(path).hash
);
const { relevant: mismatches, ignored: ignoredMismatches } =
    partitionMismatchPaths(allMismatches, ignoredPaths);
const sourceRecipes = [...source.keys()].filter(isRecipeDocumentPath);
const restoredRecipes = [...restored.keys()].filter(isRecipeDocumentPath);
const result = {
    sourceReadTime: sourceReadTime ?? "latest",
    sourceDocuments: source.size,
    restoredDocuments: restored.size,
    sourceRecipes: sourceRecipes.length,
    restoredRecipes: restoredRecipes.length,
    sourceRecipeImages: sourceRecipes.filter((path) => source.get(path).hasImage).length,
    restoredRecipeImages: restoredRecipes.filter((path) => restored.get(path).hasImage)
        .length,
    mismatches: mismatches.length,
    mismatchPaths: mismatches.slice(0, 10),
    ignoredMismatches: ignoredMismatches.length,
    ignoredMismatchPaths: ignoredMismatches.slice(0, 10),
};
console.log(JSON.stringify(result, null, 2));
if (mismatches.length > 0 || source.size !== restored.size) {
    process.exitCode = 1;
}
