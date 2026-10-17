# CLI translacji

Wymagany runtime to **Node.js 22.12.0 lub nowszy** (`engines.node: >=22.12.0`). Ten próg odpowiada stabilnej obsłudze używanych import attributes i modułów JSON. Do codziennego użytku wybieraj aktualnie wspieraną wersję LTS Node.js.

`tools/translate.mjs` jest samodzielną komendą Node. Nie wymaga serwera ani uruchomionej aplikacji terminalowej.

```sh
node tools/translate.mjs --languages
node tools/translate.mjs --from en --to pl --text "The girl sees the dog."
node tools/translate.mjs --from pl --to en --text "Dziewczynka widzi psa." --json
node tools/translate.mjs --from en --to ar --text "The girl sees the dog." --json
```

`--languages` czyta registry i manifest każdego pakietu. Wypisuje jego zadeklarowany status (`controlled-subset`, `limited-demo` lub `morphology-only`) albo `unavailable`, jeśli pakietu nie można odczytać. Zadeklarowane `directions` są widoczne jako kolumna lub pole JSON. Wynik `unavailable` nie oznacza działającego tłumaczenia. Dodanie `--json` daje jeden dokument z listą języków, capabilities i diagnostyką.

Translacja wymaga dokładnie `--from CODE --to CODE --text "..."` i ładuje tylko pakiety potrzebne dla wybranego kierunku. Jeśli którykolwiek manifest deklaruje `directions`, para musi być obecna na każdej zadeklarowanej liście; w przeciwnym razie CLI zwraca `PLUGIN_DIRECTION_UNAVAILABLE`. Zwykłe wyjście zawiera tylko jedno zdanie docelowe na stdout; odmowa trafia na stderr jako `CODE: reason`. `--show-core` pokazuje znaczenie CORE na stderr po udanym tłumaczeniu. `--json` wypisuje jeden dokument z polami `status`, `from`, `to`, `input`, `text`, `meaning`, `alternatives`, `diagnostics` oraz, przy sukcesie, `warnings` i `informationLoss`. CLI odmawia przy wielu odczytaniach semantycznych zamiast wybierać je bez decyzji użytkownika.

Kody wyjścia: `0` oznacza sukces, `2` odmowę lub błędne argumenty (`unsupported`, `invalid`, `ambiguous`, `resource_limit`), `1` błąd infrastruktury. Jeżeli pakiet PL lub EN jest jeszcze niedostępny, wynik jest odmową `PLUGIN_PACKAGE_UNAVAILABLE` z kodem `2`.

Automatyczna kontrola tego zachowania działa przez `tests/`: kanoniczna macierz zdań (`npm test`, wymagany check `translation-matrix` w GitHub Actions) wykonuje te same ścieżki produkcyjne z zatwierdzonymi oczekiwaniami — dokładny tekst, CORE, role, cechy, alternatywy, strata informacji, diagnostyka, odmowy i znane luki. Ręczny przegląd CLI pozostaje obowiązkowy dla zachowań poza zatwierdzonymi przypadkami, dla reprodukcji zgłoszeń i dla nowych konstrukcji przed dopisaniem przypadków.

Przy ręcznym przeglądzie zapisz dokładne zdanie źródłowe, kierunek, oczekiwany sens CORE, rzeczywiste zdanie lub odmowę, alternatywy, diagnostykę, kod wyjścia, komendę i SHA. Sprawdź role, referenty, czas, aspekt, liczbę i negację na podstawie wyniku `--json`; zgodność samego tekstu nie wystarcza.
