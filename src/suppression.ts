import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { OpenGrepFinding } from './types';

export class SuppressionHandler {
    constructor(private outputChannel: { appendLine: (msg: string) => void }) {}

    async suppressFinding(
        document: vscode.TextDocument,
        finding: OpenGrepFinding,
        position?: vscode.Position
    ): Promise<void> {
        const line = position ? position.line : finding.start.line - 1;
        const textLine = document.lineAt(line);
        const lineText = textLine.text;

        // Determine comment style based on language
        const commentStyle = this.getCommentStyle(document.languageId);
        if (!commentStyle) {
            vscode.window.showErrorMessage(`Suppression not supported for ${document.languageId}`);
            return;
        }

        // Check if already suppressed
        if (lineText.includes('nosemgrep') || lineText.includes('nogrep')) {
            vscode.window.showInformationMessage('This line already has a suppression comment');
            return;
        }

        const edit = new vscode.WorkspaceEdit();
        const suppressComment = `${commentStyle} nosemgrep: ${finding.check_id}`;

        // Add suppression at end of line
        const endOfLine = textLine.range.end;
        edit.insert(document.uri, endOfLine, ` ${suppressComment}`);

        await vscode.workspace.applyEdit(edit);
        await document.save();

        vscode.window.showInformationMessage(`Suppressed ${finding.check_id} on line ${line + 1}`);
        this.outputChannel.appendLine(`Suppressed ${finding.check_id} in ${document.fileName}:${line + 1}`);
    }

    async suppressRuleInFile(
        document: vscode.TextDocument,
        ruleId: string
    ): Promise<void> {
        const commentStyle = this.getCommentStyle(document.languageId);
        if (!commentStyle) {
            vscode.window.showErrorMessage(`Suppression not supported for ${document.languageId}`);
            return;
        }

        const edit = new vscode.WorkspaceEdit();
        
        // Add file-level suppression at the top of the file
        const suppressComment = `${commentStyle} nosemgrep: ${ruleId}\n`;
        
        edit.insert(document.uri, new vscode.Position(0, 0), suppressComment);

        await vscode.workspace.applyEdit(edit);
        await document.save();

        vscode.window.showInformationMessage(`Suppressed rule ${ruleId} in entire file`);
        this.outputChannel.appendLine(`Suppressed rule ${ruleId} in entire file: ${document.fileName}`);
    }

    async suppressRuleGlobally(ruleId: string): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        const configPath = path.join(workspaceFolder.uri.fsPath, '.semgrep.yml');
        
        let config: any = {};
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf8');
            try {
                const yaml = await import('yaml');
                config = yaml.parse(content) || {};
            } catch (error) {
                vscode.window.showErrorMessage('Failed to parse .semgrep.yml');
                return;
            }
        }

        // Add rule to exclusions
        if (!config.rules) {
            config.rules = {};
        }
        if (!config.rules.exclude) {
            config.rules.exclude = [];
        }
        if (!config.rules.exclude.includes(ruleId)) {
            config.rules.exclude.push(ruleId);
        }

        // Write back config
        const yaml = await import('yaml');
        const yamlContent = yaml.stringify(config);
        fs.writeFileSync(configPath, yamlContent);

        vscode.window.showInformationMessage(`Globally suppressed rule ${ruleId}`);
        this.outputChannel.appendLine(`Globally suppressed rule ${ruleId} in .semgrep.yml`);
    }

    async suppressCurrentSelection(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showInformationMessage('Please select the code you want to suppress');
            return;
        }

        // Find diagnostics at this location
        const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
        const relevantDiagnostics = diagnostics.filter(d => 
            d.source === 'OpenGrep' && 
            d.range.intersection(selection) !== undefined
        );

        if (relevantDiagnostics.length === 0) {
            vscode.window.showInformationMessage('No OpenGrep findings at selected location');
            return;
        }

        if (relevantDiagnostics.length === 1) {
            // Single finding - suppress directly
            const diagnostic = relevantDiagnostics[0];
            const finding: OpenGrepFinding = {
                check_id: diagnostic.code as string,
                path: editor.document.fileName,
                start: { line: diagnostic.range.start.line + 1, col: diagnostic.range.start.character + 1 },
                end: { line: diagnostic.range.end.line + 1, col: diagnostic.range.end.character + 1 },
                extra: {
                    message: diagnostic.message,
                    severity: this.getSeverityString(diagnostic.severity)
                }
            };
            await this.suppressFinding(editor.document, finding, selection.start);
        } else {
            // Multiple findings - let user choose
            const items = relevantDiagnostics.map(d => ({
                label: d.code as string,
                description: d.message,
                diagnostic: d
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select which finding to suppress'
            });

            if (selected) {
                const finding: OpenGrepFinding = {
                    check_id: selected.diagnostic.code as string,
                    path: editor.document.fileName,
                    start: { line: selected.diagnostic.range.start.line + 1, col: selected.diagnostic.range.start.character + 1 },
                    end: { line: selected.diagnostic.range.end.line + 1, col: selected.diagnostic.range.end.character + 1 },
                    extra: {
                        message: selected.diagnostic.message,
                        severity: this.getSeverityString(selected.diagnostic.severity)
                    }
                };
                await this.suppressFinding(editor.document, finding, selection.start);
            }
        }
    }

    private getCommentStyle(languageId: string): string | null {
        const commentStyles: { [key: string]: string } = {
            'python': '#',
            'javascript': '//',
            'typescript': '//',
            'java': '//',
            'go': '//',
            'c': '//',
            'cpp': '//',
            'csharp': '//',
            'ruby': '#',
            'php': '//',
            'rust': '//',
            'kotlin': '//',
            'scala': '//',
            'swift': '//'
        };

        return commentStyles[languageId] || null;
    }

    private getSeverityString(severity: vscode.DiagnosticSeverity): 'ERROR' | 'WARNING' | 'INFO' {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error:
                return 'ERROR';
            case vscode.DiagnosticSeverity.Warning:
                return 'WARNING';
            default:
                return 'INFO';
        }
    }
}