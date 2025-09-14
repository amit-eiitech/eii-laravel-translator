Eii Laravel Translator
Eii Laravel Translator is a Visual Studio Code extension designed to streamline the localization process for Laravel applications. It automatically extracts translatable strings from Blade files, generates locale JSON files, and translates them into multiple languages using Google Translate or DeepL APIs. With features like selective file processing, progress reporting, and preservation of manual translations, this extension simplifies multilingual Laravel development.
Features

Extract Translatable Strings: Automatically detects strings wrapped in __() functions in Blade files.
Multi-Language Translation: Supports translation into multiple languages via Google Translate or DeepL APIs.
Selective Processing: Process a single Blade file, a specific folder, or all Blade files in the project.
Smart File Selection: Interactive QuickPick interface with autocompletion for selecting files or folders, starting from resources/views.
Preserve Manual Edits: Merges new translations without overwriting existing ones, respecting manual changes.
Progress Reporting: Displays a progress bar during extraction and translation.
Rate Limit Handling: Configurable delay and retry logic to handle API rate limits.
Cross-Platform: Supports both forward and backslash paths for seamless use on Windows and other platforms.

Installation

Open Visual Studio Code.
Go to the Extensions view (Ctrl+Shift+X or Cmd+Shift+X on macOS).
Search for Eii Laravel Translator.
Click Install.

Alternatively, install the .vsix file manually:

Download the .vsix file from the VS Code Marketplace or generate it using vsce package.
In VS Code, go to the Extensions view, click the ... menu, and select Install from VSIX.
Choose the .vsix file and install.

Usage

Configure Settings:

Open VS Code Settings (Ctrl+, or Cmd+, on macOS).
Search for eiiLaravelTranslator and set:
eiiLaravelTranslator.apiProvider: Choose google or deepl (default: deepl).
eiiLaravelTranslator.apiKey: Enter your API key for the selected provider.
eiiLaravelTranslator.delayMs: Set delay between API requests (default: 200 ms).


Example settings.json:{
  "eiiLaravelTranslator.apiProvider": "deepl",
  "eiiLaravelTranslator.apiKey": "your-api-key",
  "eiiLaravelTranslator.delayMs": 200
}




Run the Extension:

Open a Laravel project in VS Code.
Press Ctrl+Shift+P (or Cmd+Shift+P on macOS) and select Extract and Translate Translations.
In the QuickPick dropdown:
Start typing from resources/views/ (or resources\views\ on Windows) to select a Blade file or folder.
Choose * for all Blade files or a folder with /* (e.g., resources/views/mail/*).


Enter target languages (e.g., ja,fr) when prompted.
The extension extracts strings and generates JSON files in resources/lang (e.g., en.json, JA.json, FR.json).


Check Output:

Verify translation files in resources/lang.
Existing translations are preserved, and only new strings are translated.



Requirements

VS Code: Version 1.104.0 or higher.
Laravel Project: Must contain Blade files with translatable strings using __() function.
API Key: Valid API key for Google Translate or DeepL.
Node.js: Required for compiling the extension.

Configuration
The extension supports the following settings:

eiiLaravelTranslator.apiProvider (string): Translation API provider (google or deepl).
eiiLaravelTranslator.apiKey (string): Your API key for the selected provider.
eiiLaravelTranslator.delayMs (number): Delay in milliseconds between API requests to avoid rate limits (default: 200).

Known Issues

Rate Limits: Free API tiers (e.g., DeepL free) may return "Too Many Requests" errors for large projects. Increase delayMs or use a paid API plan.
Large Projects: Scanning many Blade files may cause a slight delay in the QuickPick dropdown. The extension excludes vendor and node_modules to optimize performance.

Contributing
Contributions are welcome! To contribute:

Fork the repository.
Create a feature branch (git checkout -b feature/your-feature).
Commit changes (git commit -m 'Add your feature').
Push to the branch (git push origin feature/your-feature).
Open a pull request.

License
This extension is licensed under the MIT License.
Support
For issues, feature requests, or questions, please open an issue on the GitHub repository or contact the Eii support team.

Developed by Eii Tech Solutions. Simplify your Laravel localization today!
https://eiitechsolutions.com