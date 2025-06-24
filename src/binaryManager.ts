import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { OpenGrepOutputChannel } from './output';

const execAsync = promisify(exec);

export class OpenGrepBinaryManager {
    private binaryPath: string | null = null;
    private readonly storageUri: vscode.Uri;

    constructor(
        private context: vscode.ExtensionContext,
        private outputChannel: OpenGrepOutputChannel
    ) {
        this.storageUri = context.globalStorageUri;
        // Ensure storage directory exists
        fs.mkdirSync(this.storageUri.fsPath, { recursive: true });
    }

    async getBinaryPath(): Promise<string> {
        if (this.binaryPath) {
            return this.binaryPath;
        }

        const configPath = vscode.workspace.getConfiguration('opengrep').get<string>('binaryPath');
        if (configPath && fs.existsSync(configPath)) {
            this.binaryPath = configPath;
            return configPath;
        }

        try {
            const { stdout } = await execAsync('which opengrep');
            this.binaryPath = stdout.trim();
            return this.binaryPath;
        } catch {
            const binaryName = os.platform() === 'win32' ? 'opengrep.exe' : 'opengrep';
            const installedPath = path.join(this.storageUri.fsPath, 'bin', binaryName);
            if (fs.existsSync(installedPath)) {
                this.binaryPath = installedPath;
                return installedPath;
            }
        }

        throw new Error('OpenGrep binary not found');
    }

    async checkBinary(): Promise<boolean> {
        try {
            const binaryPath = await this.getBinaryPath();
            const { stdout } = await execAsync(`"${binaryPath}" --version`);
            this.outputChannel.appendLine(`OpenGrep version: ${stdout.trim()}`);
            return true;
        } catch (error) {
            const install = await vscode.window.showWarningMessage(
                'OpenGrep CLI not found. Would you like to install it?',
                'Install',
                'Later'
            );
            
            if (install === 'Install') {
                await this.installOrUpdate();
                return this.checkBinary();
            }
            return false;
        }
    }

    async installOrUpdate(): Promise<void> {
        const platform = this.getPlatform();
        const arch = this.getArchitecture();
        
        if (!platform || !arch) {
            throw new Error(`Unsupported platform: ${os.platform()} ${os.arch()}`);
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Installing OpenGrep',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 10, message: 'Fetching latest release...' });
            
            const releaseUrl = await this.getLatestReleaseUrl(platform, arch);
            
            progress.report({ increment: 30, message: 'Downloading...' });
            const binDir = path.join(this.storageUri.fsPath, 'bin');
            await fs.promises.mkdir(binDir, { recursive: true });
            
            const binaryName = platform === 'windows' ? 'opengrep.exe' : 'opengrep';
            const binaryPath = path.join(binDir, binaryName);
            
            await this.downloadFile(releaseUrl, binaryPath);
            
            progress.report({ increment: 30, message: 'Setting permissions...' });
            if (platform !== 'windows') {
                await fs.promises.chmod(binaryPath, 0o755);
            }
            
            this.binaryPath = binaryPath;
            progress.report({ increment: 30, message: 'Installation complete!' });
            
            vscode.window.showInformationMessage('OpenGrep installed successfully!');
        });
    }

    private getPlatform(): string | null {
        switch (os.platform()) {
            case 'darwin': return 'osx';
            case 'linux': return 'manylinux';
            case 'win32': return 'windows';
            default: return null;
        }
    }

    private getArchitecture(): string | null {
        switch (os.arch()) {
            case 'x64': return 'x86';
            case 'arm64': return 'arm64';
            case 'ia32': return 'x86';
            default: return null;
        }
    }

    private async getLatestReleaseUrl(platform: string, arch: string): Promise<string> {
        try {
            const response = await axios.get('https://api.github.com/repos/opengrep/opengrep/releases/latest');
            const assets = response.data.assets;
            
            let assetName = `opengrep_${platform}_${arch}`;
            if (platform === 'windows') {
                assetName += '.exe';
            }
            
            const asset = assets.find((a: {name: string}) => a.name === assetName);
            
            if (!asset) {
                throw new Error(`No release found for ${platform}-${arch}`);
            }
            
            return asset.browser_download_url;
        } catch (error) {
            throw new Error(`Failed to fetch latest release: ${error}`);
        }
    }

    private async downloadFile(url: string, dest: string): Promise<void> {
        const writer = fs.createWriteStream(dest);
        const response = await axios.get(url, {
            responseType: 'stream'
        });
        
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    }
}