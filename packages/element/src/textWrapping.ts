import { isDevEnv, isTestEnv } from "@whiteboard/common";

import { charWidth, getLineWidth } from "./textMeasurements";



type FontString = string; // Define locally if not in types

let cachedCjkRegex: RegExp | undefined;
let cachedLineBreakRegex: RegExp | undefined;
let cachedEmojiRegex: RegExp | undefined;

/**
 * Test if a given text contains any CJK characters (including symbols, punctuation, etc,).
 */
export const containsCJK = (text: string) => {
    if (!cachedCjkRegex) {
        cachedCjkRegex = Regex.class(...Object.values(CJK));
    }

    return cachedCjkRegex.test(text);
};

const getLineBreakRegex = () => {
    if (!cachedLineBreakRegex) {
        try {
            cachedLineBreakRegex = getLineBreakRegexAdvanced();
        } catch {
            cachedLineBreakRegex = getLineBreakRegexSimple();
        }
    }

    return cachedLineBreakRegex;
};

const getEmojiRegex = () => {
    if (!cachedEmojiRegex) {
        cachedEmojiRegex = getEmojiRegexUnicode();
    }

    return cachedEmojiRegex;
};

/**
 * Common symbols used across different languages.
 */
const COMMON = {
    WHITESPACE: /\s/u,
    HYPHEN: /-/u,
    OPENING: /<\(\[\{/u,
    CLOSING: />\)\]\}.,:;!\?…\//u,
};

/**
 * Characters and symbols used in Chinese, Japanese and Korean.
 */
const CJK = {
    CHAR: /\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}｀＇＾〃〰〆＃＆＊＋－ー／＼＝｜￤〒￢￣/u,
    OPENING: /（［｛〈《｟｢「『【〖〔〘〚＜〝/u,
    CLOSING: /）］｝〉》｠｣」』】〗〕〙〛＞。．，、〟‥？！：；・〜〞/u,
    CURRENCY: /￥￦￡￠＄/u,
};

const EMOJI = {
    FLAG: /\p{RI}\p{RI}/u,
    JOINER:
        /(?:\p{Emoji_Modifier}|\uFE0F\u20E3?|[\u{E0020}-\u{E007E}]+\u{E007F})?/u,
    ZWJ: /\u200D/u,
    ANY: /[\p{Emoji}]/u,
    MOST: /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u,
};

const getLineBreakRegexSimple = () =>
    Regex.or(
        getEmojiRegex(),
        Break.On(COMMON.HYPHEN, COMMON.WHITESPACE, CJK.CHAR),
    );

const getLineBreakRegexAdvanced = () =>
    Regex.or(
        // Unicode-defined regex for (multi-codepoint) Emojis
        getEmojiRegex(),
        // Rules for whitespace and hyphen
        Break.Before(COMMON.WHITESPACE).Build(),
        Break.After(COMMON.WHITESPACE, COMMON.HYPHEN).Build(),
        // Rules for CJK (chars, symbols, currency)
        Break.Before(CJK.CHAR, CJK.CURRENCY)
            .NotPrecededBy(COMMON.OPENING, CJK.OPENING)
            .Build(),
        Break.After(CJK.CHAR)
            .NotFollowedBy(COMMON.HYPHEN, COMMON.CLOSING, CJK.CLOSING)
            .Build(),
        // Rules for opening and closing punctuation
        Break.BeforeMany(CJK.OPENING).NotPrecededBy(COMMON.OPENING).Build(),
        Break.AfterMany(CJK.CLOSING).NotFollowedBy(COMMON.CLOSING).Build(),
        Break.AfterMany(COMMON.CLOSING).FollowedBy(COMMON.OPENING).Build(),
    );

const getEmojiRegexUnicode = () =>
    Regex.group(
        Regex.or(
            EMOJI.FLAG,
            Regex.and(
                EMOJI.MOST,
                EMOJI.JOINER,
                Regex.build(
                    `(?:${EMOJI.ZWJ.source}(?:${EMOJI.FLAG.source}|${EMOJI.ANY.source}${EMOJI.JOINER.source}))*`,
                ),
            ),
        ),
    );

/**
 * Regex utilities for unicode character classes.
 */
