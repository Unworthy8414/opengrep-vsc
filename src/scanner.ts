import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { OpenGrepBinaryManager } from './binaryManager';
import { OpenGrepOutputChannel } from './output';
import { OpenGrepResult, OpenGrepFinding } from './types';

const execAsync = promisify(exec);

export class OpenGrepScanner {
    constructor(
        private binaryManager: OpenGrepBinaryManager,
        private outputChannel: OpenGrepOutputChannel
    ) {}

    async scanFile(filePath: string): Promise<OpenGrepFinding[]> {
        try {
            this.outputChannel.appendLine(`\n=== Scanning file: ${filePath} ===`);
            
            const binaryPath = await this.binaryManager.getBinaryPath();
            this.outputChannel.appendLine(`Binary path: ${binaryPath}`);
            
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }
            this.outputChannel.appendLine(`Workspace folder: ${workspaceFolder.uri.fsPath}`);

            const rulesPath = this.getRulesPath(workspaceFolder.uri.fsPath);
            this.outputChannel.appendLine(`Rules path: ${rulesPath}`);
            
            if (!fs.existsSync(rulesPath)) {
                this.outputChannel.appendLine(`No rules found at ${rulesPath}`);
                vscode.window.showWarningMessage(`No OpenGrep rules found at ${rulesPath}`);
                return [];
            }

            // Make file path relative to workspace for OpenGrep
            const relativePath = path.relative(workspaceFolder.uri.fsPath, filePath);
            const command = `"${binaryPath}" scan --json -f "${rulesPath}" "${relativePath}"`;
            this.outputChannel.appendLine(`Running: ${command}`);

            const { stdout, stderr } = await execAsync(command, {
                cwd: workspaceFolder.uri.fsPath,
                maxBuffer: 10 * 1024 * 1024
            });

            if (stderr) {
                this.outputChannel.appendLine(`Stderr output: ${stderr}`);
            }

            const results = this.parseResults(stdout);
            this.outputChannel.appendLine(`Parsed ${results.results.length} total findings`);
            
            // Filter findings for this specific file (comparing relative paths)
            const fileFindings = results.results.filter(finding => {
                const findingPath = path.normalize(finding.path);
                const targetPath = path.normalize(relativePath);
                return findingPath === targetPath;
            });
            
            this.outputChannel.appendLine(`Found ${fileFindings.length} findings for this file`);
            return fileFindings;
        } catch (error) {
            this.outputChannel.appendLine(`Scan error: ${(error as Error).message}`);
            if ((error as {stdout?: string}).stdout) {
                try {
                    const results = this.parseResults((error as {stdout: string}).stdout);
                    return results.results;
                } catch {
                    return [];
                }
            }
            return [];
        }
    }

    async scanWorkspace(): Promise<Map<string, OpenGrepFinding[]>> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        try {
            const binaryPath = await this.binaryManager.getBinaryPath();
            const rulesPath = this.getRulesPath(workspaceFolder.uri.fsPath);
            
            if (!fs.existsSync(rulesPath)) {
                vscode.window.showWarningMessage(`No OpenGrep rules found at ${rulesPath}`);
                return new Map();
            }

            const command = `"${binaryPath}" scan --json -f "${rulesPath}" .`;
            this.outputChannel.appendLine(`Running workspace scan: ${command}`);

            const { stdout, stderr } = await execAsync(command, {
                cwd: workspaceFolder.uri.fsPath,
                maxBuffer: 50 * 1024 * 1024
            });

            if (stderr && !stderr.includes('Ran ')) {
                this.outputChannel.appendLine(`Error output: ${stderr}`);
            }

            const results = this.parseResults(stdout);
            this.outputChannel.appendLine(`Workspace scan found ${results.results.length} total findings`);
            
            const findingsByFile = new Map<string, OpenGrepFinding[]>();

            for (const finding of results.results) {
                const filePath = path.resolve(workspaceFolder.uri.fsPath, finding.path);
                this.outputChannel.appendLine(`Finding in file: ${finding.path} -> ${filePath}`);
                
                if (!findingsByFile.has(filePath)) {
                    findingsByFile.set(filePath, []);
                }
                findingsByFile.get(filePath)!.push(finding);
            }

            this.outputChannel.appendLine(`Grouped findings into ${findingsByFile.size} files`);
            return findingsByFile;
        } catch (error) {
            this.outputChannel.appendLine(`Workspace scan error: ${(error as Error).message}`);
            return new Map();
        }
    }

    private parseResults(output: string): OpenGrepResult {
        try {
            this.outputChannel.appendLine(`Raw output to parse: ${output.substring(0, 500)}...`);
            
            // Try to parse as JSON directly first
            try {
                return JSON.parse(output);
            } catch {
                // If that fails, look for JSON in the output
                const lines = output.trim().split('\n');
                const jsonLine = lines.find(line => line.trim().startsWith('{'));
                if (!jsonLine) {
                    this.outputChannel.appendLine('No JSON found in output');
                    return { results: [], errors: [], version: '' };
                }
                return JSON.parse(jsonLine);
            }
        } catch (error) {
            this.outputChannel.appendLine(`Failed to parse results: ${error}`);
            this.outputChannel.appendLine(`Full output: ${output}`);
            return { results: [], errors: [], version: '' };
        }
    }

    private getRulesPath(workspacePath: string): string {
        const config = vscode.workspace.getConfiguration('opengrep');
        const rulesPath = config.get<string>('rulesPath', '.opengrep/rules');
        
        if (path.isAbsolute(rulesPath)) {
            return rulesPath;
        }
        
        return path.join(workspacePath, rulesPath);
    }
}