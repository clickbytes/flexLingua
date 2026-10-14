# Dokumentacja flexLingua — indeks

Ten plik jest nawigacją po dokumentacji. Aktualny cel i priorytety znajdują się w [ROADMAP.md](../ROADMAP.md), a publiczny opis projektu i instrukcje uruchomienia w [README.md](../README.md).

## Kierunek rozwoju i sposób pracy

- [A1.0 — strukturalny raport pokrycia](coverage-a1.md) — CLI, miary i ograniczenia.


- [Roadmapa PL ↔ INTER ↔ EN (A1–C2)](../ROADMAP.md) — etapy, kolejność, kryteria odbioru, przyszła rozmowa i osobowość.
- [Proces rozwoju i utrzymania dokumentacji](development-workflow.md) — zasady architektury, testy, wydania, checklisty dokumentacyjne.
- [v1.19 / zadania 4–5: polskie i angielskie pytania](questions-v1.19-pl-en.md) — parser, generator, przykłady, testy i ograniczenia.
- [v1.19 / zadanie 3: dokumenty pytań w CORE](questions-v1.19-semantic.md) — kontrakt semantyczny i format INTER.
- [Batch B v1.19: kryteria wydania](batch-b-v1.19.md) — wdrożone zadania 3–5, wydanie nadal w toku.

- [Studio GUI v2](gui-v2.md) — zakładki, wyszukiwanie wszystkich zadeklarowanych odmian i wizualizacja CORE, bez zmian w silniku.

## Dokumentacja obecnego silnika

- [API v1.0](api-v1.0.md) — interfejs silnika.
- [Semantyka v0.6](semantics-v0.6.md) i [gramatyka v0.6](grammar-v0.6.md) — wybrane operatory i konstrukcje.
- [Gramatyka v1.0](grammar-v1.0.md) — kontrakt obsługiwanych konstrukcji.
- [Leksykon CORE v1.01](lexical-core-v1.01.md) — sense i referencje CORE.
- [Morfologia v1.11](morphology-v1.11.md) — paradygmaty i generowanie form.
- [Leksykon v1.12](lexicon-v1.12.md) — kuratorowane rozszerzenie i testy gold.
- [Instrukcja lokalnego uruchomienia](uruchomienie-lokalne.md) — Windows i pliki offline.

## Spójność repozytorium

- [Audyt odnośników, brakujących plików i wersji](repository-audit.md) — jawnie śledzone zaległości dokumentacyjne, bez przypisywania niezweryfikowanych funkcji.

## Historia i wydania

- **Batch A v1.18:** aktualnie opisany w [README](../README.md#batch-a-v115v118--polishenglish-grammar-and-word-inflection-tables); wcześniejszy odnośnik README do osobnego dokumentu wymaga sprawdzenia / uzupełnienia.
- [Wydanie v1.0](release-v1.0.md).
- Starsze kontrakty: [semantyka v0.5](semantics-v0.5.md), [gramatyka v0.5](grammar-v0.5.md), [semantyka v0.4](semantics-v0.4.md), [gramatyka v0.3](grammar-v0.3.md), [gramatyka v0.2](grammar-v0.2.md).

**Status:** historyczne dokumenty odzwierciedlają konkretny etap rozwoju i nie muszą opisywać dzisiejszego zakresu. Sprawdzaj README, ROADMAP i bieżący dokument wydania.

### Kiedy aktualizować dokumentację?

Każda istotna zmiana w kodzie lub danych powinna mieć testy i odpowiadającą jej aktualizację dokumentacji **w tym samym commicie/PR**. Zobacz [macierz wymaganych aktualizacji](development-workflow.md#4-wymagany-pakiet-dokumentacyjny-zmiany).

- [Etap 1: batche C–F / roboczy kontrakt INTER 1.20](stage1-batches-c-f-v1.20.md) — modalność, parser, jawny kontekst, konstrukcje wielowyrazowe, granice pokrycia, testy i status wydania (robocze PR; nie `main`).

- [Mikrobatch E1: bezpieczna walidacja powiązań między zdaniami](context-coreference-e1.md) — ścisła tożsamość semantyczna, filtrowanie wieloznaczności, diagnostyka `INVALID_COREFERENCE`, ograniczenia i testy.

- [Mikrobatch E2a: kontrolowane zaimki podmiotu PL/EN](anaphora-e2a.md) — jednoznaczny poprzednik, wspólne ID w CORE, jawne odmowy, ograniczona realizacja i testy.

- [E2b: bezpieczna realizacja zaimków w języku docelowym](anaphora-e2b.md) — jawna polityka `safe/repeat`, zgodność INTER i przypadki odmowy.

- [E3: kontrolowany dyskurs 3–8 zdań](anaphora-e3.md) — wspólne referenty CORE, jednoznaczność, limity analiz i bezpieczne zaimki w kolejnych zdaniach.

- [E4: operacyjna pamięć rozmowy ConversationContext](conversation-e4.md) — jawna sesja w procesie, reset, limity, bezpieczeństwo błędów i testy.

- [F3: nowe semantyczne konstrukcje wielowyrazowe](multiword-f3.md) — trzy pojęcia CORE, rząd przypadków, pytania, negacja i granice pokrycia.


- [G1a: audyt CI, blokada uruchamiania Actions i kontrola pokrycia CORE](g1-ci-audit.md) — faktyczne testy, bramki wydania, nowe triggery i niezweryfikowane ograniczenia.

- [F3b: paradygmaty wielowyrazowych czasowników](multiword-morphology-f3.md) — niezależny oracle 55 form, odwrotna morfologia i granice testów.

- [G2: oryginalny gold A1 pilot](g2-a1-gold.md) — 32 próbki w dwóch kierunkach, osiem odmów, CORE.

- [G3: mierzalny pilot A1 — CLI, raport jakości i brak certyfikacji CEFR](g3-a1-report.md).

- [G1b: minimalny probe startu GitHub Actions](g1b-startup-probe.md) — jedno zadanie i instrukcja diagnozy provider-side.

- [F0 Batch 1: lokalny runner bramek CORE](f0-local-gates.md) — pełne testy Node w checkoutcie, niezależnie od startup_failure GitHub Actions.

- [A1 Batch 2: audyt luk](a1-gap-audit.md) — 22 cele, automatyczne rozpoznawanie braków CORE/PL/EN/morfologii/gramatyki/gold.

- [A1 Batch 3: rodzina, czytanie i pomaganie](a1-family-actions.md) — 4 CORE, odmiana, dative/acc, autorski gold.

- [A1 Batch 4: ojciec/father](a1-father.md) — pełna deklinacja, CORE i niezależny dwukierunkowy gold.

- [A1 Batch 5: intransitive movement](a1-movement.md) — `go/iść`, morphology and meaning limitations.

- [A1 Batch 6: daily actions](a1-daily-actions.md) — pisać/write, otwierać/open and independent gold.

- [A1 Batch 6 composition tests](a1-daily-actions.md#cross-batch-compositionality-tests) — modalities, interrogatives, coordination and discourse.
