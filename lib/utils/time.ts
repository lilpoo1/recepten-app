interface FirestoreTimestamp {
    toMillis: () => number;
}

function isFirestoreTimestamp(value: unknown): value is FirestoreTimestamp {
    return (
        typeof value === "object" &&
        value !== null &&
        "toMillis" in value &&
        typeof (value as FirestoreTimestamp).toMillis === "function"
    );
}

export function toMillis(value: unknown, fallback = Date.now()): number {
    if (typeof value === "number") {
        return value;
    }

    if (isFirestoreTimestamp(value)) {
        return value.toMillis();
    }

    return fallback;
}
