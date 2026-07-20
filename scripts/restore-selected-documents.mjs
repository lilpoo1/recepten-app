import { createHash } from "node:crypto";
import { getGoogleAccessToken } from "./lib/google-auth.mjs";

const args = Object.fromEntries(
    process.argv.slice(2).map((entry) => {
        const [key, ...value] = entry.replace(/^--/, "").split("=");
        return [key, value.join("=")];
    })
);

const projectId = args.project ?? "recepten-app-87beb";
const sourceDatabase = args.source;
const paths = (args.paths ?? "")
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean);
const apply = args.apply === "true";
const confirmation = args.confirm;

if (!sourceDatabase || sourceDatabase === "(default)") {
    throw new Error("--source moet een gecontroleerde tijdelijke hersteldatabase zijn.");
}
if (paths.length === 0) {
    throw new Error("--paths moet één of meer expliciete documentpaden bevatten.");
}
if (paths.some((path) => path.startsWith("/") || path.split("/").length % 2 !== 0)) {
    throw new Error("Elk documentpad moet relatief zijn en op een document eindigen.");
}
if (apply && confirmation !== "RESTORE_SELECTED_TO_PRODUCTION") {
    throw new Error(
        "Voor schrijven is --confirm=RESTORE_SELECTED_TO_PRODUCTION verplicht."
    );
}

const accessToken = getGoogleAccessToken();
const headers = { Authorization: `Bearer ${accessToken}` };
const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases`;

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

function hash(fields) {
    return createHash("sha256").update(canonical(fields ?? {})).digest("hex");
}

async function request(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            ...headers,
            ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
    });
    if (response.status === 404) {
        return null;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(`${response.status} voor ${url}: ${JSON.stringify(payload)}`);
    }
    return payload;
}

const comparisons = [];
for (const path of paths) {
    const encodedPath = path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    const [source, production] = await Promise.all([
        request(`${base}/${sourceDatabase}/documents/${encodedPath}`),
        request(`${base}/(default)/documents/${encodedPath}`),
    ]);
    if (!source) {
        throw new Error(`Bron bevat document niet: ${path}`);
    }
    comparisons.push({
        path,
        sourceFields: source.fields ?? {},
        sourceHash: hash(source.fields),
        productionHash: production ? hash(production.fields) : null,
        productionExists: Boolean(production),
    });
}

console.log(
    JSON.stringify(
        {
            mode: apply ? "apply" : "dry-run",
            sourceDatabase,
            documents: comparisons.map(
                ({ path, sourceHash, productionHash, productionExists }) => ({
                    path,
                    sourceHash,
                    productionHash,
                    productionExists,
                    differs: sourceHash !== productionHash,
                })
            ),
        },
        null,
        2
    )
);

if (!apply) {
    console.log(
        "Dry-run voltooid. Controleer elk pad en herhaal alleen dan met --apply=true en de bevestiging."
    );
    process.exit(0);
}

const writes = comparisons.map(({ path, sourceFields }) => ({
    update: {
        name: `${base.replace("https://firestore.googleapis.com/v1/", "")}/(default)/documents/${path}`,
        fields: sourceFields,
    },
}));
await request(`${base}/(default)/documents:commit`, {
    method: "POST",
    body: JSON.stringify({ writes }),
});

for (const { path, sourceHash } of comparisons) {
    const encodedPath = path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    const restored = await request(`${base}/(default)/documents/${encodedPath}`);
    if (!restored || hash(restored.fields) !== sourceHash) {
        throw new Error(`Nacontrole mislukt voor ${path}.`);
    }
}
console.log(`${comparisons.length} geselecteerde documenten hersteld en geverifieerd.`);
