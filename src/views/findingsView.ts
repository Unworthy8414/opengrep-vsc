import * as vscode from 'vscode';
import * as path from 'path';
import { OpenGrepFinding } from '../types';

export class FindingsTreeItem extends vscode.TreeItem {
    constructor(
        public readonly finding: OpenGrepFinding,
        public readonly filePath: string
    ) {
        // Use message as the label instead of check_id
        const label = finding.extra.message || finding.check_id;
        super(label, vscode.TreeItemCollapsibleState.None);
        
        // Show file:line as description
        this.description = `${path.basename(filePath)}:${finding.start.line}`;
        
        // Create detailed tooltip
        const lines = finding.extra.lines?.trim() || '';
        this.tooltip = new vscode.MarkdownString();
        this.tooltip.appendMarkdown(`**Rule:** ${finding.check_id}\n\n`);
        this.tooltip.appendMarkdown(`**Severity:** ${finding.extra.severity}\n\n`);
        this.tooltip.appendMarkdown(`**Message:** ${finding.extra.message}\n\n`);
        if (lines) {
            this.tooltip.appendMarkdown('**Code:**\n```python\n' + lines + '\n```');
        }
        this.tooltip.isTrusted = true;
        
        // Set context value for better readability
        this.contextValue = `opengrep-${finding.extra.severity.toLowerCase()}`;
        
        // Set icon based on severity
        switch (finding.extra.severity) {
            case 'ERROR':
                this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
                break;
            case 'WARNING':
                this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
                break;
            default:
                this.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('editorInfo.foreground'));
        }

        // Set command to jump to finding
        this.command = {
            command: 'opengrep.goToFinding',
            title: 'Go to Finding',
            arguments: [filePath, finding]
        };
        
        // Store data for context menu commands
        (this as any).finding = finding;
        (this as any).filePath = filePath;
    }
}

export class FindingsProvider implements vscode.TreeDataProvider<FindingsTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FindingsTreeItem | undefined | null | void> = new vscode.EventEmitter<FindingsTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FindingsTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private findings: Map<string, OpenGrepFinding[]> = new Map();

    constructor() {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    updateFindings(filePath: string, findings: OpenGrepFinding[]): void {
        if (findings.length === 0) {
            this.findings.delete(filePath);
        } else {
            this.findings.set(filePath, findings);
        }
        this.refresh();
    }

    clearFindings(): void {
        this.findings.clear();
        this.refresh();
    }

    getTreeItem(element: FindingsTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: FindingsTreeItem): Thenable<FindingsTreeItem[]> {
        if (!element) {
            // Root level - return all findings sorted by severity then by file
            const items: FindingsTreeItem[] = [];
            const severityOrder = { 'ERROR': 0, 'WARNING': 1, 'INFO': 2 };
            
            for (const [filePath, fileFindings] of this.findings) {
                for (const finding of fileFindings) {
                    items.push(new FindingsTreeItem(finding, filePath));
                }
            }
            
            // Sort by severity first, then by file path
            items.sort((a, b) => {
                const severityA = severityOrder[a.finding.extra.severity as keyof typeof severityOrder] || 999;
                const severityB = severityOrder[b.finding.extra.severity as keyof typeof severityOrder] || 999;
                if (severityA !== severityB) {
                    return severityA - severityB;
                }
                return a.filePath.localeCompare(b.filePath);
            });
            
            return Promise.resolve(items);
        }
        return Promise.resolve([]);
    }

    getTotalFindings(): number {
        let total = 0;
        for (const findings of this.findings.values()) {
            total += findings.length;
        }
        return total;
    }
}