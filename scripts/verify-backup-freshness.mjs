import { getGoogleAccessToken } from "./lib/google-auth.mjs";

const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? "recepten-app-87beb";
const databaseId = process.env.FIRESTORE_DATABASE ?? "(default)";
const maxAgeHours = Number(process.env.MAX_BACKUP_AGE_HOURS ?? "25");

function timestampMillis(field) {
    return field?.timestampValue ? Date.parse(field.timestampValue) : Number.NaN;
}

const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/system/backupStatus`,
    { headers: { Authorization: `Bearer ${getGoogleAccessToken()}` } }
);

if (!response.ok) {
    throw new Error(
        `Back-upstatus kon niet worden gelezen (${response.status}). Deploy is gestopt.`
    );
}

const document = await response.json();
const state = document.fields?.state?.stringValue;
const verifiedAt = timestampMillis(document.fields?.latestVerifiedAt);
const ageHours = (Date.now() - verifiedAt) / 3_600_000;

if (
    state !== "healthy" ||
    !Number.isFinite(verifiedAt) ||
    ageHours < 0 ||
    ageHours > maxAgeHours
) {
    throw new Error(
        `Back-up is niet vers genoeg (status=${state ?? "onbekend"}, leeftijd=${
            Number.isFinite(ageHours) ? ageHours.toFixed(1) : "onbekend"
        } uur). Deploy is gestopt.`
    );
}

console.log(
    `Back-upcontrole geslaagd: status healthy, ${ageHours.toFixed(1)} uur geleden geverifieerd.`
);
