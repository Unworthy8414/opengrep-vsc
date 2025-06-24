import * as vscode from 'vscode';

export class OpenGrepOutputChannel {
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('OpenGrep');
    }

    appendLine(message: string) {
        const timestamp = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    append(message: string) {
        this.outputChannel.append(message);
    }

    show() {
        this.outputChannel.show();
    }

    clear() {
        this.outputChannel.clear();
    }

    dispose() {
        this.outputChannel.dispose();
    }
}