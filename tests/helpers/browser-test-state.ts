import "fake-indexeddb/auto";
import { vi } from "vitest";

export class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();

    get length() {
        return this.values.size;
    }

    clear() {
        this.values.clear();
    }

    getItem(key: string) {
        return this.values.get(key) ?? null;
    }

    key(index: number) {
        return [...this.values.keys()][index] ?? null;
    }

    removeItem(key: string) {
        this.values.delete(key);
    }

    setItem(key: string, value: string) {
        this.values.set(key, value);
    }
}

export async function resetBrowserTestState(): Promise<MemoryStorage> {
    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("recepten-app");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => resolve();
    });
    const localStorage = new MemoryStorage();
    vi.stubGlobal("window", { indexedDB, localStorage });
    return localStorage;
}
