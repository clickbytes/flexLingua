# G1a — audyt CI, aktywacja głównych triggerów i kontrola pokrycia CORE

> Archiwalny audyt historycznego workflow. Wszystkie statusy blokad i checklisty poniżej opisują ówczesny stan. Standalone parity i issue #1 zostały wycofane z bieżącego procesu; po PR #89 wszystkie trzy jobs przeszły w [Actions #38631654117](https://github.com/clickbytes/flexLingua/actions/runs/38631654117). Aktualne bramki są opisane w `package.json` i `.github/workflows/core-engine.yml`.

**Data:** 2026-10-14  
**Stan:** G1a zaimplementowany na gałęzi roboczej, etap weryfikacji wydania nadal **zablokowany** przez GitHub Actions i brak lokalnego checkoutu. Nie należy przedstawiać G1 jako pełnej certyfikacji.

## Co zmieniono w repo

- `.github/workflows/core-engine.yml` wywołuje CI na **push do `main`**, `core/**`, **PR do `main`** i ręcznym `workflow_dispatch`. Poprzednia konfiguracja obejmowała tylko push `core/stage1-*` i PR, bez push `main`.
- Workflow ma `permissions: contents: read`, kontrolę równoległych uruchomień, Node 22 i osobne zadania:
  - `engine-tests` → `npm test`;
  - `lexical-audits` → `check:lexicon`, `check:morphology`, `check:gold`, `check:coverage`;
  - `offline-parity` → `check:standalone`, **tylko odczyt** wygenerowanego artefaktu, nie jego budowa (właściciel GUI);
  - `release-gate` → `npm run check:release` po wcześniejszych bramkach.
- `tests/ci-workflow.test.js` sprawdza triggery, uprawnienia, limity i spójność wywołań z `package.json`.
- Audyt `tools/coverage-a1-lib.mjs` wykazał, że obecny raport nie uwzględniał kategorii `modals`, dodanej przez wcześniejsze batche, ani nie sprawdzał nieistniejących operatorów i funkcji gramatycznych CORE. Naprawiono te braki. `tests/coverage-a1.test.js` ma nową regresję. Nie zmieniono `cefr.percentage: null` — jest to **inwentarz strukturalny**, nie pomiar CEFR.

## Zweryfikowane wyniki

| Weryfikacja | Wynik | Granica dowodu |
| --- | --- | --- |
| Struktura YAML (PyYAML BaseLoader, kontrola triggerów i 4 jobs) | poprawna | składnia/stany, nie rzeczywisty runner GitHub |
| `node --test tests/ci-workflow.test.js` (Node **22.16.0**, npm **10.9.2**) | **4/4 zaliczone** | rzeczywisty Node na lokalnym, minimalnym odtworzeniu workflow i dokładnego `package.json` |
| `tests/coverage-a1.test.js` w izolowanym interpreterze JS na pobranych danych `main` i zmianie G1 | **4/4 zaliczone** | nie jest Node test runner; zmierzono `en: 52`, `pl: 47` leksemów, po **2** modalne na język, `cefr.percentage: null` |
| `npm test` (całe repo) | **NIEURUCHOMIONY** | kontener nie może pobrać repo przez DNS/HTTPS (github.com) |
| `npm run check:release` | **NIEURUCHOMIONY** | brak kompletnego lokalnego checkoutu; brak uruchomionych jobs GitHub |
| `npm run check:standalone` | **NIEURUCHOMIONY** | historyczna kontrola artefaktu offline; standalone i ten check wycofano w PR #89 |

Nie wolno sumować statycznych 4 testów Node i 4 izolowanych testów pokrycia w jedną liczbę `npm test`.

## Utrzymująca się awaria GitHub Actions

