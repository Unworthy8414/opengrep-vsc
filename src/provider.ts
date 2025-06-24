import * as vscode from 'vscode';

export class OpenGrepProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    provideCodeActions(
        document: vscode.TextDocument,
        _range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        _token: vscode.CancellationToken
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source !== 'OpenGrep') {
                continue;
            }

            const suppressAction = this.createSuppressAction(diagnostic, document);
            if (suppressAction) {
                actions.push(suppressAction);
            }
        }

        return actions;
    }

    private createSuppressAction(
        diagnostic: vscode.Diagnostic,
        document: vscode.TextDocument
    ): vscode.CodeAction | undefined {
        const line = document.lineAt(diagnostic.range.start.line);

        const action = new vscode.CodeAction(
            `Suppress OpenGrep rule: ${diagnostic.code}`,
            vscode.CodeActionKind.QuickFix
        );

        const edit = new vscode.WorkspaceEdit();
        
        const suppressComment = ` // nosemgrep: ${diagnostic.code}`;
        const position = line.range.end;
        
        edit.insert(document.uri, position, suppressComment);
        action.edit = edit;

        return action;
    }
}