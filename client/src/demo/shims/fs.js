// Uploaded pictures live in memory, and the demo saves them with the database.
export const files = new Map();

export function writeFileSync(path, data) {
  files.set(path, data);
}

export function rmSync(path) {
  files.delete(path);
}

export function mkdirSync() {}