Po wypchnięciu poprawionego workflow nadal wystąpił [run 38561443454](https://github.com/ppotepa/flexLingua/actions/runs/38561443454) dla `core/g1-ci-20261014`, SHA `77b6af04d21e0ac5a103074a4d9e46fc6771ba75`: `conclusion=startup_failure`, `path=BuildFailed` i **0 utworzonych zadań**. [Run 38554469891](https://github.com/ppotepa/flexLingua/actions/runs/38554469891) dla poprzedniego `main` ma ten sam charakter. To nie jest błąd testów silnika ani dowód, że nowy YAML się wykonuje.

Nie mamy poprzez konektor dostępu do statusu ustawień/billing GitHub Actions; **przyczyna pozostaje niepotwierdzona**. Problem śledzony w [issue #9](https://github.com/ppotepa/flexLingua/issues/9). Właściciel repo powinien sprawdzić w GitHub **Settings → Actions → General** (uprawnienia, polityki, dostępność runnerów), ewentualne ograniczenia planu/rozliczeń oraz komunikat w szczegółach runu. Nie twierdzić, że problem to na pewno billing czy YAML.

## Kryteria zakończenia G1

1. Umożliwić rzeczywiste utworzenie jobs Actions na aktualnym `main`, nie `BuildFailed`, a następnie mieć logi czterech zadań.
2. Uruchomić **pełny** `npm test`, `check:lexicon`, `check:morphology`, `check:gold`, `check:coverage`, `check:standalone`, `check:release` w Node 20+.
3. Naprawić ujawnione regresje; opublikować wyniki z konkretnym SHA i numerem Actions run.
4. Zlecić właścicielowi GUI synchronizację `index-standalone.html`; bez samodzielnych zmian interfejsu przez agenta CORE.
5. Rozwiązać osobno brakujące produktywne wiązania morfologiczne F3, dodać gold tests i dopiero potem poszerzać A1/CEFR.

**Właściciel kodu G1a:** wyłącznie CI, audyt struktur, testy i dokumentacja; HTML/CSS/GUI pozostawione osobnemu agentowi.

## Po scaleniu G1a — nadal zablokowane (2026-10-14)

[PR #10](https://github.com/ppotepa/flexLingua/pull/10) scalono do `main` jako `012dd501220c40fd10abc109430116e6bdcafd25`. Po tym scaleniu automatyczne uruchomienie [38562898573](https://github.com/ppotepa/flexLingua/actions/runs/38562898573) dla dokładnie tego SHA ponownie zgłosiło `conclusion=startup_failure`, `path=BuildFailed`, **0 jobs**. Poprawione triggery są zapisane, ale nie rozwiązały przyczyny uruchomienia po stronie Actions. G1 pozostaje otwarty (issue #9). Brak podstaw, aby twierdzić, że `npm test` lub `check:release` przeszedł.

## Stan po G2, 2026-10-14

[Actions 38584238248](https://github.com/ppotepa/flexLingua/actions/runs/38584238248), scalony `main` SHA `3ff8d17b2248cbf6e24ad526fb72a3b369a410ca`: `startup_failure`, `BuildFailed`, 0 jobs. Przyczyny nie potwierdzono. G3 dodaje wyłącznie niezależny check gold; nie uważa tego za naprawę blokady uruchomienia workflow.

## G1b: uruchomienie odrębnej próby

Na G3/main `f081f3ef0dbfd94ea9c194b718226cbf31265baa`, run [38585582590](https://github.com/ppotepa/flexLingua/actions/runs/38585582590) zakończył się `startup_failure`, 0 jobs. Wprowadzono osobny minimalny `actions-smoke.yml` bez Node ani checkout; status po merge weryfikować osobno. Zob. [G1b](g1b-startup-probe.md).

## G1b second push check (2026-10-14)

Po pierwszym scaleniu [PR #14](https://github.com/ppotepa/flexLingua/pull/14), `main` SHA `a6d49ab97d23c15e42c9e087bf70d0555dde2317`, GitHub zapisał [Core Engine run 38585995455](https://github.com/ppotepa/flexLingua/actions/runs/38585995455) z `startup_failure` i 0 jobs. W liście przebiegów nie zarejestrował wtedy osobnego `Actions Startup Probe`. Dlatego wykonujemy drugi push zmieniający wyłącznie komentarz w już istniejącym na `main` pliku workflow, aby przetestować trigger `push.paths`. **Brak runu probe nie dowodzi poprawnego wykonania ani konkretnej przyczyny blokady.** Po merge sprawdzić osobny run, zaktualizować issue #9 i udokumentować wynik.

## Aktualna weryfikacja po drugim push (2026-10-14)

`main` `5a1f97e938e8e862adb670d032ac733beca9e664`: [Core Engine run #38586263561](https://github.com/ppotepa/flexLingua/actions/runs/38586263561) kończy się `startup_failure / BuildFailed`, 0 jobs. Po PR #14 i #15 lista 20 najnowszych przebiegów API zawiera tylko `workflow_id 383042448` — osobny `Actions Startup Probe` nie figuruje. Powód braku rejestracji/uruchomienia nie jest znany, więc nie można potwierdzić stanu runnerów ani przypisać winy składni, billingowi czy GitHub. Szczegóły i oczekiwane kontrole właściciela są w [issue #9](https://github.com/ppotepa/flexLingua/issues/9). Osobne zadanie [GUI #16](https://github.com/ppotepa/flexLingua/issues/16) blokuje potwierdzenie standalone bez ingerencji agenta CORE.

## F0: lokalny runner pełnych bramek

[Opis](f0-local-gates.md). W odróżnieniu od GitHub-hosted Actions zbiera kody wyjścia realnych poleceń Node w dostępnym checkoutcie, lecz nie twierdzi, że poprawia `startup_failure` ani certyfikuje release; standalone włączane osobno.
