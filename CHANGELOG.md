# Changelog

## 1.1.0 (2026-10-25)

Adult track rebuild.

- 1,500 words in three tiers of 500: Beginner, Expert and Master. Tiers and the order within them are based on word-frequency data, so difficulty rises steadily. The original 500 words are kept, and 1,000 new words were added (most of them in Master).
- Each tier is split into 50 sets of ten words in a suggested order, and players can open any set. A word counts as learned once its meaning, spelling and a synonym or antonym have each been answered correctly. Learning a whole set earns a bonus, and remembering it in later reviews earns a gold star.
- Set lessons: meet the words, then meaning, spelling and synonym/antonym rounds. Missed questions come back at the end of the round, and a half-finished set picks up where it left off.
- Placement quiz to suggest a starting tier and set.
- Hover (or keyboard focus) over any synonym or antonym shows a short definition: 2,843 new definitions.
- Player profiles: up to eight players per computer, each with their own progress and settings.
- Review screen for words that are due. Spaced repetition no longer counts repeated answers given before a word is due, so mastery reflects real recall over several days.
- Questions never use a near-synonym of the answer as a wrong option.
- Version 1.0 saves are upgraded automatically, with a backup kept as `progress.json.v1-backup`.
- Words with no common antonym (some Master words) use synonym questions only.

## 1.0.0 — 2026-10-21

First release.

- 500-word vocabulary list in three levels, each word with definition, example, synonyms and antonyms.
- Study cards, Meaning match, Spelling bee and Word sprint game modes.
- Offline pronunciation using Windows speech voices, with a slow mode.
- Spaced repetition, XP and levels, daily streaks and 13 achievements.
- Searchable word book, progress page, light and dark themes.
- Hardened Electron shell: sandboxed renderer, strict CSP, custom protocol, no network access, validated IPC.
- Windows installer and portable builds via electron-builder.
