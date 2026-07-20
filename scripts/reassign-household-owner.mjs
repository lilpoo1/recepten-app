import { getGoogleAccessToken } from "./lib/google-auth.mjs";

const args = Object.fromEntries(
    process.argv.slice(2).map((entry) => {
        const [key, ...value] = entry.replace(/^--/, "").split("=");
        return [key, value.join("=")];
    })
);
const projectId = args.project ?? "recepten-app-87beb";
const householdId = args.household;
const newUid = args["new-uid"];
const apply = args.apply === "true";
const confirmation = args.confirm;

if (!householdId || !newUid) {
    throw new Error("--household en --new-uid zijn verplicht. Gebruik nooit een e-mailadres.");
}
if (newUid.includes("@")) {
    throw new Error("Gebruik uitsluitend de Firebase UID, nooit een e-mailadres.");
}
if (apply && confirmation !== `REASSIGN_OWNER_${householdId}`) {
    throw new Error(
        `Voor schrijven is --confirm=REASSIGN_OWNER_${householdId} verplicht.`
    );
}

const token = getGoogleAccessToken();
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const root = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(`${response.status} voor ${url}: ${JSON.stringify(payload)}`);
    }
    return payload;
}

const household = await request(
    `${root}/households/${encodeURIComponent(householdId)}`
);
const previousOwnerUid = household.fields?.ownerUid?.stringValue;
if (!previousOwnerUid) {
    throw new Error("Huishouden heeft geen geldige huidige ownerUid.");
}
if (previousOwnerUid === newUid) {
    throw new Error("De nieuwe UID is al eigenaar; er is niets te herstellen.");
}
const [previousMembership, previousMember] = await Promise.all([
    request(`${root}/userMemberships/${encodeURIComponent(previousOwnerUid)}`),
    request(
        `${root}/households/${encodeURIComponent(
            householdId
        )}/members/${encodeURIComponent(previousOwnerUid)}`
    ),
]);

console.log(
    JSON.stringify(
        {
            mode: apply ? "apply" : "dry-run",
            householdId,
            previousOwnerUid,
            newUid,
            emailStored: false,
        },
        null,
        2
    )
);
if (!apply) {
    process.exit(0);
}

const now = new Date().toISOString();
const householdName = household.name;
await request(`${root}:commit`, {
    method: "POST",
    body: JSON.stringify({
        writes: [
            {
                update: {
                    name: householdName,
                    fields: {
                        ...household.fields,
                        ownerUid: { stringValue: newUid },
                        updatedAt: { timestampValue: now },
                    },
                },
            },
            {
                update: {
                    name: `${root.replace(
                        "https://firestore.googleapis.com/v1/",
                        ""
                    )}/households/${householdId}/members/${newUid}`,
                    fields: {
                        role: { stringValue: "owner" },
                        joinedAt: { timestampValue: now },
                    },
                },
            },
            {
                update: {
                    name: `${root.replace(
                        "https://firestore.googleapis.com/v1/",
                        ""
                    )}/userMemberships/${newUid}`,
                    fields: {
                        householdId: { stringValue: householdId },
                        role: { stringValue: "owner" },
                        joinedAt: { timestampValue: now },
                    },
                },
            },
            {
                update: {
                    name: previousMember.name,
                    fields: {
                        ...previousMember.fields,
                        role: { stringValue: "member" },
                    },
                },
            },
            {
                update: {
                    name: previousMembership.name,
                    fields: {
                        ...previousMembership.fields,
                        role: { stringValue: "member" },
                    },
                },
            },
        ],
    }),
});
console.log(
    "Eigenaarschap opnieuw toegewezen; oude UID is behouden en teruggezet naar lid."
);
