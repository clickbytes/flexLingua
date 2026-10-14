# Przykłady kryteriów akceptacji: EPIC, TASK, BUG, SPIKE

## Kryterium dobrego taska

Nie pisać `morfologia działa`. Pisz konkretne wejścia/wyjścia, reprezentację CORE, odmowy, test, metrykę i dostępne źródła.

### Przykład: PERS-03, uzgodnienie osoby

- [ ] `I read the book.` → PL realizacja formy 1. osoby z zachowaniem concept `event.read`, agent speaker i theme `object.book`.
- [ ] `You read the book.` → odrębny addressee, nie bezmyślne utożsamienie z osobą trzecią.
- [ ] `I reads the book.` jest odrzucone; błędna osoba w danych i regule nie może przechodzić walidacji.
- [ ] Istniejące 3sg `The father reads the book.` nadal przechodzi; pełny `npm test` bez nowych regresji CORE.
- [ ] Wynik Actions z konkretnym SHA i run URL, udokumentowane odrębne niepowodzenia GUI oraz `HANDOFF.md`.

### Przykład: PERS-01, ADR nie implementacja

- [ ] Porównano co najmniej dwa reprezentacyjne modele speaker/addressee i form gramatycznych.
- [ ] Wykazano interlingua JSON schemat dla I/you/we w obu językach bez kodowania płci i bez zamiany perspektywy.
- [ ] ADR zapisuje ryzyka koreferencji E4 i wymaga testów serializacji dla nowego modelu.

### Przykład: BUG GUI-01

- [ ] W CI `npm run check:standalone` kończy się kodem 0 po regeneracji artefaktu przez właściciela GUI.
- [ ] Oba konkretne testy w `tests/studio-ui.test.js` przechodzą, w tym wybór paradygmatu i brakujące komórki.
- [ ] `npm run check:release` kończy się sukcesem na HEAD docelowego main, bez wyłączania zadań.

## Wymagania operacyjne

- Przed kodowaniem: epik + task + blocked by + owner + pliki + trzy AC.
- Po kodowaniu: PR z dowodami Node/GitHub Actions, uaktualnionym `HANDOFF.md`, docs oraz osobnymi ograniczeniami.
- Po merge: aktualizować checkbox taska w epiku; nie oznaczać epiku done, jeżeli jego AC pozostają niespełnione.
- `CEFR`: nie używać procentów kompletnych A1–C2 bez reprezentatywnego benchmarku i zatwierdzonego mianownika.
- `GUI`: nie edytować `js/core/**`; `CORE`: nie edytować `js/ui/**`, `index.html` i `index-standalone.html`.
