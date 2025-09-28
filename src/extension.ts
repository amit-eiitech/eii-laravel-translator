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
      const apiKey = config.get<string>("apiKey");
      const delayMs = config.get<number>("delayMs") || 200;

      if (!apiKey) {
        vscode.window.showErrorMessage(
          "No API key found. Set it in VS Code settings."
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
              ignore: ["vendor/**", "node_modules/**"],
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
              item.label === "*"
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
        }
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
          selectedItem.path.replace(/\\/g, "/")
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
        ? langInput.split(",").map((l) => l.trim().toUpperCase())
        : [];

      let newTranslations: Record<string, string> = {};

      for (const file of files) {
        const content = fs.readFileSync(
          path.join(workspaceRoot, file.replace(/\\/g, "/")),
          "utf8"
        );
        const matches = content.match(/(?:__|@lang)\(['"`](.*?)['"`]\)/g) || [];
        matches.forEach((m) => {
          const key = m.replace(/(?:__|@lang)\(['"`](.*?)['"`]\)/, "$1");
          newTranslations[key] = key;
        });
      }

      if (Object.keys(newTranslations).length === 0) {
        vscode.window.showWarningMessage("No translatable strings found.");
        return;
      }

      const langDir = path.join(workspaceRoot, "resources", "lang");
      fs.mkdirSync(langDir, { recursive: true });

      // Load existing en.json
      const enFilePath = path.join(langDir, "en.json");
      let existingEn: Record<string, string> = {};
      if (fs.existsSync(enFilePath)) {
        existingEn = JSON.parse(fs.readFileSync(enFilePath, "utf8"));
      }

      // Merge new translations into existing en
      const mergedEn = { ...existingEn, ...newTranslations };

      // Write updated en.json
      fs.writeFileSync(enFilePath, JSON.stringify(mergedEn, null, 2));

      // Calculate total steps for progress (only new translations per language)
      let totalSteps = 0;
      for (const lang of targetLanguages) {
        const langFilePath = path.join(langDir, `${lang}.json`);
        let existingLang: Record<string, string> = {};
        if (fs.existsSync(langFilePath)) {
          existingLang = JSON.parse(fs.readFileSync(langFilePath, "utf8"));
        }
        const keysToTranslate = Object.keys(newTranslations).filter(
          (key) => !(key in existingLang)
        );
        totalSteps += keysToTranslate.length;
      }

      if (totalSteps === 0) {
        for (const lang of targetLanguages) {
          const langFilePath = path.join(langDir, `${lang}.json`);
          let existingLang: Record<string, string> = {};
          if (fs.existsSync(langFilePath)) {
            existingLang = JSON.parse(fs.readFileSync(langFilePath, "utf8"));
          }
          const translated = { ...existingLang, ...newTranslations };
          fs.writeFileSync(langFilePath, JSON.stringify(translated, null, 2));
        }
        vscode.window.showInformationMessage("✅ No new strings to translate.");
        return;
      }

      const stepIncrement = 100 / totalSteps;
      let currentStep = 0;

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
            let existingLang: Record<string, string> = {};
            if (fs.existsSync(langFilePath)) {
              existingLang = JSON.parse(fs.readFileSync(langFilePath, "utf8"));
            }

            let translated: Record<string, string> = { ...existingLang };

            for (const [key] of Object.entries(newTranslations)) {
              if (!(key in existingLang)) {
                try {
                  translated[key] = await translateWithRetry(
                    apiProvider!,
                    apiKey!,
                    key,
                    lang
                  );
                  await new Promise((resolve) => setTimeout(resolve, delayMs));
                } catch (error) {
                  vscode.window.showErrorMessage(
                    `Translation failed for ${lang}: ${error}`
                  );
                  translated[key] = key;
                }
                currentStep++;
                progress.report({ increment: stepIncrement });
              }
            }

            fs.writeFileSync(langFilePath, JSON.stringify(translated, null, 2));
          }
        }
      );

      vscode.window.showInformationMessage(
        "✅ Extracted and translated strings!"
      );
    }
  );

  context.subscriptions.push(disposable);
}

async function translateWithRetry(
  provider: string,
  apiKey: string,
  text: string,
  target: string,
  retries: number = 3,
  delayMs: number = 1000
): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (provider === "google") {
        const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
        const res = await fetch(url, {
          method: "POST",
          body: JSON.stringify({
            q: text,
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
        return data.data.translations[0].translatedText;
      } else if (provider === "deepl") {
        const url = `https://api-free.deepl.com/v2/translate`;
        const res = await fetch(url, {
          method: "POST",
          body: new URLSearchParams({
            auth_key: apiKey,
            text: text,
            target_lang: target.toUpperCase(),
          }),
        });

        if (!res.ok) {
          if (res.status === 429) {
            throw new Error("Too many requests");
          }
          throw new Error(`DeepL API error: ${res.statusText}`);
        }

        const data = (await res.json()) as DeepLResponse;
        return data.translations[0].text;
      }
    } catch (error: any) {
      if (error.message.includes("Too many requests") && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
        continue;
      }
      throw new Error(
        `Translation error for ${text} to ${target}: ${error.message}`
      );
    }
  }

  return text;
}

export function deactivate() {}
