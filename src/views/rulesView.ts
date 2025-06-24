import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'yaml';

interface Rule {
    id: string;
    message: string;
    severity: string;
    languages?: string[];
}

export class RuleTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly rule?: Rule,
        public readonly filePath?: string,
        public readonly isCategory: boolean = false
    ) {
        super(label, collapsibleState);
        
        if (isCategory) {
            // This is a category/folder item
            this.iconPath = new vscode.ThemeIcon('folder');
            this.contextValue = 'ruleCategory';
        } else if (rule) {
            // This is a rule item
            this.description = rule.severity;
            this.tooltip = `${rule.message}\nLanguages: ${rule.languages?.join(', ') || 'all'}`;
            this.contextValue = `rule-${rule.severity.toLowerCase()}`;
            
            // Set icon based on severity
            switch (rule.severity) {
                case 'ERROR':
                    this.iconPath = new vscode.ThemeIcon('shield', new vscode.ThemeColor('errorForeground'));
                    break;
                case 'WARNING':
                    this.iconPath = new vscode.ThemeIcon('shield', new vscode.ThemeColor('editorWarning.foreground'));
                    break;
                default:
                    this.iconPath = new vscode.ThemeIcon('shield', new vscode.ThemeColor('editorInfo.foreground'));
            }

            // Set command to open rule file
            if (filePath) {
                this.command = {
                    command: 'vscode.open',
                    title: 'Open Rule',
                    arguments: [vscode.Uri.file(filePath)]
                };
            }
        }
    }
}

export class RulesProvider implements vscode.TreeDataProvider<RuleTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<RuleTreeItem | undefined | null | void> = new vscode.EventEmitter<RuleTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<RuleTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private rulesByCategory: Map<string, RuleTreeItem[]> = new Map();

    constructor() {
        // Watch for rule file changes (including nested directories)
        const watcher = vscode.workspace.createFileSystemWatcher('**/.opengrep/rules/**/*.{yaml,yml}');
        watcher.onDidCreate(() => this.refresh());
        watcher.onDidChange(() => this.refresh());
        watcher.onDidDelete(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: RuleTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: RuleTreeItem): Promise<RuleTreeItem[]> {
        if (!element) {
            // Load all rules and organize by category
            await this.loadRules();
            
            // Return top-level categories
            const categories: RuleTreeItem[] = [];
            for (const [category, rules] of this.rulesByCategory) {
                categories.push(new RuleTreeItem(
                    `${category} (${rules.length})`,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    undefined,
                    undefined,
                    true
                ));
            }
            return categories.sort((a, b) => a.label.localeCompare(b.label));
        } else if (element.isCategory) {
            // Return rules for this category
            const categoryName = element.label.replace(/ \(\d+\)$/, '');
            return this.rulesByCategory.get(categoryName) || [];
        }
        return [];
    }

    private async loadRules(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        const rulesPath = this.getRulesPath(workspaceFolder.uri.fsPath);
        if (!fs.existsSync(rulesPath)) {
            return;
        }

        this.rulesByCategory.clear();
        
        try {
            // Recursively find all YAML files
            const yamlFiles = await this.findYamlFiles(rulesPath);
            
            for (const filePath of yamlFiles) {
                try {
                    const content = await fs.promises.readFile(filePath, 'utf8');
                    const parsed = yaml.parse(content);
                    
                    // Determine category from file path
                    const relativePath = path.relative(rulesPath, filePath);
                    const pathParts = relativePath.split(path.sep);
                    const category = pathParts[0]; // First directory is the language/category
                    
                    if (parsed.rules && Array.isArray(parsed.rules)) {
                        for (const rule of parsed.rules) {
                            if (rule.id) {
                                const ruleItem = new RuleTreeItem(
                                    rule.id,
                                    vscode.TreeItemCollapsibleState.None,
                                    {
                                        id: rule.id,
                                        message: rule.message || 'No description',
                                        severity: rule.severity || 'INFO',
                                        languages: rule.languages
                                    },
                                    filePath,
                                    false
                                );
                                
                                if (!this.rulesByCategory.has(category)) {
                                    this.rulesByCategory.set(category, []);
                                }
                                this.rulesByCategory.get(category)!.push(ruleItem);
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Failed to parse rule file ${filePath}:`, error);
                }
            }
        } catch (error) {
            console.error('Failed to load rules:', error);
        }
    }

    private async findYamlFiles(dir: string): Promise<string[]> {
        const yamlFiles: string[] = [];
        
        const scanDirectory = async (currentDir: string) => {
            const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                
                if (entry.isDirectory()) {
                    // Recursively scan subdirectories
                    await scanDirectory(fullPath);
                } else if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
                    yamlFiles.push(fullPath);
                }
            }
        };
        
        await scanDirectory(dir);
        return yamlFiles;
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