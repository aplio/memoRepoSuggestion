import * as vscode from "vscode";

class LineCandidate {
  constructor(
    public lineNumber: number,
    public line: string,
    public filePath: string
  ) {}
}

class FiledSuggestible {
  /**
   * suggest candidates. no unique check is done.  
   */
  public lineCandidates: LineCandidate[] = [];
  /**
   * checked timestamp set by constructor.  
   * not used for now
   */
  public timestamp: number;

  /**
   * date : now
   * candidates : empty arr
   * @param fileName 
   */
  constructor(public fileName: string) {
    this.timestamp = Date.now();
  }
}

export class FileWatcher {
  private disposable: vscode.Disposable;
  private filePath2suggestibleCandidatesMap: Map<string, FiledSuggestible> = new Map();

  constructor(context: vscode.ExtensionContext) {
    this.disposable = vscode.workspace.onDidChangeTextDocument(
      this.handleTextDocumentChange,
      this
    );

    this.processMarkdownFiles();

    // Load previously changed files from the global store
    const storedFiles =
      context.globalState.get<{ [key: string]: FiledSuggestible }>("changedFiles") ||
      {};
    for (const [fileName, storedFile] of Object.entries(storedFiles)) {
      const filedSuggestible = new FiledSuggestible(fileName);
      filedSuggestible.lineCandidates = storedFile.lineCandidates;
      filedSuggestible.timestamp = storedFile.timestamp;
      this.filePath2suggestibleCandidatesMap.set(fileName, filedSuggestible);
    }
  }

  private async processMarkdownFiles() {
    const markdownFiles = await vscode.workspace.findFiles("**/*.md");

    for (const uri of markdownFiles) {
      const lastModifiedTimestamp =
        (await vscode.workspace.fs.stat(uri)).mtime || 0;
      const document = await vscode.workspace.openTextDocument(uri);

      const suggestCandidates = new FiledSuggestible(uri.fsPath);
      document
        .getText()
        .split("\n")
        .filter((line) => line.includes("#"))
        .flatMap((line, lineNumber) => {
          return FileWatcher.extractCandidates(uri.fsPath, lineNumber, line);
        })
        .forEach((candidate) => {
          suggestCandidates.lineCandidates.push(candidate);
        });
      suggestCandidates.timestamp = lastModifiedTimestamp;
      this.filePath2suggestibleCandidatesMap.set(uri.fsPath, suggestCandidates);
    }
  }

  private static extractCandidates(
    filePath: string,
    lineNumber: number,
    line: string
  ): LineCandidate[] {
    const cleanLine = line.replace(/#/g, "").trim();
    return [new LineCandidate(lineNumber, cleanLine, filePath)];
  }

  dispose() {
    this.disposable.dispose();
  }

  private async handleTextDocumentChange(
    event: vscode.TextDocumentChangeEvent
  ) {
    const filePath = event.document.uri.fsPath;
    const lastModifiedTimestamp = (
      await vscode.workspace.fs.stat(event.document.uri)
    ).mtime;
    const suggestCandidates = new FiledSuggestible(filePath);

    suggestCandidates.timestamp = lastModifiedTimestamp;
    suggestCandidates.lineCandidates = [];

    for (
      let lineNumber = 0;
      lineNumber < event.document.lineCount;
      lineNumber++
    ) {
      const line = event.document.lineAt(lineNumber).text;
      if (!line.includes("#")) {
        continue;
      }
      Array.from(
        FileWatcher.extractCandidates(filePath, lineNumber, line)
      ).forEach((suggestCandidate) =>
        suggestCandidates.lineCandidates.push(suggestCandidate)
      );
    }
    this.filePath2suggestibleCandidatesMap.set(filePath, suggestCandidates);
    vscode.workspace
      .getConfiguration()
      .update(
        "changedFiles",
        Object.fromEntries(this.filePath2suggestibleCandidatesMap),
        vscode.ConfigurationTarget.Global
      );
  }

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const curLine = document.lineAt(position.line).text;
    if (!curLine.includes("#")) {
      return [];
    }
    return Array.from(this.filePath2suggestibleCandidatesMap.values())
      .flatMap((file) => file.lineCandidates)
      .map((candidate) => {
        const completionItem = new vscode.CompletionItem(
          candidate.line,
          vscode.CompletionItemKind.Text
        );
        completionItem.insertText = candidate.line;
        completionItem.documentation = candidate.filePath;
        completionItem.command = {
          command: "editor.action.triggerSuggest",
          title: "Re-trigger completions...",
        };
        return completionItem;
      });
  }
}
