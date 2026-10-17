# Lokalna zgodność pakietów językowych

`tests/fixtures/generic-language-conformance.json` jest małą, statyczną macierzą zdań, odmów, CORE i form morfologicznych. Expected są autorowane niezależnie od silnika. Zmiana expected wymaga ręcznego sprawdzenia znaczenia oraz uzasadnienia w przeglądzie.

Uruchom raport maszynowy:

```powershell
node tools/review-sentences.mjs --input tests/fixtures/generic-language-conformance.json --report
```

Raport zawiera identyfikator i status każdego przypadku, SHA-256 fixture, SHA repozytorium (`repositoryHead`) oraz informację, czy drzewo robocze było czyste. Liczniki `totals` dotyczą wyłącznie wykonanych przypadków. Status pakietu/capability `unsupported` oznacza brak deklarowanej obsługi, a `not-run` brak przypadku dla zadeklarowanej obsługi. Żaden z tych statusów nie jest zaliczonym przypadkiem. Główny `pass` oznacza tylko, że wykonane przypadki zgadzają się ze statycznym oracle; nie jest wynikiem CEFR ani oceną pełnej jakości języka.

Po zmianie składni, morfologii lub CORE uruchom lokalny pakiet właściwych regresji:

```powershell
npm run check:language-conformance
```

Pakiet łączy macierz z regresjami istniejących kontraktów: toy case systems 0/2/10, adapterów, Unicode, dyskursu i czasu, zgody, włoskiego oraz tureckiego. Nie uruchamia się automatycznie przy commit/push i nie należy do `check:release`.

Na koniec przeczytaj każde zmienione zdanie i porównaj role, liczbę, przypadek, czas, aspekt, polaryzację oraz zachowany sens. `match` i `pass` sprawdzają zapisany kontrakt, a nie naturalność ani poprawność każdej możliwej wypowiedzi.
