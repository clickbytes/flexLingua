# Uruchomienie flexLingua lokalnie

Interfejs wymaga lokalnego serwera HTTP, ponieważ przeglądarki blokują ładowanie modułów ES i plików JSON przy otwieraniu `index.html` przez `file://`. Sam silnik nie wymaga zewnętrznych usług.

## Windows

Uruchom `start.bat` w katalogu projektu. Skrypt uruchomi serwer na loopback, preferując Node.js, a następnie Pythona. Zostaw otwarte okno konsoli; zamknięcie go zatrzymuje serwer.

## Ręczne uruchomienie

Z Node.js:

```powershell
npm run dev
```

Z Pythonem:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Otwórz <http://127.0.0.1:8000/>. Jeżeli port 8000 jest zajęty, zatrzymaj poprzedni serwer albo ustaw port dla serwera Node.js, np. `$env:PORT=8001; npm run dev`.

## Testy po zmianie kodu

```powershell
npm test
npm run check:release
```

Nie otwieraj `index.html` bezpośrednio z dysku. W przeglądarce pojawi się wtedy informacja o wymaganym lokalnym serwerze. Nie wyłączaj zabezpieczeń CORS.

Prototyp obsługuje kontrolowany podzbiór polskiego i angielskiego; nierozpoznane zdania są jawnie odrzucane niezależnie od sposobu lokalnego uruchomienia.
