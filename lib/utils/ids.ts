const INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createId(): string {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createInviteCode(length = 6): string {
    let result = "";
    for (let i = 0; i < length; i += 1) {
        const index = Math.floor(Math.random() * INVITE_CHARS.length);
        result += INVITE_CHARS[index];
    }
    return result;
}
