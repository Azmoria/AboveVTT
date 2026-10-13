const fs = require("node:fs");
const path = require("node:path");

function findFirstObjectEnd(text) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }

  return -1;
}

function parseSceneData(text) {
  const input = text.replace(/^\uFEFF/, "").trim();

  try {
    return JSON.parse(input);
  } catch (error) {
    const sceneEnd = findFirstObjectEnd(input);
    const trailer = sceneEnd === -1 ? "" : input.slice(sceneEnd).trim();
    if (!/^,\s*"objectId"\s*:\s*"[^"]*"\s*}$/.test(trailer)) {
      throw new Error(`Scene data is not valid JSON: ${error.message}`);
    }

    return JSON.parse(input.slice(0, sceneEnd));
  }
}

function createExport(scene) {
  if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
    throw new Error("Scene data must be a JSON object.");
  }
  if (typeof scene.title !== "string" || !scene.title.trim()) {
    throw new Error("Scene data must include a title.");
  }
  if (!scene.tokens || typeof scene.tokens !== "object" || Array.isArray(scene.tokens)) {
    throw new Error("Scene data must include a token object.");
  }

  const tokens = {};
  for (const [key, token] of Object.entries(scene.tokens)) {
    if (!token || typeof token !== "object" || Array.isArray(token)) {
      throw new Error(`Token "${key}" must be a JSON object.`);
    }
    if (token.id === undefined || token.id === null || token.id === "") {
      throw new Error(`Token "${key}" is missing its id.`);
    }

    const tokenId = String(token.id);
    if (Object.prototype.hasOwnProperty.call(tokens, tokenId)) {
      throw new Error(`Multiple tokens have the id "${tokenId}".`);
    }
    tokens[tokenId] = token;
  }

  return {
    version: 2,
    scenes: [{ ...scene, tokens }],
    tokencustomizations: [],
    notes: {},
    journalchapters: [],
    soundpads: {},
  };
}

function safeFileName(title) {
  const name = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/, "");
  return `${name || "scene"}.abovevtt`;
}

function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath) {
    throw new Error("Usage: node scene-data-to-abovevtt.js <scene-data-file> [output-file]");
  }

  const scene = parseSceneData(fs.readFileSync(inputPath, "utf8"));
  const exportData = createExport(scene);
  const outputFile = path.resolve(outputPath || safeFileName(scene.title));
  const encoded = Buffer.from(JSON.stringify(exportData, null, "\t"), "utf8").toString("base64");

  fs.writeFileSync(outputFile, encoded, "utf8");
  console.log(`Created ${outputFile}`);
}

main();
