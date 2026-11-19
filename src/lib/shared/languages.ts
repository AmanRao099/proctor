/**
 * Languages a candidate can write in. The ids are Judge0 1.13.1 language ids on
 * the EC2 instance (verified against GET /languages there).
 */
export const LANGUAGES = {
  python: { label: "Python 3", judge0Id: 71, monaco: "python" },
  cpp: { label: "C++ 17", judge0Id: 54, monaco: "cpp" },
  c: { label: "C", judge0Id: 50, monaco: "c" },
  java: { label: "Java", judge0Id: 62, monaco: "java" },
  javascript: { label: "JavaScript", judge0Id: 63, monaco: "javascript" },
} as const;

export type Language = keyof typeof LANGUAGES;

export const LANGUAGE_KEYS = Object.keys(LANGUAGES) as Language[];

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && value in LANGUAGES;
}

/** Starter code when a problem does not define its own. stdin in, stdout out. */
export const DEFAULT_STARTERS: Record<Language, string> = {
  python: `import sys

def main():
    data = sys.stdin.read().split()
    # read input from data, print the answer


if __name__ == "__main__":
    main()
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // read from cin, write to cout

    return 0;
}
`,
  c: `#include <stdio.h>

int main(void) {
    /* read from stdin, write to stdout */

    return 0;
}
`,
  java: `import java.util.*;
import java.io.*;

// The class must be named Main.
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        // read from in, print with System.out

    }
}
`,
  javascript: `const input = require("fs").readFileSync(0, "utf8").trim().split(/\\s+/);
// read from input, print with console.log
`,
};
