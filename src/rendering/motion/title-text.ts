export type TitleToken = {text: string; accent: boolean};

/** `*word*` marks the words to colour; unbalanced markers stay literal. */
export function parseTitle(title: string): TitleToken[] {
  const tokens: TitleToken[] = [];
  let accent = false;
  for (const part of title.split(/(\*)/)) {
    if (part === '*') {
      accent = !accent;
      continue;
    }
    for (const word of part.split(/\s+/).filter(Boolean)) tokens.push({text: word, accent});
  }
  return tokens;
}

export function titleSize(plain: string): number {
  return plain.length > 70 ? 70 : plain.length > 44 ? 86 : plain.length > 24 ? 100 : 116;
}

export function plainTitle(title: string): string {
  return parseTitle(title).map(token => token.text).join(' ');
}
