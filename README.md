# Eii Laravel Translator: The Ultimate VS Code Tool for Automated Laravel Localization 🌍

Stop manual locale file management! **Eii Laravel Translator** is a Visual Studio Code extension that **automatically extracts** translatable strings from your Blade files, **generates clean JSON locale files**, and provides instant, **multi-language translation** using Google Translate or DeepL APIs.

## ✨ Features and Benefits

This extension streamlines your multilingual Laravel development by offering intelligent and automated localization features:

* **Automatic String Extraction**: Instantly detect and extract all strings wrapped in the `__()` function across your Blade files, ensuring no translation is missed.
* **Seamless Multi-Language Translation**: Supports high-quality, automated translation into multiple languages via your configured **Google Translate v2** or **DeepL** API key.
* **Intelligent Merging & Preservation**: Safely merge newly extracted strings into existing locale files without **overwriting or losing** any manual translations you've already made.
* **Selective Processing**: Process a single Blade file, a specific folder (e.g., `resources/views/mail/*`), or all Blade files in the project for maximum control.
* **Smart File Selection**: An interactive QuickPick interface with autocompletion allows you to easily select files or folders, starting from `resources/views/`.
    * 
* **Robust API Rate Limit Handling**: Configure request delays (`delayMs`) and retry logic to automatically respect API limits, ensuring reliable batch translations for large projects.
* **Batch Translation Requests**: Group multiple strings into a single API request to reduce request count and save API limits.
* **Progress Reporting**: Displays a visual progress bar during the extraction and translation process, so you're never left guessing.


## 🚀 Installation

1.  Open Visual Studio Code.
2.  Go to the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`).
3.  Search for **Eii Laravel Translator**.
4.  Click **Install**.


## ⚙️ Usage Guide

### 1. Configure Settings

You **must** configure your default API provider and the matching API key before running the extension.

1.  Open VS Code Settings (`Ctrl+,` or `Cmd+,`).
2.  Search for `eiiLaravelTranslator` and set the following:
    * `eiiLaravelTranslator.apiProvider`: Choose `google` or `deepl` (default: `deepl`).
    * `eiiLaravelTranslator.googleApiKey`: Enter your Google Translate API v2 key.
    * `eiiLaravelTranslator.deeplApiKey`: Enter your DeepL API key.
    * `eiiLaravelTranslator.delayMs`: Set delay between API requests (default: `200` ms) to prevent rate limiting.
    * `eiiLaravelTranslator.batchSize`: Set how many strings are sent in each translation request (default: `20`).
    
    

### 2. Run the Command

1.  Open a Laravel project in VS Code.
2.  Press `Ctrl+Shift+P` (or `Cmd+Shift+P`) and select **Extract and Translate Translations**.
3.  **Select Target Scope**: In the QuickPick dropdown, choose your target:
    * Start typing from `resources/views/` to select a specific Blade file.
    * Choose a folder path with `/*` (e.g., `resources/views/mail/*`).
    * Choose `*` for all Blade files in your project.
4.  **Enter Target Languages**: When prompted, enter a comma-separated list of target language codes (e.g., `ja,fr,es`).

The extension will now:
* Extract all `__()` strings.
* Generate/update your source file (e.g., `en.json`) in `resources/lang`.
* Translate new strings and generate/update the target locale files (e.g., `JA.json`, `FR.json`).

### 🎬 Workflow Demonstration

Watch this short video/GIF to see the entire process in action:

![GIF of Eii Laravel Translator workflow (3-5 seconds)](https://raw.githubusercontent.com/amit-eiitech/eii-laravel-translator/main/assets/laravel-translator-vs-code-extension-demo.gif)

---

## ⚠️ Requirements and Configuration

### Requirements

* **VS Code**: Version 1.80.0 or higher.
* **Laravel Project**: Must contain Blade files with translatable strings using the `__()` function.
* **API Keys**: A valid Google Translate v2 key or DeepL API key is mandatory for translations, depending on the configured provider.

### Configuration Options

| Setting | Type | Description | Default |
| :--- | :--- | :--- | :--- |
| `eiiLaravelTranslator.apiProvider` | `string` | Default translation API provider (`google` or `deepl`). | `deepl` |
| `eiiLaravelTranslator.googleApiKey` | `string` | Your Google Translate API v2 key. | |
| `eiiLaravelTranslator.deeplApiKey` | `string` | Your DeepL API key. | |
| `eiiLaravelTranslator.delayMs` | `number` | Delay in milliseconds between API requests to avoid rate limits. | `200` |
| `eiiLaravelTranslator.batchSize` | `number` | Number of strings sent per translation request. | `20` |

### Known Issues

* **Rate Limits**: Free API tiers (e.g., DeepL free) may return "Too Many Requests" errors for large projects. Increase `delayMs` or consider a paid API plan for consistent performance.
* **Performance**: To optimize performance, the extension automatically excludes files in the `vendor` and `node_modules` directories.


## 🤝 Contributing

Contributions are welcome! Please refer to the guidelines in the repository for submitting issues or pull requests.


## 📝 License

This extension is licensed under the [MIT License](LICENSE).


## 📞 Support and Contact

For issues, feature requests, or questions, please [open an issue](https://github.com/amit-eiitech/eii-laravel-translator/issues) on the GitHub repository.

Eii Laravel Translator is a product of **Eii Tech Solutions, Japan**. For support or enterprise inquiries, visit our website: [https://eiitechsolutions.com](https://eiitechsolutions.com).

**Start simplifying your Laravel localization today!**
