# OpenGrep for Visual Studio Code

Advanced security analysis for VS Code using OpenGrep - the open-source alternative to Semgrep. Find and fix security vulnerabilities in your code.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![VS Code](https://img.shields.io/badge/VS%20Code-^1.74.0-brightgreen)
![License](https://img.shields.io/badge/license-LGPL--2.1-green)

## Features

### Security Analysis
- **Real-time Scanning**: Automatically scan files as you save
- **Workspace Analysis**: Scan entire projects with one click
- **Problem Integration**: Security findings appear in VS Code's Problems panel
- **Severity Filtering**: Focus on critical issues first
- **Default Security Rules**: Download battle-tested rules for 14+ languages

### Suppression & Management
- **Right-Click Suppression**: Easily suppress findings with context menus
- **Multiple Suppression Levels**: Line-level, file-level, or global suppression
- **Organized Views**: Dedicated sidebar showing findings and rules by category

### Developer Experience
- **Quick Navigation**: Click findings to jump to code
- **Syntax Highlighting**: Clear visual indicators for different severity levels
- **Progress Tracking**: Real-time progress for workspace scans
- **Auto-Installation**: OpenGrep CLI installs automatically
- **Nested Rule Support**: Handles complex rule directory structures

## Getting Started

### Installation
1. Install from VS Code Marketplace: Search for "OpenGrep"
2. Open a project with code you want to analyze
3. The extension will prompt to install OpenGrep CLI automatically

### Basic Setup

#### Option 1: Use Default Security Rules (Recommended)
1. Run command: `OpenGrep: Download Default Security Rules`
2. Select languages you want rules for (Python, JavaScript, Java, etc.)
3. Rules will be downloaded to `.opengrep/rules/`
4. Save any file to trigger automatic scanning

The default rules come from [opengrep-rules](https://github.com/opengrep/opengrep-rules) - a comprehensive collection of security patterns for multiple languages.

#### Option 2: Create Custom Rules
1. Create a `.opengrep/rules` directory in your project
2. Add your own security rules (see examples below)
3. Save any file to trigger automatic scanning

## Rule Examples

Create `.opengrep/rules/security.yaml`:

```yaml
rules:
  - id: hardcoded-secret
    patterns:
      - pattern: |
          $KEY = "..."
      - metavariable-regex:
          metavariable: $KEY
          regex: '.*(password|secret|api_key|token).*'
    message: "Hardcoded secret detected. Use environment variables."
    languages: [python, javascript, go]
    severity: ERROR

  - id: sql-injection
    pattern: |
      $CURSOR.execute(f"...{$VAR}...")
    message: "SQL injection risk. Use parameterized queries."
    languages: [python]
    severity: ERROR

  - id: path-traversal
    patterns:
      - pattern: open($PATH, ...)
      - pattern-not: open("...", ...)
    message: "Path traversal vulnerability. Validate file paths."
    languages: [python]
    severity: ERROR
```

## Configuration

### Extension Settings
- `opengrep.binaryPath`: Custom path to OpenGrep binary
- `opengrep.rulesPath`: Rules directory path (default: `.opengrep/rules`)
- `opengrep.scanOnSave`: Enable automatic scanning (default: true)
- `opengrep.severity`: Minimum severity level (INFO/WARNING/ERROR)
- `opengrep.defaultRulesRepo`: GitHub repository for default rules (default: `https://github.com/opengrep/opengrep-rules`)

## Commands

### Scanning Commands
- `OpenGrep: Scan Current File` - Analyze active file
- `OpenGrep: Scan Workspace` - Analyze entire workspace
- `OpenGrep: Clear Findings` - Clear all findings
- `OpenGrep: Download Default Security Rules` - Get comprehensive security rules

### Suppression Commands
- `Suppress OpenGrep Finding` - Add inline suppression comment
- `Suppress This Rule in File` - Suppress rule for entire file
- `Suppress This Rule Globally` - Add to .semgrep.yml exclusions

### Utility Commands
- `OpenGrep: Show Output` - View detailed logs
- `OpenGrep: Install/Update CLI` - Update OpenGrep binary

## Right-Click Menus

### On Security Findings
1. **Suppress Finding** - Add suppression comment
2. **Suppress Rule in File** - File-level suppression
3. **Suppress Rule Globally** - Project-wide suppression

### In Code Editor
- Select code and right-click → **Suppress OpenGrep Finding**

## Suppression Formats

### Line-level suppression
```python
password = "admin123"  # nosemgrep: hardcoded-secret
```

### File-level suppression
```python
# nosemgrep: hardcoded-secret
# File contains test data only
```

### Global suppression (.semgrep.yml)
```yaml
rules:
  exclude:
    - hardcoded-secret
```

## Requirements

- VS Code 1.74.0 or higher
- OpenGrep CLI (auto-installed)

## Supported Languages

OpenGrep supports 30+ languages including:
- Python, JavaScript, TypeScript, Go, Java
- C, C++, C#, Ruby, PHP, Rust
- Swift, Kotlin, Scala, Solidity
- YAML, JSON, Dockerfile, Terraform
- And many more!

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup
```bash
# Clone the repository
git clone https://github.com/opengrep/opengrep-vsc.git
cd opengrep-vsc

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Open in VS Code
code .
```

Press `F5` to run the extension in a new VS Code window.

## License

LGPL 2.1 License - see [LICENSE](LICENSE) file for details

## Acknowledgments

- Built on top of [OpenGrep](https://github.com/opengrep/opengrep), the open-source code security engine
- Default rules from [opengrep-rules](https://github.com/opengrep/opengrep-rules)
- Inspired by the developer security needs of the community