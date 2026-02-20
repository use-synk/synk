import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");

const isRelativeSpecifier = (specifier) =>
	specifier.startsWith("./") || specifier.startsWith("../");
const hasExtension = (specifier) => path.extname(specifier) !== "";

const rewriteSpecifier = (specifier) => {
	if (!isRelativeSpecifier(specifier) || hasExtension(specifier)) {
		return specifier;
	}

	return `${specifier}.js`;
};

const rewriteContent = (content) => {
	const fromRe = /(from\s+["'])([^"']+)(["'])/g;
	const importRe = /(import\(\s*["'])([^"']+)(["']\s*\))/g;

	return content
		.replace(fromRe, (_match, prefix, specifier, suffix) => {
			return `${prefix}${rewriteSpecifier(specifier)}${suffix}`;
		})
		.replace(importRe, (_match, prefix, specifier, suffix) => {
			return `${prefix}${rewriteSpecifier(specifier)}${suffix}`;
		});
};

const collectFiles = async (dir) => {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			files.push(...(await collectFiles(fullPath)));
			continue;
		}

		if (entry.isFile() && (fullPath.endsWith(".js") || fullPath.endsWith(".d.ts"))) {
			files.push(fullPath);
		}
	}

	return files;
};

const distStats = await stat(distDir).catch(() => null);
if (!distStats?.isDirectory()) {
	process.exit(0);
}

const files = await collectFiles(distDir);

await Promise.all(
	files.map(async (file) => {
		const source = await readFile(file, "utf8");
		const rewritten = rewriteContent(source);

		if (rewritten !== source) {
			await writeFile(file, rewritten, "utf8");
		}
	}),
);
