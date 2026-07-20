const mode = process.env.MODE ?? "verify";
const projectId = process.env.PROJECT_ID ?? "recepten-app-87beb";
const databaseId = process.env.DATABASE_ID ?? "(default)";
const bucketName =
    process.env.BACKUP_BUCKET ?? "recepten-archive-1021220092410";
const serviceAccountEmail =
    process.env.SERVICE_ACCOUNT_EMAIL ??
    "recepten-backup-job@recepten-app-87beb.iam.gserviceaccount.com";
const firebaseApiKey = process.env.FIREBASE_API_KEY;
const maxBackupAgeHours = Number(process.env.MAX_BACKUP_AGE_HOURS ?? "25");
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}`;

let accessToken = "";
let tokenExpiresAt = 0;
let firebaseIdToken = "";
let firebaseTokenExpiresAt = 0;

async function token() {
    if (accessToken && Date.now() < tokenExpiresAt - 60_000) {
        return accessToken;
    }
    const response = await fetch(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        { headers: { "Metadata-Flavor": "Google" } }
    );
    if (!response.ok) {
        throw new Error(`Cloud-identiteit ophalen mislukt: ${response.status}`);
    }
    const payload = await response.json();
    accessToken = payload.access_token;
    tokenExpiresAt = Date.now() + Number(payload.expires_in) * 1000;
    return accessToken;
}

async function authorizedRequest(url, bearerToken, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${bearerToken}`,
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers,
        },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(
            `${options.method ?? "GET"} ${url} mislukt: ${response.status} ${JSON.stringify(payload)}`
        );
    }
    return payload;
}

async function googleRequest(url, options = {}) {
    return authorizedRequest(url, await token(), options);
}

async function firebaseToken() {
    if (firebaseIdToken && Date.now() < firebaseTokenExpiresAt - 60_000) {
        return firebaseIdToken;
    }
    if (!firebaseApiKey) {
        throw new Error("FIREBASE_API_KEY ontbreekt.");
    }
    const now = Math.floor(Date.now() / 1000);
    const signed = await googleRequest(
        `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:signJwt`,
        {
            method: "POST",
            body: JSON.stringify({
                payload: JSON.stringify({
                    iss: serviceAccountEmail,
                    sub: serviceAccountEmail,
                    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
                    iat: now,
                    exp: now + 3600,
                    uid: "backup-automation",
                    claims: { backupAutomation: true },
                }),
            }),
        }
    );
    const exchange = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(firebaseApiKey)}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: signed.signedJwt, returnSecureToken: true }),
        }
    );
    const payload = await exchange.json();
    if (!exchange.ok) {
        throw new Error(`Firebase custom token geweigerd: ${JSON.stringify(payload)}`);
    }
    firebaseIdToken = payload.idToken;
    firebaseTokenExpiresAt = Date.now() + Number(payload.expiresIn) * 1000;
    return firebaseIdToken;
}

async function firebaseRequest(url, options = {}) {
    return authorizedRequest(url, await firebaseToken(), options);
}

