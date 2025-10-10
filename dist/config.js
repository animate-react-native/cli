import "dotenv/config";
import chalk from "chalk";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import prompts from "prompts";
export const env = {
    appUrl: process.env.APP_URL || "http://localhost:3000",
};
const ROOT = path.join(os.homedir(), ".animatereactnative");
const AUTH_PATH = path.join(ROOT, "auth.json");
const CONFIG_PATH = path.join(ROOT, "config.json");
const CACHE_PATH = path.join(ROOT, "components.json");
const CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days in ms
export async function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        fs.mkdirSync(ROOT, { recursive: true });
        return await createInitialConfig();
    }
    const content = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(content);
}
export async function createInitialConfig() {
    const response = await prompts({
        type: "text",
        name: "componentsPath",
        message: "Where should components be saved?",
        initial: "src/components",
    });
    const config = {
        componentsPath: response.componentsPath,
    };
    saveConfig(config);
    return config;
}
export async function createComponentDir(slug) {
    const { componentsPath } = await loadConfig();
    const dir = path.join(componentsPath, slug);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}
export function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}
export function saveAuthConfig(config) {
    const data = JSON.stringify(config);
    const signature = crypto
        .createHmac("sha256", "local-secret-key")
        .update(data)
        .digest("hex");
    fs.mkdirSync(ROOT, { recursive: true });
    fs.writeFileSync(AUTH_PATH, JSON.stringify({ ...config, signature }, null, 2));
    if (!fs.existsSync(CONFIG_PATH)) {
        saveConfig({
            componentsPath: "src/components",
        });
    }
}
export function loadAuthConfig() {
    try {
        const raw = fs.readFileSync(AUTH_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        const { signature, ...rest } = parsed;
        const data = JSON.stringify(rest);
        const expected = crypto
            .createHmac("sha256", "local-secret-key")
            .update(data)
            .digest("hex");
        if (signature !== expected) {
            throw new Error("Auth file was modified manually.");
        }
        return rest;
    }
    catch (e) {
        console.error(chalk.red("❌ Not authenticated. Please run `login` first."));
        process.exit(0);
    }
}
// ---- Helpers ----
export function loadCache() {
    if (fs.existsSync(CACHE_PATH)) {
        try {
            const raw = fs.readFileSync(CACHE_PATH, "utf-8");
            const parsed = JSON.parse(raw);
            return parsed;
        }
        catch {
            return null;
        }
    }
    return null;
}
export function saveCache(data) {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    const cacheData = {
        lastUpdated: new Date().toISOString(),
        ...data,
    };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cacheData, null, 2), "utf-8");
}
export function isCacheExpired(cache) {
    if (!cache?.lastUpdated)
        return true;
    const last = new Date(cache.lastUpdated).getTime();
    const now = Date.now();
    return now - last > CACHE_TTL_MS;
}
