# flexLingua v0.4 — uruchomienie lokalne na Windows

## Najprościej: dwa kliknięcia

1. W PowerShell/CMD wykonaj `git pull` w katalogu projektu.
2. Otwórz `index.html` dwukrotnym kliknięciem. Plik wykrywa `file://` i przechodzi do samodzielnej wersji `index-standalone.html`.
3. Jeżeli Twój podgląd HTML / rozszerzenie IDE blokuje przejście na lokalny plik, otwórz **bezpośrednio** `index-standalone.html` w normalnym oknie przeglądarki.

Plik `index-standalone.html` jest automatycznie generowany. Zawiera te same moduły JS i słowniki JSON, co wersja deweloperska. **Nie wymaga serwera, Node.js, Pythona ani dostępu do internetu**, ale wymaga współczesnej przeglądarki obsługującej `structuredClone`.

## Praca nad plikami JS/JSON

Uruchom **`start.bat`**. Jeśli masz Node.js, skrypt użyje go do wystartowania lokalnego serwera. W przeciwnym razie spróbuje Pythona. Bez obydwu narzędzi otworzy gotową wersję offline.

Możesz też uruchomić serwer ręcznie:

```powershell
cd D:\Git\flexLingua
npm run dev
# albo, gdy masz Python:
py -m http.server 8000 --bind 127.0.0.1
```

Otwórz **http://127.0.0.1:8000/**. W tym trybie `index.html` używa zewnętrznych ES Modules oraz pobiera słowniki przez HTTP.

Jeżeli port 8000 jest już zajęty, zatrzymaj istniejący serwer lub uruchom `set PORT=8001 && npm run dev` w CMD / `$env:PORT=8001; npm run dev` w PowerShell (tryb Node).

## Po edycji gramatyki lub słownika

```powershell
npm run build:standalone
npm run check:standalone
npm test
```

Zapisz do commita również zaktualizowany `index-standalone.html`. To plik wynikowy; **nie edytuj go ręcznie**. Bez regeneracji wersja offline będzie zawierała starsze reguły niż pliki JS/JSON.

## Co oznaczał błąd CORS?

Błąd `Access to script at 'file:///.../js/main.js' from origin 'null' has been blocked by CORS policy` pojawia się, gdy przeglądarka próbuje wczytać moduł ES bez serwera. Wyłączenie zabezpieczeń CORS nie jest potrzebne. Po zmianach w v0.4 otwarcie `index.html` z dysku automatycznie wybierze wersję offline.

Prototyp nadal obsługuje tylko kontrolowany podzbiór polskiego i angielskiego. Jeżeli konkretne zdanie jest nieobsługiwane, aplikacja pokazuje taki błąd niezależnie od sposobu uruchomienia.