const Regex = {
    build: (regex: string): RegExp => new RegExp(regex, "u"),
    join: (...regexes: RegExp[]): string => regexes.map((x) => x.source).join(""),
    and: (...regexes: RegExp[]): RegExp => Regex.build(Regex.join(...regexes)),
    or: (...regexes: RegExp[]): RegExp =>
        Regex.build(regexes.map((x) => x.source).join("|")),
    group: (...regexes: RegExp[]): RegExp =>
        Regex.build(`(${Regex.join(...regexes)})`),
    class: (...regexes: RegExp[]): RegExp =>
        Regex.build(`[${Regex.join(...regexes)}]`),
};

const Break = {
    On: (...regexes: RegExp[]) => {
        const joined = Regex.join(...regexes);
        return Regex.build(`([${joined}])`);
    },
    Before: (...regexes: RegExp[]) => {
        const joined = Regex.join(...regexes);
        const builder = () => Regex.build(`(?=[${joined}])`);
        return Break.Chain(builder) as Omit<
            ReturnType<typeof Break.Chain>,
            "FollowedBy"
        >;
    },
    After: (...regexes: RegExp[]) => {
        const joined = Regex.join(...regexes);
        const builder = () => Regex.build(`(?<=[${joined}])`);
        return Break.Chain(builder) as Omit<
            ReturnType<typeof Break.Chain>,
            "PreceededBy"
        >;
    },
    BeforeMany: (...regexes: RegExp[]) => {
        const joined = Regex.join(...regexes);
        const builder = () => Regex.build(`(?<![${joined}])(?=[${joined}])`);
        return Break.Chain(builder) as Omit<
            ReturnType<typeof Break.Chain>,
            "FollowedBy"
        >;
    },
    AfterMany: (...regexes: RegExp[]) => {
        const joined = Regex.join(...regexes);
        const builder = () => Regex.build(`(?<=[${joined}])(?![${joined}])`);
        return Break.Chain(builder) as Omit<
            ReturnType<typeof Break.Chain>,
            "PreceededBy"
        >;
    },
    NotBefore: (...regexes: RegExp[]) => {
        const joined = Regex.join(...regexes);
        const builder = () => Regex.build(`(?![${joined}])`);
        return Break.Chain(builder) as Omit<
            ReturnType<typeof Break.Chain>,
            "NotFollowedBy"
        >;
    },
    NotAfter: (...regexes: RegExp[]) => {
        const joined = Regex.join(...regexes);
        const builder = () => Regex.build(`(?<![${joined}])`);
        return Break.Chain(builder) as Omit<
            ReturnType<typeof Break.Chain>,
            "NotPrecededBy"
        >;
    },
    Chain: (rootBuilder: () => RegExp) => ({
        Build: rootBuilder,
        PreceededBy: (...regexes: RegExp[]) => {
            const root = rootBuilder();
            const preceeded = Break.After(...regexes).Build();
            const builder = () => Regex.and(preceeded, root);
            return Break.Chain(builder) as Omit<
                ReturnType<typeof Break.Chain>,
                "PreceededBy"
            >;
        },
        FollowedBy: (...regexes: RegExp[]) => {
            const root = rootBuilder();
            const followed = Break.Before(...regexes).Build();
            const builder = () => Regex.and(root, followed);
            return Break.Chain(builder) as Omit<
                ReturnType<typeof Break.Chain>,
                "FollowedBy"
            >;
        },
        NotPrecededBy: (...regexes: RegExp[]) => {
            const root = rootBuilder();
            const notPreceeded = Break.NotAfter(...regexes).Build();
            const builder = () => Regex.and(notPreceeded, root);
            return Break.Chain(builder) as Omit<
                ReturnType<typeof Break.Chain>,
                "NotPrecededBy"
            >;
        },
        NotFollowedBy: (...regexes: RegExp[]) => {
            const root = rootBuilder();
            const notFollowed = Break.NotBefore(...regexes).Build();
            const builder = () => Regex.and(root, notFollowed);
            return Break.Chain(builder) as Omit<
                ReturnType<typeof Break.Chain>,
                "NotFollowedBy"
            >;
        },
    }),
};

export const parseTokens = (line: string) => {
    const breakLineRegex = getLineBreakRegex();
    return line.normalize("NFC").split(breakLineRegex).filter(Boolean);
};

