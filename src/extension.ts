import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as glob from "glob";
import fetch from "node-fetch";

interface GoogleTranslateResponse {
  data: {
    translations: { translatedText: string }[];
  };
}

interface DeepLResponse {
  translations: { text: string }[];
}

interface FileQuickPickItem extends vscode.QuickPickItem {
  path: string;
  isFolder: boolean;
}

type LocaleTranslations = Record<string, string>;

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    "eii-laravel-translator.extract",
    async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage("No workspace folder open.");
        return;
      }

      const config = vscode.workspace.getConfiguration("eiiLaravelTranslator");
      const apiProvider = config.get<string>("apiProvider");
      const delayMs = config.get<number>("delayMs") || 200;
      const batchSize = Math.max(1, config.get<number>("batchSize") || 20);
      const apiKey = getApiKeyForProvider(config, apiProvider);

      if (!apiKey) {
        vscode.window.showErrorMessage(
          `No ${apiProvider} API key found. Set it in VS Code settings.`,
        );
        return;
      }

      const isWindows = process.platform === "win32";
      const separator = isWindows ? "\\" : "/";
      const defaultDir = `resources${separator}views`;
      const defaultDirPath = path.join(workspaceRoot, defaultDir);

      // Collect all Blade files and folders under defaultDir, excluding vendor and node_modules
      const bladeFiles = fs.existsSync(defaultDirPath)
        ? glob
            .sync("**/*.blade.php", {
              cwd: defaultDirPath,
              ignore: ["node_modules/**"],
            })
            .map((f) => path.join(defaultDir, f).replace(/\//g, separator))
        : [];
      const allFolders = [
        ...new Set(bladeFiles.map((file) => path.dirname(file))),
      ].sort();
      const allItems: FileQuickPickItem[] = [
        {
          label: "*",
          detail: "Process all Blade files",
          path: "*",
          isFolder: false,
        },
        ...bladeFiles.map((file) => ({
          label: file,
          detail: "Blade file",
          path: file,
          isFolder: false,
        })),
        ...allFolders.map((folder) => ({
          label: `${folder}${separator}*`,
          detail: "All Blade files in folder",
          path: `${folder}/*`,
          isFolder: true,
        })),
      ];

      // Prompt for file or folder path with QuickPick
      const quickPick = vscode.window.createQuickPick<FileQuickPickItem>();
      quickPick.items = allItems;
      quickPick.placeholder = `Select a Blade file, folder with "${separator}*", or "*" for all files (starting from ${defaultDir})`;
      quickPick.value = `${defaultDir}${separator}`;
      quickPick.matchOnDescription = true;
      quickPick.matchOnDetail = true;

      // Filter items as user types
      quickPick.onDidChangeValue(() => {
        const input = quickPick.value.toLowerCase().replace(/\\/g, "/");
        if (!input) {
          quickPick.items = allItems;
        } else {
          quickPick.items = allItems.filter(
            (item) =>
              item.label.toLowerCase().replace(/\\/g, "/").includes(input) ||
              item.label === "*",
          );
        }
      });

      const selectedItem = await new Promise<FileQuickPickItem | undefined>(
        (resolve) => {
          quickPick.onDidAccept(() => {
            resolve(quickPick.selectedItems[0]);
            quickPick.hide();
          });
          quickPick.onDidHide(() => resolve(undefined));
          quickPick.show();
        },
      );

      if (!selectedItem) {
        return; // Cancelled
      }

      let files: string[] = [];
      if (selectedItem.path === "*") {
        files = glob.sync("**/*.blade.php", {
          cwd: workspaceRoot,
          ignore: ["vendor/**", "node_modules/**"],
        });
      } else if (selectedItem.isFolder) {
        const dir = selectedItem.path.slice(0, -2).replace(/\\/g, "/"); // Normalize to forward slashes
        const dirPath = path.join(workspaceRoot, dir);
        if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
          files = glob
            .sync("**/*.blade.php", {
              cwd: dirPath,
              ignore: ["vendor/**", "node_modules/**"],
            })
            .map((f) => path.join(dir, f));
        } else {
          vscode.window.showErrorMessage("Invalid folder path.");
          return;
        }
      } else {
        const filePath = path.join(
          workspaceRoot,
          selectedItem.path.replace(/\\/g, "/"),
        );
        if (fs.existsSync(filePath) && filePath.endsWith(".blade.php")) {
          files = [selectedItem.path.replace(/\\/g, "/")];
        } else {
          vscode.window.showErrorMessage("Invalid Blade file path.");
          return;
        }
      }

      // Prompt for languages
      const langInput = await vscode.window.showInputBox({
        prompt: "Enter target languages (comma-separated, e.g., ja,fr)",
        placeHolder: "ja,fr",
      });
      const targetLanguages = langInput
        ? langInput
            .split(",")
            .map((l) => l.trim().toLowerCase())
            .filter((l) => l.length > 0)
        : [];

      const extractedTranslations = extractTranslationsFromBladeFiles(
        workspaceRoot,
        files,
      );

      if (Object.keys(extractedTranslations).length === 0) {
        vscode.window.showWarningMessage("No translatable strings found.");
        return;
      }

      const langDir = path.join(workspaceRoot, "resources", "lang");
      fs.mkdirSync(langDir, { recursive: true });

      // Load existing en.json
      const enFilePath = path.join(langDir, "en.json");
      const existingEn = readLocaleFile(enFilePath);

      // Append extracted source strings without overwriting manual source edits.
      const mergedEn = mergeMissingTranslations(
        existingEn,
        extractedTranslations,
      );

      // Write updated en.json
      writeLocaleFile(enFilePath, mergedEn);

      // Calculate total steps for progress (only missing/untranslated strings per language)
      const pendingTranslations = new Map<string, string[]>();
      let totalSteps = 0;
      for (const lang of targetLanguages) {
        const langFilePath = path.join(langDir, `${lang}.json`);
        const existingLang = readLocaleFile(langFilePath);
        const keysToTranslate = getKeysToTranslate(
          existingLang,
          extractedTranslations,
        );
        pendingTranslations.set(lang, keysToTranslate);
        totalSteps += keysToTranslate.length;
      }

      if (totalSteps === 0) {
        vscode.window.showInformationMessage("✅ No new strings to translate.");
        return;
      }

      const stepIncrement = 100 / totalSteps;
      let currentStep = 0;
      let failedTranslations = 0;

      // Process translations with progress bar
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Extracting and Translating Strings",
          cancellable: false,
        },
        async (progress) => {
          for (const lang of targetLanguages) {
            const langFilePath = path.join(langDir, `${lang}.json`);
            const existingLang = readLocaleFile(langFilePath);
            const translated: LocaleTranslations = { ...existingLang };
            const keysToTranslate = pendingTranslations.get(lang) || [];
            let hasSuccessfulTranslations = false;

            for (const keyBatch of chunkStrings(keysToTranslate, batchSize)) {
              try {
                const translatedBatch = await translateBatchWithRetry(
                  apiProvider!,
                  apiKey!,
                  keyBatch,
                  lang,
                );
                keyBatch.forEach((key, index) => {
                  translated[key] = translatedBatch[index];
                });
                hasSuccessfulTranslations = true;
                await new Promise((resolve) => setTimeout(resolve, delayMs));
              } catch (error) {
                failedTranslations += keyBatch.length;
                console.error(
                  `Translation failed for ${keyBatch.length} string(s) to ${lang}`,
                  error,
                );
              }

              currentStep += keyBatch.length;
              progress.report({
                increment: stepIncrement * keyBatch.length,
              });
            }

            if (hasSuccessfulTranslations) {
              writeLocaleFile(langFilePath, translated);
            }
          }
        },
      );

      if (failedTranslations > 0) {
        vscode.window.showWarningMessage(
          `Extracted strings, but ${failedTranslations} translation(s) failed. Existing locale values were preserved.`,
        );
      } else {
        vscode.window.showInformationMessage(
          "✅ Extracted and translated strings!",
        );
      }
    },
  );

  context.subscriptions.push(disposable);
}

