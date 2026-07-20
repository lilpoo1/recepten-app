import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function getGoogleAccessToken() {
    if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) {
        return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
    }

    const configured = process.env.GCLOUD_BIN;
    if (process.platform === "win32") {
        const defaultPath = process.env.LOCALAPPDATA
            ? join(
                  process.env.LOCALAPPDATA,
                  "Google",
                  "Cloud SDK",
                  "google-cloud-sdk",
                  "bin",
                  "gcloud.cmd"
              )
            : "";
        const executable =
            configured ?? (defaultPath && existsSync(defaultPath) ? defaultPath : "gcloud.cmd");
        const command = `call "${executable.replaceAll('"', '""')}" auth print-access-token`;
        return execFileSync(process.env.ComSpec ?? "cmd.exe", [
            "/d",
            "/c",
            command,
        ], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            windowsVerbatimArguments: true,
        }).trim();
    }

    return execFileSync(configured ?? "gcloud", ["auth", "print-access-token"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    }).trim();
}
