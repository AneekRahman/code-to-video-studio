export type CodeToken = {text: string; kind: 'plain' | 'keyword' | 'string' | 'number' | 'comment' | 'call' | 'punct'};

const keywords = new Set(['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'import', 'from', 'export', 'default', 'class', 'new', 'await', 'async', 'def', 'in', 'not', 'and', 'or', 'true', 'false', 'null', 'None', 'True', 'False', 'fn', 'pub', 'use', 'type', 'interface', 'try', 'catch', 'throw', 'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'JOIN', 'ORDER', 'BY', 'GROUP']);

/** A small lexer for line-level colouring; any language reads acceptably, none is parsed. */
export function tokenizeLine(line: string): CodeToken[] {
  const pattern = /(\/\/.*|#.*|--.*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(?=\()|([A-Za-z_$][\w$]*)|([{}()[\];,.:=<>+\-*/!&|?]+)|(\s+)|(.)/gu;
  const tokens: CodeToken[] = [];
  for (const match of line.matchAll(pattern)) {
    const [text, comment, string, number, call, word, punct] = match as unknown as string[];
    if (comment) tokens.push({text: comment, kind: 'comment'});
    else if (string) tokens.push({text: string, kind: 'string'});
    else if (number) tokens.push({text: number, kind: 'number'});
    else if (call) tokens.push({text: call, kind: keywords.has(call) ? 'keyword' : 'call'});
    else if (word) tokens.push({text: word, kind: keywords.has(word) ? 'keyword' : 'plain'});
    else if (punct) tokens.push({text: punct, kind: 'punct'});
    else tokens.push({text: text!, kind: 'plain'});
  }
  return tokens;
}
