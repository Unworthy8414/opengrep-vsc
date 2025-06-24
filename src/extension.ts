import * as vscode from 'vscode';
import { OpenGrepProvider } from './provider';
import { OpenGrepDiagnosticProvider } from './diagnostics';
import { OpenGrepBinaryManager } from './binaryManager';
import { OpenGrepScanner } from './scanner';
import { OpenGrepOutputChannel } from './output';
import { FindingsProvider } from './views/findingsView';
import { RulesProvider } from './views/rulesView';
import { OpenGrepFinding } from './types';
import { SuppressionHandler } from './suppression';
import { RulesDownloader } from './rulesDownloader';

let diagnosticProvider: OpenGrepDiagnosticProvider;
let outputChannel: OpenGrepOutputChannel;
let findingsProvider: FindingsProvider;
let suppressionHandler: SuppressionHandler;

export async function activate(context: vscode.ExtensionContext) {
    console.log('OpenGrep extension is activating...');
    
    outputChannel = new OpenGrepOutputChannel();
    outputChannel.appendLine('OpenGrep extension activated');
    outputChannel.show();

    const binaryManager = new OpenGrepBinaryManager(context, outputChannel);
    const scanner = new OpenGrepScanner(binaryManager, outputChannel);
    diagnosticProvider = new OpenGrepDiagnosticProvider(scanner);
    suppressionHandler = new SuppressionHandler(outputChannel);
    const rulesDownloader = new RulesDownloader(outputChannel);

    // Create tree data providers
    findingsProvider = new FindingsProvider();
    const rulesProvider = new RulesProvider();
    
    // Connect findings provider to diagnostic provider
    diagnosticProvider.setFindingsProvider(findingsProvider);

    // Register tree views
    vscode.window.createTreeView('opengrep.findings', {
        treeDataProvider: findingsProvider,
        showCollapseAll: true
    });

    vscode.window.createTreeView('opengrep.rules', {
        treeDataProvider: rulesProvider
    });


    // Register commands
    const scanCommand = vscode.commands.registerCommand('opengrep.scan', () => scanCurrentFile(scanner));
    const scanWorkspaceCommand = vscode.commands.registerCommand('opengrep.scanWorkspace', () => scanWorkspace(scanner));
    const clearFindingsCommand = vscode.commands.registerCommand('opengrep.clearFindings', () => clearFindings());
    const showOutputCommand = vscode.commands.registerCommand('opengrep.showOutput', () => outputChannel.show());
    const installCommand = vscode.commands.registerCommand('opengrep.installCLI', () => binaryManager.installOrUpdate());
    const downloadRulesCommand = vscode.commands.registerCommand('opengrep.downloadDefaultRules', () => rulesDownloader.downloadDefaultRules());
    const goToFindingCommand = vscode.commands.registerCommand('opengrep.goToFinding', (filePath: string, finding: OpenGrepFinding) => goToFinding(filePath, finding));
    
    // Suppression commands
    const suppressFindingCommand = vscode.commands.registerCommand('opengrep.suppressFinding', 
        (item?: any) => handleSuppressFinding(item));
    const suppressRuleCommand = vscode.commands.registerCommand('opengrep.suppressRule', 
        (item?: any) => handleSuppressRule(item));
    const suppressRuleGloballyCommand = vscode.commands.registerCommand('opengrep.suppressRuleGlobally', 
        (item?: any) => handleSuppressRuleGlobally(item));
    

    context.subscriptions.push(
        scanCommand,
        scanWorkspaceCommand,
        clearFindingsCommand,
        showOutputCommand,
        installCommand,
        downloadRulesCommand,
        goToFindingCommand,
        suppressFindingCommand,
        suppressRuleCommand,
        suppressRuleGloballyCommand,
        diagnosticProvider,
        outputChannel,
    );

    // Register code action provider
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            { scheme: 'file' },
            new OpenGrepProvider(),
            {
                providedCodeActionKinds: OpenGrepProvider.providedCodeActionKinds
            }
        )
    );

    // Setup file watcher for scan on save
    const config = vscode.workspace.getConfiguration('opengrep');
    if (config.get<boolean>('scanOnSave')) {
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument(async (document) => {
                if (document.uri.scheme === 'file') {
                    outputChannel.appendLine(`Scanning ${document.fileName} on save...`);
                    await diagnosticProvider.scanDocument(document);
                }
            })
        );
    }

    // Check binary installation
    try {
        await binaryManager.checkBinary();
        
        // Check if rules exist, offer to download if not
        const hasRules = await rulesDownloader.checkForExistingRules();
        if (!hasRules) {
            const action = await vscode.window.showInformationMessage(
                'No OpenGrep rules found. Would you like to download the default security rules?',
                'Download Rules',
                'Later'
            );
            if (action === 'Download Rules') {
                await rulesDownloader.downloadDefaultRules();
            }
        }
        
        // Scan active file if present
        if (vscode.window.activeTextEditor) {
            const document = vscode.window.activeTextEditor.document;
            if (document.uri.scheme === 'file') {
                outputChannel.appendLine(`Scanning active file: ${document.fileName}`);
                await diagnosticProvider.scanDocument(document);
            }
        }
    } catch (error) {
        outputChannel.appendLine(`Binary check failed: ${error}`);
    }

    vscode.window.showInformationMessage('OpenGrep extension is ready!');
}

