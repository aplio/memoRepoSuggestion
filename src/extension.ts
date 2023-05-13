import * as vscode from "vscode";
import { FileWatcher } from "./FileWatcher";

export function activate(context: vscode.ExtensionContext) {
  const fileWatcher = new FileWatcher(context);
  vscode.languages.registerCompletionItemProvider('markdown', fileWatcher, "#");
  context.subscriptions.push(fileWatcher);
}
