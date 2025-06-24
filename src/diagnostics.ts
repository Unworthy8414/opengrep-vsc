import * as vscode from 'vscode';
import { OpenGrepScanner } from './scanner';
import { OpenGrepFinding } from './types';
import { FindingsProvider } from './views/findingsView';

export class OpenGrepDiagnosticProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private documentDiagnostics = new Map<string, vscode.Diagnostic[]>();
    private findingsProvider: FindingsProvider | null = null;

    constructor(private scanner: OpenGrepScanner) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('opengrep');
    }

    setFindingsProvider(provider: FindingsProvider) {
        this.findingsProvider = provider;
    }


    async scanDocument(document: vscode.TextDocument): Promise<void> {
        if (document.uri.scheme !== 'file') {
            return;
        }

        const findings = await this.scanner.scanFile(document.uri.fsPath);
        const diagnostics = this.findingsToDiagnostics(findings, document);
        
        this.documentDiagnostics.set(document.uri.toString(), diagnostics);
        this.diagnosticCollection.set(document.uri, diagnostics);
        
        // Update findings view
        if (this.findingsProvider) {
            this.findingsProvider.updateFindings(document.uri.fsPath, findings);
        }
    }

    async scanWorkspace(): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'OpenGrep: Scanning workspace',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 10, message: 'Starting scan...' });
            
            const findingsByFile = await this.scanner.scanWorkspace();
            
            progress.report({ increment: 50, message: 'Processing results...' });
            
            this.diagnosticCollection.clear();
            this.documentDiagnostics.clear();
            
            // Clear findings view
            if (this.findingsProvider) {
                this.findingsProvider.clearFindings();
            }
            
            let processedFiles = 0;
            const totalFiles = findingsByFile.size;
            
            for (const [filePath, findings] of findingsByFile) {
                const uri = vscode.Uri.file(filePath);
                
                try {
                    const document = await vscode.workspace.openTextDocument(uri);
                    const diagnostics = this.findingsToDiagnostics(findings, document);
                    
                    this.documentDiagnostics.set(uri.toString(), diagnostics);
                    this.diagnosticCollection.set(uri, diagnostics);
                    
                    // Update findings view
                    if (this.findingsProvider) {
                        this.findingsProvider.updateFindings(filePath, findings);
                    }
                } catch (error) {
                    console.error(`Failed to process ${filePath}:`, error);
                }
                
                processedFiles++;
                progress.report({ 
                    increment: 40 / totalFiles, 
                    message: `Processing ${processedFiles}/${totalFiles} files...` 
                });
            }
            
            progress.report({ increment: 100, message: 'Scan complete!' });
            
            const totalFindings = Array.from(findingsByFile.values())
                .reduce((sum, findings) => sum + findings.length, 0);
            
            vscode.window.showInformationMessage(
                `OpenGrep scan complete: ${totalFindings} findings in ${totalFiles} files`
            );
        });
    }

    private findingsToDiagnostics(findings: OpenGrepFinding[], document: vscode.TextDocument): vscode.Diagnostic[] {
        const config = vscode.workspace.getConfiguration('opengrep');
        const minSeverity = config.get<string>('severity', 'INFO');
        
        return findings
            .filter(finding => this.shouldIncludeFinding(finding, minSeverity))
            .map(finding => this.findingToDiagnostic(finding, document));
    }

    private shouldIncludeFinding(finding: OpenGrepFinding, minSeverity: string): boolean {
        const severityLevels = { 'INFO': 0, 'WARNING': 1, 'ERROR': 2 };
        const findingLevel = severityLevels[finding.extra.severity] || 0;
        const minLevel = severityLevels[minSeverity as keyof typeof severityLevels] || 0;
        return findingLevel >= minLevel;
    }

    private findingToDiagnostic(finding: OpenGrepFinding, document: vscode.TextDocument): vscode.Diagnostic {
        const startLine = Math.max(0, finding.start.line - 1);
        const startChar = Math.max(0, finding.start.col - 1);
        const endLine = Math.max(0, finding.end.line - 1);
        const endChar = Math.max(0, finding.end.col - 1);

        const range = new vscode.Range(
            new vscode.Position(startLine, startChar),
            new vscode.Position(endLine, endChar)
        );

        const severity = this.getSeverity(finding.extra.severity);
        const diagnostic = new vscode.Diagnostic(
            range,
            finding.extra.message || finding.check_id,
            severity
        );

        diagnostic.code = finding.check_id;
        diagnostic.source = 'OpenGrep';

        if (finding.extra.metadata) {
            const metadata = finding.extra.metadata;
            if (metadata.cwe) {
                diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
            }
            
            if (metadata.references && Array.isArray(metadata.references)) {
                diagnostic.relatedInformation = (metadata.references as string[]).map((ref: string) => 
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(document.uri, range),
                        ref
                    )
                );
            }
        }


        return diagnostic;
    }

    private getSeverity(severity: string): vscode.DiagnosticSeverity {
        switch (severity) {
            case 'ERROR':
                return vscode.DiagnosticSeverity.Error;
            case 'WARNING':
                return vscode.DiagnosticSeverity.Warning;
            case 'INFO':
            default:
                return vscode.DiagnosticSeverity.Information;
        }
    }

    clearAll() {
        this.diagnosticCollection.clear();
        this.documentDiagnostics.clear();
        if (this.findingsProvider) {
            this.findingsProvider.clearFindings();
        }
    }

    dispose() {
        this.diagnosticCollection.dispose();
    }
}