export const wrapText = (
    text: string,
    font: FontString,
    maxWidth: number,
): string => {
    if (!Number.isFinite(maxWidth) || maxWidth < 0) {
        return text;
    }

    const lines: Array<string> = [];
    const originalLines = text.split("\n");

    for (const originalLine of originalLines) {
        const currentLineWidth = getLineWidth(originalLine, font);

        if (currentLineWidth <= maxWidth) {
            lines.push(originalLine);
            continue;
        }

        const wrappedLine = wrapLine(originalLine, font, maxWidth);
        lines.push(...wrappedLine);
    }

    return lines.join("\n");
};

const wrapLine = (
    line: string,
    font: FontString,
    maxWidth: number,
): string[] => {
    const lines: Array<string> = [];
    const tokens = parseTokens(line);
    const tokenIterator = tokens[Symbol.iterator]();

    let currentLine = "";
    let currentLineWidth = 0;

    let iterator = tokenIterator.next();

    while (!iterator.done) {
        const token = iterator.value;
        const testLine = currentLine + token;

        const testLineWidth = isSingleCharacter(token)
            ? currentLineWidth + charWidth.calculate(token, font)
            : getLineWidth(testLine, font);

        if (/\s/.test(token) || testLineWidth <= maxWidth) {
            currentLine = testLine;
            currentLineWidth = testLineWidth;
            iterator = tokenIterator.next();
            continue;
        }

        if (!currentLine) {
            const wrappedWord = wrapWord(token, font, maxWidth);
            const trailingLine = wrappedWord[wrappedWord.length - 1] ?? "";
            const precedingLines = wrappedWord.slice(0, -1);

            lines.push(...precedingLines);

            currentLine = trailingLine;
            currentLineWidth = getLineWidth(trailingLine, font);
            iterator = tokenIterator.next();
        } else {
            lines.push(currentLine.trimEnd());
            currentLine = "";
            currentLineWidth = 0;
        }
    }

    if (currentLine) {
        const trailingLine = trimLine(currentLine, font, maxWidth);
        lines.push(trailingLine);
    }

    return lines;
};

const wrapWord = (
    word: string,
    font: FontString,
    maxWidth: number,
): Array<string> => {
    if (getEmojiRegex().test(word)) {
        return [word];
    }

    satisfiesWordInvariant(word);

    const lines: Array<string> = [];
    const chars = Array.from(word);

    let currentLine = "";
    let currentLineWidth = 0;

    for (const char of chars) {
        const _charWidth = charWidth.calculate(char, font);
        const testLineWidth = currentLineWidth + _charWidth;

        if (testLineWidth <= maxWidth) {
            currentLine = currentLine + char;
            currentLineWidth = testLineWidth;
            continue;
        }

        if (currentLine) {
            lines.push(currentLine);
        }

        currentLine = char;
        currentLineWidth = _charWidth;
    }

    if (currentLine) {
        lines.push(currentLine);
    }

    return lines;
};

const trimLine = (line: string, font: FontString, maxWidth: number) => {
    const shouldTrimWhitespaces = getLineWidth(line, font) > maxWidth;

    if (!shouldTrimWhitespaces) {
        return line;
    }

    let [, trimmedLine, whitespaces] = line.match(/^(.+?)(\s+)$/) ?? [
        line,
        line.trimEnd(),
        "",
    ];

    let trimmedLineWidth = getLineWidth(trimmedLine, font);

    for (const whitespace of Array.from(whitespaces)) {
        const _charWidth = charWidth.calculate(whitespace, font);
        const testLineWidth = trimmedLineWidth + _charWidth;

        if (testLineWidth > maxWidth) {
            break;
        }

        trimmedLine = trimmedLine + whitespace;
        trimmedLineWidth = testLineWidth;
    }

    return trimmedLine;
};

const isSingleCharacter = (maybeSingleCharacter: string) => {
    return (
        maybeSingleCharacter.codePointAt(0) !== undefined &&
        maybeSingleCharacter.codePointAt(1) === undefined
    );
};

const satisfiesWordInvariant = (word: string) => {
    if (isTestEnv() || isDevEnv()) {
        if (/\s/.test(word)) {
            throw new Error("Word should not contain any whitespaces!");
        }
    }
};