function timestampPath(date = new Date()) {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function firestoreFields(state, values = {}) {
    const now = new Date().toISOString();
    const fields = {
        state: { stringValue: state },
        updatedAt: { timestampValue: now },
    };
    for (const [key, value] of Object.entries(values)) {
        if (value === undefined) {
            continue;
        }
        fields[key] =
            key.endsWith("At")
                ? { timestampValue: value === "now" ? now : value }
                : { stringValue: String(value) };
    }
    return fields;
}

async function setStatus(state, values = {}) {
    await firebaseRequest(`${firestoreBase}/documents/system/backupStatus`, {
        method: "PATCH",
        body: JSON.stringify({ fields: firestoreFields(state, values) }),
    });
}

async function waitForOperation(operationName) {
    while (true) {
        const operation = await googleRequest(
            `https://firestore.googleapis.com/v1/${operationName}`
        );
        if (operation.done) {
            if (operation.error) {
                throw new Error(`Firestore-export mislukt: ${JSON.stringify(operation.error)}`);
            }
            return operation.response;
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }
}

async function exportDatabase() {
    const outputUriPrefix = `gs://${bucketName}/daily/${timestampPath()}`;
    await setStatus("running", {
        outputUriPrefix,
        message: "Dagelijkse export gestart.",
    });
    const operation = await googleRequest(`${firestoreBase}:exportDocuments`, {
        method: "POST",
        body: JSON.stringify({ outputUriPrefix }),
    });
    await waitForOperation(operation.name);
    await setStatus("healthy", {
        outputUriPrefix,
        latestExportAt: "now",
        message: "Dagelijkse export voltooid.",
    });
    console.log(JSON.stringify({ mode, state: "healthy", outputUriPrefix }));
}

async function newestExportMetadata() {
    let pageToken = "";
    const files = [];
    do {
        const url = new URL(
            `https://storage.googleapis.com/storage/v1/b/${bucketName}/o`
        );
        url.searchParams.set("prefix", "daily/");
        url.searchParams.set("fields", "items(name,updated,timeCreated),nextPageToken");
        if (pageToken) {
            url.searchParams.set("pageToken", pageToken);
        }
        const page = await googleRequest(url);
        files.push(...(page.items ?? []));
        pageToken = page.nextPageToken ?? "";
    } while (pageToken);
    return files
        .filter((file) => file.name.endsWith(".overall_export_metadata"))
        .map((file) => ({
            name: file.name,
            updatedAt: Date.parse(file.updated ?? file.timeCreated ?? ""),
        }))
        .filter((file) => Number.isFinite(file.updatedAt))
        .sort((left, right) => right.updatedAt - left.updatedAt)[0];
}

async function verifyLatestExport() {
    const latest = await newestExportMetadata();
    const maxAgeMs = maxBackupAgeHours * 60 * 60 * 1000;
    if (!latest || Date.now() - latest.updatedAt > maxAgeMs) {
        await setStatus("stale", {
            latestVerifiedAt: "now",
            message: `Geen complete export jonger dan ${maxBackupAgeHours} uur gevonden.`,
        });
        throw new Error("Geïsoleerde Firestore-export ontbreekt of is te oud.");
    }
    await setStatus("healthy", {
        latestVerifiedAt: "now",
        message: "Geïsoleerde export gecontroleerd.",
    });
    console.log(
        JSON.stringify({
            mode,
            state: "healthy",
            metadataObject: latest.name,
            ageMinutes: Math.round((Date.now() - latest.updatedAt) / 60000),
        })
    );
}

async function backupStatus() {
    return firebaseRequest(`${firestoreBase}/documents/system/backupStatus`);
}

function timestampMillis(field) {
    return field?.timestampValue ? Date.parse(field.timestampValue) : Number.NaN;
}

async function expiredDeletionQueueEntries() {
    const results = await firebaseRequest(`${firestoreBase}/documents:runQuery`, {
        method: "POST",
        body: JSON.stringify({
            structuredQuery: {
                from: [{ collectionId: "recipeDeletionQueue", allDescendants: true }],
                limit: 50,
            },
        }),
    });
    const now = Date.now();
    return results.flatMap((result) => {
        const queueName = result.document?.name;
        const purgeAfter = Date.parse(
            result.document?.fields?.purgeAfter?.timestampValue ?? ""
        );
        if (!queueName || !Number.isFinite(purgeAfter) || purgeAfter > now) {
            return [];
        }
        return [
            {
                queueName,
                recipeName: queueName.replace(
                    "/recipeDeletionQueue/",
                    "/recipes/"
                ),
            },
        ];
    });
}

async function cleanupExpiredRecipes() {
    const status = await backupStatus();
    const verifiedMillis = timestampMillis(status.fields?.latestVerifiedAt);
    if (
        !Number.isFinite(verifiedMillis) ||
        Date.now() - verifiedMillis > maxBackupAgeHours * 60 * 60 * 1000
    ) {
        throw new Error("Opschoning geweigerd: er is geen recente geverifieerde back-up.");
    }

    let deleted = 0;
    while (true) {
        const entries = await expiredDeletionQueueEntries();
        if (entries.length === 0) {
            break;
        }
        await firebaseRequest(`${firestoreBase}/documents:commit`, {
            method: "POST",
            body: JSON.stringify({
                writes: entries.flatMap((entry) => [
                    { delete: entry.recipeName },
                    { delete: entry.queueName },
                ]),
            }),
        });
        deleted += entries.length;
    }
    console.log(JSON.stringify({ mode, deleted }));
}

async function main() {
    if (mode === "export") {
        await exportDatabase();
        return;
    }
    if (mode === "verify") {
        await verifyLatestExport();
        return;
    }
    if (mode === "cleanup") {
        await cleanupExpiredRecipes();
        return;
    }
    throw new Error(`Onbekende MODE: ${mode}`);
}

main().catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    try {
        await setStatus("failed", { message });
    } catch {
        // Cloud Logging blijft de bron wanneer Firestore zelf onbereikbaar is.
    }
    console.error(JSON.stringify({ mode, state: "failed", message }));
    process.exitCode = 1;
});
