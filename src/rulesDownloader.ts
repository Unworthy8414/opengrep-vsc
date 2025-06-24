import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
const unzipper = require('unzipper');
import { OpenGrepOutputChannel } from './output';

export class RulesDownloader {
    private static readonly LANGUAGES = [
        'python', 'javascript', 'typescript', 'java', 'go', 'ruby', 'php',
        'c', 'cpp', 'csharp', 'swift', 'kotlin', 'rust', 'solidity'
    ];

    private getRulesRepoUrl(): string {
        const config = vscode.workspace.getConfiguration('opengrep');
        const repoUrl = config.get<string>('defaultRulesRepo', 'https://github.com/opengrep/opengrep-rules');
        // Convert GitHub URL to archive URL
        return `${repoUrl}/archive/refs/heads/main.zip`;
    }

    constructor(
        private outputChannel: OpenGrepOutputChannel
    ) {}

    async downloadDefaultRules(targetPath: string = '.opengrep/rules'): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        const rulesPath = path.join(workspaceFolder.uri.fsPath, targetPath);
        
        // Ask user which languages they want
        const selectedLanguages = await this.selectLanguages();
        if (!selectedLanguages || selectedLanguages.length === 0) {
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Downloading OpenGrep default rules...',
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ increment: 10, message: 'Downloading rules archive...' });
                
                // Download the zip file
                const response = await axios.get(this.getRulesRepoUrl(), {
                    responseType: 'stream'
                });

                // Create temp directory
                const tempDir = path.join(workspaceFolder.uri.fsPath, '.opengrep-temp');
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }

                const zipPath = path.join(tempDir, 'rules.zip');
                const writer = fs.createWriteStream(zipPath);
                
                response.data.pipe(writer);
                
                await new Promise<void>((resolve, reject) => {
                    writer.on('finish', () => resolve());
                    writer.on('error', reject);
                });

                progress.report({ increment: 40, message: 'Extracting rules...' });

                // Extract selected language rules
                await this.extractSelectedRules(zipPath, rulesPath, selectedLanguages);

                progress.report({ increment: 40, message: 'Cleaning up...' });

                // Clean up temp files
                fs.rmSync(tempDir, { recursive: true, force: true });

                progress.report({ increment: 10, message: 'Done!' });

                this.outputChannel.appendLine(`Successfully downloaded rules for: ${selectedLanguages.join(', ')}`);
                vscode.window.showInformationMessage(`OpenGrep rules downloaded for ${selectedLanguages.length} languages`);

            } catch (error) {
                this.outputChannel.appendLine(`Failed to download rules: ${error}`);
                vscode.window.showErrorMessage(`Failed to download rules: ${error}`);
            }
        });
    }

    private async selectLanguages(): Promise<string[] | undefined> {
        const items = RulesDownloader.LANGUAGES.map(lang => ({
            label: lang,
            picked: ['python', 'javascript', 'typescript'].includes(lang) // Default selections
        }));

        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            title: 'Select languages to download rules for',
            placeHolder: 'Choose one or more languages'
        });

        return selected?.map(item => item.label);
    }

    private async extractSelectedRules(zipPath: string, targetPath: string, languages: string[]): Promise<void> {
        // Ensure target directory exists
        if (!fs.existsSync(targetPath)) {
            fs.mkdirSync(targetPath, { recursive: true });
        }

        return new Promise((resolve, reject) => {
            fs.createReadStream(zipPath)
                .pipe(unzipper.Parse())
                .on('entry', (entry: any) => {
                    const fileName = entry.path;
                    const type = entry.type;
                    
                    // Check if this entry is for a selected language
                    const isSelectedLanguage = languages.some(lang => 
                        fileName.includes(`opengrep-rules-main/${lang}/`)
                    );

                    if (isSelectedLanguage && type === 'File' && fileName.endsWith('.yaml')) {
                        // Extract the language and relative path
                        const match = fileName.match(/opengrep-rules-main\/([^\/]+)\/(.*)/);
                        if (match) {
                            const [, language, relPath] = match;
                            const destPath = path.join(targetPath, language, relPath);
                            const destDir = path.dirname(destPath);

                            // Ensure directory exists
                            if (!fs.existsSync(destDir)) {
                                fs.mkdirSync(destDir, { recursive: true });
                            }

                            entry.pipe(fs.createWriteStream(destPath));
                        } else {
                            entry.autodrain();
                        }
                    } else {
                        entry.autodrain();
                    }
                })
                .on('finish', () => resolve())
                .on('error', (err: any) => reject(err));
        });
    }

    async checkForExistingRules(targetPath: string = '.opengrep/rules'): Promise<boolean> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return false;
        }

        const rulesPath = path.join(workspaceFolder.uri.fsPath, targetPath);
        if (fs.existsSync(rulesPath)) {
            const files = fs.readdirSync(rulesPath);
            return files.length > 0;
        }
        return false;
    }
}