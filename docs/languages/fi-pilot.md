# Fiński: pilot kontrolowanego podzbioru

Pakiet `fi` demonstruje przenośność ogólnego CORE, morfologii i reguł gramatycznych. Nie jest pełną gramatyką fińską ani oceną CEFR. Deklaruje jeden typ rzeczownika `talo`, dziesięć wybranych przypadków, dwie liczby oraz jedną ramę `event.visual_attention` w czasie teraźniejszym.

| Przypadek | Pojedyncza | Mnoga |
| --- | --- | --- |
| nominative | talo | talot |
| genitive | talon | talojen |
| partitive | taloa | taloja |
| inessive | talossa | taloissa |
| elative | talosta | taloista |
| illative | taloon | taloihin |
| adessive | talolla | taloilla |
| ablative | talolta | taloilta |
| allative | talolle | taloille |
| translative | taloksi | taloiksi |

Leksemy i klasa odmiany są przypisane do [Nykysuomen sanalista 2024 Kotus](https://kotus.fi/sanakirjat/kielitoimiston-sanakirja/nykysuomen-sana-aineistot/nykysuomen-sanalista/), opublikowanego na licencji CC BY 4.0. Formy tabeli zapisano statycznie i sprawdzono z niezależnymi opisami fińskiej morfologii: [Omorfi](https://github.com/flammie/omorfi) oraz [GiellaLT lang-fin](https://giellalt.github.io/lang-fin/fin.html). Nie dołączamy ich kodu, modelu ani słowników.

Zdania pilota obejmują tylko `event.visual_attention` z podmiotem w nominative i dopełnieniem w partitive, w present, dla liczby pojedynczej i mnogiej. Fiński nie ma rodzajników, więc przekład może utracić angielskie rozróżnienie `a/the`; goldy zapisują tę kontrolowaną utratę jawnie. Odmowy dla innych przypadków w tej ramie, niezgody i czasu przeszłego pozostają częścią fixture.

Uruchom macierz i regresje lokalnie:

```powershell
node tools/review-sentences.mjs --input tests/fixtures/gold-fi-pilot.json --report
npm run check:language-conformance
```
