/**
 * Returns the singular or plural form of a word based on the count.
 */
export function pluralize(word: string, count: number): string {
  if (count === 1) {
    return word;
  }

  const vowels = "aeiou";
  if (word.endsWith("y") && !vowels.includes(word.at(-2) ?? "")) {
    return `${word.slice(0, -1)}ies`;
  }

  return `${word}s`;
}