async function scanCurrentFile(_scanner: OpenGrepScanner) {
    outputChannel.appendLine('scanCurrentFile command triggered');
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('No active editor');
        outputChannel.appendLine('No active editor found');
        return;
    }

    outputChannel.appendLine(`Scanning file: ${editor.document.fileName}`);
    await diagnosticProvider.scanDocument(editor.document);
}

async function scanWorkspace(_scanner: OpenGrepScanner) {
    await diagnosticProvider.scanWorkspace();
}

function clearFindings() {
    diagnosticProvider.clearAll();
    findingsProvider.clearFindings();
    vscode.window.showInformationMessage('OpenGrep findings cleared');
}

async function goToFinding(filePath: string, finding: OpenGrepFinding) {
    try {
        const document = await vscode.workspace.openTextDocument(filePath);
        const editor = await vscode.window.showTextDocument(document);
        
        const startPos = new vscode.Position(finding.start.line - 1, finding.start.col - 1);
        const endPos = new vscode.Position(finding.end.line - 1, finding.end.col - 1);
        const range = new vscode.Range(startPos, endPos);
        
        editor.selection = new vscode.Selection(startPos, endPos);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to open finding: ${error}`);
    }
}

async function handleSuppressFinding(item?: any) {
    // Called from tree view context menu
    if (item && item.finding && item.filePath) {
        const document = await vscode.workspace.openTextDocument(item.filePath);
        await suppressionHandler.suppressFinding(document, item.finding);
        // Rescan the file after suppression
        await diagnosticProvider.scanDocument(document);
    } else {
        // Called from editor context menu
        await suppressionHandler.suppressCurrentSelection();
        if (vscode.window.activeTextEditor) {
            await diagnosticProvider.scanDocument(vscode.window.activeTextEditor.document);
        }
    }
}

async function handleSuppressRule(item?: any) {
    if (!item || !item.finding || !item.filePath) {
        vscode.window.showErrorMessage('No finding selected');
        return;
    }
    
    const document = await vscode.workspace.openTextDocument(item.filePath);
    await suppressionHandler.suppressRuleInFile(document, item.finding.check_id);
    // Rescan the file after suppression
    await diagnosticProvider.scanDocument(document);
}

async function handleSuppressRuleGlobally(item?: any) {
    if (!item || !item.finding) {
        vscode.window.showErrorMessage('No finding selected');
        return;
    }
    
    await suppressionHandler.suppressRuleGlobally(item.finding.check_id);
    // Rescan workspace after global suppression
    await diagnosticProvider.scanWorkspace();
}


export function deactivate() {
    if (diagnosticProvider) {
        diagnosticProvider.dispose();
    }
}