# G1b — diagnostyka GitHub Actions: minimalny workflow

**Data:** 2026-10-14. **Cel:** odróżnić awarię startu CI od błędu rzeczywistych testów Node bez modyfikowania produkcyjnego workflow `Core Engine CI`.

## Co wiemy

- Main `f081f3ef0dbfd94ea9c194b718226cbf31265baa`, [run 38585582590](https://github.com/ppotepa/flexLingua/actions/runs/38585582590): `status=completed`, `conclusion=startup_failure`, `path=BuildFailed`, 0 jobów. Nie wykonano `npm test`, `check:a1-gold` ani `check:release`.
- Tak samo działo się przed dodaniem G2/G3. `core-engine.yml` ma ograniczone, odczytowe uprawnienia i standardowe zadania Node 22.
- Dostępny konektor GitHub nie daje odczytu i modyfikacji ustawień Actions/billing dla repo; nie ma podstaw do zgadywania przyczyny.

## Kontrolowana próba

`.github/workflows/actions-smoke.yml` to jeden prosty job `runner-start`, jedna komenda `echo`, `permissions: contents: read`; bez `checkout`, `setup-node`, skryptów projektu i zależności. Workflow uruchamia się raz po wprowadzeniu samego pliku na `main`, lub ręcznie przez `workflow_dispatch`. Test lokalny sprawdza jego kontrakt i izolację od aplikacji. **Zielony test YAML nie oznacza, że zadziałał rzeczywisty runner.**

### Interpretacja

1. Jeśli nowy probe również ma `startup_failure` i 0 jobs, przyczyna jest najprawdopodobniej wspólna dla Actions w repo/konta/organizacji lub infrastruktury (nie można określić której bez komunikatu w UI/support).
2. Jeśli probe ma zakończony job, porównaj komunikaty i definicje konkretnego `Core Engine CI`; nie ogłaszaj całego release jako poprawnego.
3. Właściciel repo sprawdza **Settings → Actions → General** oraz ewentualną blokadę limitów/rozliczeń Actions, i szczegółowy komunikat uruchomienia. W razie braku informacji zgłasza GitHub Support dokładne identyfikatory run.
4. Po przywróceniu Actions: wymusić pełen przebieg `Core Engine CI` na aktualnym `main` i udokumentować wyniki wszystkich realnych jobów oraz `npm test`, `check:a1-gold`, `check:release`, `check:standalone`. Standalone należy do agenta GUI.

## Zakres uprawnień

Batch zmienia jedynie workflow diagnostyczny i dokumentację/testy infrastruktury. Nie dotyka `js/ui`, HTML, `index-standalone.html` ani semantyki CORE.

## G1b second push check (2026-10-14)

Po pierwszym scaleniu [PR #14](https://github.com/ppotepa/flexLingua/pull/14), `main` SHA `a6d49ab97d23c15e42c9e087bf70d0555dde2317`, GitHub zapisał [Core Engine run 38585995455](https://github.com/ppotepa/flexLingua/actions/runs/38585995455) z `startup_failure` i 0 jobs. W liście przebiegów nie zarejestrował wtedy osobnego `Actions Startup Probe`. Dlatego wykonujemy drugi push zmieniający wyłącznie komentarz w już istniejącym na `main` pliku workflow, aby przetestować trigger `push.paths`. **Brak runu probe nie dowodzi poprawnego wykonania ani konkretnej przyczyny blokady.** Po merge sprawdzić osobny run, zaktualizować issue #9 i udokumentować wynik.

## Aktualna weryfikacja po drugim push (2026-10-14)

`main` `5a1f97e938e8e862adb670d032ac733beca9e664`: [Core Engine run #38586263561](https://github.com/ppotepa/flexLingua/actions/runs/38586263561) kończy się `startup_failure / BuildFailed`, 0 jobs. Po PR #14 i #15 lista 20 najnowszych przebiegów API zawiera tylko `workflow_id 383042448` — osobny `Actions Startup Probe` nie figuruje. Powód braku rejestracji/uruchomienia nie jest znany, więc nie można potwierdzić stanu runnerów ani przypisać winy składni, billingowi czy GitHub. Szczegóły i oczekiwane kontrole właściciela są w [issue #9](https://github.com/ppotepa/flexLingua/issues/9). Osobne zadanie [GUI #16](https://github.com/ppotepa/flexLingua/issues/16) blokuje potwierdzenie standalone bez ingerencji agenta CORE.
