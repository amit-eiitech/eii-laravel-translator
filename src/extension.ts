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

      // Prompt for file or folder path
      const fileInput = await vscode.window.showInputBox({
        prompt:
          'Enter Blade file path (e.g., resources/views/welcome.blade.php), folder with "*" (e.g., resources/views/mail/*), or "*" for all files',
        placeHolder: "e.g., * or resources/views/*",
      });

      let files: string[] = [];
      if (fileInput === "*") {
        files = glob.sync("**/*.blade.php", { cwd: workspaceRoot });
      } else if (fileInput?.endsWith("/*")) {
        const dir = fileInput.slice(0, -2);
        const dirPath = path.join(workspaceRoot, dir);
        if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
          files = glob
            .sync("**/*.blade.php", { cwd: dirPath })
            .map((f) => path.join(dir, f));
        } else {
          vscode.window.showErrorMessage("Invalid folder path.");
          return;
        }
      } else if (fileInput) {
        const filePath = path.join(workspaceRoot, fileInput);
        if (fs.existsSync(filePath) && filePath.endsWith(".blade.php")) {
          files = [fileInput];
        } else {
          vscode.window.showErrorMessage("Invalid Blade file path.");
          return;
        }
      } else {
        return; // Cancelled
      }

      // Prompt for languages
      const langInput = await vscode.window.showInputBox({
        prompt: "Enter target languages (comma-separated, e.g., ja,fr)",
        placeHolder: "ja,fr",
      });
      const targetLanguages = langInput
        ? langInput.split(",").map((l) => l.trim())
        : [];

      let newTranslations: Record<string, string> = {};

      for (const file of files) {
        const content = fs.readFileSync(path.join(workspaceRoot, file), "utf8");
        const matches = content.match(/__\(['"`](.*?)['"`]\)/g) || [];
        matches.forEach((m) => {
          const key = m.replace(/__\(['"`](.*?)['"`]\)/, "$1");
          newTranslations[key] = key;
        });
      }

      if (Object.keys(newTranslations).length === 0) {
        vscode.window.showWarningMessage("No translatable strings found.");
        return;
      }

      const langDir = path.join(workspaceRoot, "resources/lang");
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
        // Still need to write the files if languages exist, but no new translations
        for (const lang of targetLanguages) {
          const langFilePath = path.join(langDir, `${lang}.json`);
          let existingLang: Record<string, string> = {};
          if (fs.existsSync(langFilePath)) {
            existingLang = JSON.parse(fs.readFileSync(langFilePath, "utf8"));
          }
          const translated = { ...existingLang, ...newTranslations }; // Fallback to en if no translate
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
                  // Delay to avoid rate limits
                  await new Promise((resolve) => setTimeout(resolve, delayMs));
                } catch (error) {
                  vscode.window.showErrorMessage(
                    `Translation failed for ${lang}: ${error}`
                  );
                  translated[key] = key; // Fallback to original text
                }
                currentStep++;
                progress.report({ increment: stepIncrement });
              }
            }

            // Write updated lang.json
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
