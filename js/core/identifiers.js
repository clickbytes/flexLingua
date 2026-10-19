const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

const LEXEME_ID = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*$/u;
const CONSTRUCTION_ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const VARIANT_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const ROLE_ID = /^[a-zA-Z][a-zA-Z0-9_]*$/u;
const ROLE_PATH_ID = /^[a-zA-Z][a-zA-Z0-9]*(?:[._-][a-zA-Z0-9]+)*$/u;

function qualifiedId(value, pattern, maxLength, separators) {
  return typeof value === 'string' && value.length <= maxLength && pattern.test(value) &&
    !value.split(separators).some(part => FORBIDDEN_SEGMENTS.has(part));
}

/**
 * Identifier contracts are case-sensitive and are never normalized:
 *
 * | Namespace | Producer -> consumer | Alphabet | Max |
 * | --- | --- | --- | ---: |
 * | lexemeId | language lexicons -> grammar compiler and CORE mappings | ASCII letter first; letters, digits, `_`; dotted segments | 128 |
 * | senseId | language lexicons -> lexicon, grammar references, plugin analyses | same as lexemeId | 128 |
 * | constructionId | plugin surface results -> plugin contract and graph lookup | lowercase letter first; lowercase letters, digits, `.`, `_`, `-` separators | 128 |
 * | variantId | grammar linearizations -> compiler and plugin surface results | lowercase letter first; lowercase letters, digits, `.` or `-` separators | 64 |
 * | roleId | grammar frames/transfers -> CORE and plugin surface roles | ASCII letter first; letters, digits, `_` | 64 |
 * | rolePathId | grammar analysis -> plugin lexical-sense metadata | ASCII letter first; letters, digits, `.`, `_`, `-` separators | 128 |
 * | capabilityId | manifest declarations and grammar state keys -> plugin contract and grammar compiler | same as constructionId | 128 |
 *
 * Every namespace rejects JavaScript prototype-name segments. Capability ID
 * `all` is reserved; capability and construction IDs share an alphabet.
 * Separators in the qualified namespaces cannot repeat or trail; lexical
 * underscores remain part of a segment for compatibility with existing IDs.
 */
export const isLexemeId = value => qualifiedId(value, LEXEME_ID, 128, /\./u);
export const isSenseId = value => qualifiedId(value, LEXEME_ID, 128, /\./u);
export const isConstructionId = value => qualifiedId(value, CONSTRUCTION_ID, 128, /[._-]/u);
export const isCapabilityId = value => value !== 'all' &&
  qualifiedId(value, CONSTRUCTION_ID, 128, /[._-]/u);
export const isEvidenceId = value => qualifiedId(value, CONSTRUCTION_ID, 128, /[._-]/u);
export const isVariantId = value => qualifiedId(value, VARIANT_ID, 64, /[.-]/u);
export const isRoleId = value => qualifiedId(value, ROLE_ID, 64, /\./u);
export const isRolePathId = value => qualifiedId(value, ROLE_PATH_ID, 128, /[._-]/u);
