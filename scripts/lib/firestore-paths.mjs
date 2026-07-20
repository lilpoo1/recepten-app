export function isRecipeDocumentPath(path) {
    return /^households\/[^/]+\/recipes\/[^/]+$/.test(path);
}

export function partitionMismatchPaths(paths, ignoredPaths) {
    const ignored = new Set(ignoredPaths);
    return {
        relevant: paths.filter((path) => !ignored.has(path)),
        ignored: paths.filter((path) => ignored.has(path)),
    };
}