function extractTranslationsFromBladeFiles(
  workspaceRoot: string,
  files: string[],
): LocaleTranslations {
  const translations: LocaleTranslations = {};

  for (const file of files) {
    const content = fs.readFileSync(
      path.join(workspaceRoot, file.replace(/\\/g, "/")),
      "utf8",
    );
    const matches = content.match(/(?:__|@lang)\(['"`](.*?)['"`]\)/g) || [];
    matches.forEach((m) => {
      const key = m.replace(/(?:__|@lang)\(['"`](.*?)['"`]\)/, "$1");
      translations[key] = key;
    });
  }

  return translations;
}

function readLocaleFile(filePath: string): LocaleTranslations {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeLocaleFile(
  filePath: string,
  translations: LocaleTranslations,
): void {
  fs.writeFileSync(filePath, JSON.stringify(translations, null, 2));
}

function mergeMissingTranslations(
  existingTranslations: LocaleTranslations,
  extractedTranslations: LocaleTranslations,
): LocaleTranslations {
  const mergedTranslations = { ...existingTranslations };

  for (const [key, value] of Object.entries(extractedTranslations)) {
    if (!(key in mergedTranslations)) {
      mergedTranslations[key] = value;
    }
  }

  return mergedTranslations;
}

function getKeysToTranslate(
  existingTranslations: LocaleTranslations,
  extractedTranslations: LocaleTranslations,
): string[] {
  return Object.keys(extractedTranslations).filter((key) =>
    isMissingOrUntranslated(existingTranslations, key),
  );
}

function isMissingOrUntranslated(
  translations: LocaleTranslations,
  key: string,
): boolean {
  const value = translations[key];

  return value === undefined || value.trim() === "" || value === key;
}

function getApiKeyForProvider(
  config: vscode.WorkspaceConfiguration,
  provider: string | undefined,
): string {
  if (provider === "google") {
    return config.get<string>("googleApiKey") || config.get<string>("apiKey") || "";
  }

  if (provider === "deepl") {
    return config.get<string>("deeplApiKey") || config.get<string>("apiKey") || "";
  }

  return "";
}

function chunkStrings(items: string[], batchSize: number): string[][] {
  const batches: string[][] = [];

  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }

  return batches;
}

function getDeepLTranslateUrl(apiKey: string): string {
  const host = apiKey.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";

  return `https://${host}/v2/translate`;
}

async function translateBatchWithRetry(
  provider: string,
  apiKey: string,
  texts: string[],
  target: string,
  retries: number = 3,
  delayMs: number = 1000,
): Promise<string[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (provider === "google") {
        const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
        const res = await fetch(url, {
          method: "POST",
          body: JSON.stringify({
            q: texts,
            target: target,
            format: "text",
          }),
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
          if (res.status === 429) {
            throw new Error("Too many requests");
          }
          throw new Error(`Google API error: ${res.statusText}`);
        }

        const data = (await res.json()) as GoogleTranslateResponse;
        const translatedTexts = data.data.translations.map(
          (translation) => translation.translatedText,
        );
        ensureBatchSizeMatches(texts, translatedTexts, provider);
        return translatedTexts;
      } else if (provider === "deepl") {
        const url = getDeepLTranslateUrl(apiKey);
        const res = await fetch(url, {
          method: "POST",
          body: JSON.stringify({
            text: texts,
            target_lang: target.toUpperCase(),
          }),
          headers: {
            Authorization: `DeepL-Auth-Key ${apiKey}`,
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          if (res.status === 429) {
            throw new Error("Too many requests");
          }
          throw new Error(
            `DeepL API error: ${res.status} ${res.statusText} - ${await res.text()}`,
          );
        }

        const data = (await res.json()) as DeepLResponse;
        const translatedTexts = data.translations.map(
          (translation) => translation.text,
        );
        ensureBatchSizeMatches(texts, translatedTexts, provider);
        return translatedTexts;
      }
    } catch (error: any) {
      if (error.message.includes("Too many requests") && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
        continue;
      }
      throw new Error(
        `Translation error for ${texts.length} string(s) to ${target}: ${error.message}`,
      );
    }
  }

  return texts;
}

function ensureBatchSizeMatches(
  inputTexts: string[],
  translatedTexts: string[],
  provider: string,
): void {
  if (inputTexts.length !== translatedTexts.length) {
    throw new Error(
      `${provider} returned ${translatedTexts.length} translation(s) for ${inputTexts.length} input string(s)`,
    );
  }
}

export function deactivate() {}
