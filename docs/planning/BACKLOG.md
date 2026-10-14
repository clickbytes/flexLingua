# flexLingua — MASTER BACKLOG: epiki i zadania

## Stan walidacji w aktywnym repo

Bazowy `clickbytes/main` SHA `d355d877ae56cc159612ec0280810f0040d5d360` jest **GREEN** w [GitHub Actions #38635488680](https://github.com/clickbytes/flexLingua/actions/runs/38635488680): wszystkie trzy jobs przeszły po merge PR #91. PR #89 wycofał standalone HTML i zamknął GUI #1; PR #90 ukończył PERS-03, a PR #91 ukończył PERS-04. UI działa przez loopback HTTP. Każdy nowy commit wymaga własnego runu CI.


**Aktywne repo:** [clickbytes/flexLingua](https://github.com/clickbytes/flexLingua). **Baza planowania:** `d355d877ae56cc159612ec0280810f0040d5d360` (2026-10-14).
To jest otwarty plan — żadne poniższe zadanie nie jest przez samo zgłoszenie wykonane.

**Razem:** 14 epików · 67 zadań · P0 23, P1 21, P2 9, P3 14. GUI-01 (#1) jest zamknięte po wycofaniu standalone i potwierdzeniu testów Studio.

[Mapa ID→issue](ISSUE_MAP.json) · [Manifest najbliższych](backlog-near.json) · [Manifest dalszych](backlog-future.json) · [Issue Policy](ISSUE_POLICY.md) · [Kolejność prac](EXECUTION_ORDER.md) · [Kotwice kodu](IMPLEMENTATION_ANCHORS.md).

## Epiki

| Epic | Link | P | Tasków | Właściciel obszaru |
| --- | --- | --- | ---: | --- |
| REL: CI, jakość wydania i zarządzanie zmianą | [#4](https://github.com/clickbytes/flexLingua/issues/4) | P0 | 4 | CORE/Platform |
| VAL: A1 — zakres, pomiar jakości i niezależne gold | [#5](https://github.com/clickbytes/flexLingua/issues/5) | P0 | 5 | CORE/QA |
| PERS: A1 — 1./2. osoba, deiksa i uzgodnienie podmiotu | [#6](https://github.com/clickbytes/flexLingua/issues/6) | P0 | 6 | CORE/PL/EN |
| STATE: A1 — być/mieć, stan, tożsamość i posiadanie | [#7](https://github.com/clickbytes/flexLingua/issues/7) | P0 | 4 | CORE/PL/EN |
| SPACE: A1 — miejsce, kierunek, liczby i czas | [#8](https://github.com/clickbytes/flexLingua/issues/8) | P1 | 6 | CORE/PL/EN |
| LEX: A1 — słownictwo, sensy, morfologia i pochodzenie | [#9](https://github.com/clickbytes/flexLingua/issues/9) | P1 | 5 | CORE/Data/PL/EN |
| GRAM: A1 — spójność składni i warunków znaczeniowych | [#10](https://github.com/clickbytes/flexLingua/issues/10) | P1 | 5 | CORE/PL/EN |
| DIAL: Conversation Engine MVP — dialog kontrolowany bez LLM | [#11](https://github.com/clickbytes/flexLingua/issues/11) | P1 | 5 | CORE/Conversation |
| MEM: Personality, pamięć i bezpieczne akcje offline | [#12](https://github.com/clickbytes/flexLingua/issues/12) | P2 | 5 | CORE/Agents |
| A2: A2 — codzienne sytuacje i szersza gramatyka | [#13](https://github.com/clickbytes/flexLingua/issues/13) | P2 | 4 | CORE/PL/EN |
| B1B2: B1–B2 — narracja, składnia złożona i semantyka | [#14](https://github.com/clickbytes/flexLingua/issues/14) | P3 | 6 | CORE/PL/EN |
| ADV: C1–C2 — rejestr, parafraza i pragmatyka | [#15](https://github.com/clickbytes/flexLingua/issues/15) | P3 | 4 | CORE/Research |
| MULTI: Wielojęzyczne adaptery i źródła wiedzy | [#16](https://github.com/clickbytes/flexLingua/issues/16) | P3 | 4 | CORE/Research |
| GUI: Studio, słownik, dialog i stabilność dostępności | [#17](https://github.com/clickbytes/flexLingua/issues/17) | P0 | 4 | GUI |

## Szczegółowe zadania i zależności

### REL — [#4](https://github.com/clickbytes/flexLingua/issues/4)

Ustabilizować rzetelną publikację Node/CORE i offline, bez maskowania błędów GUI.

- [ ] **REL-01 [#18](https://github.com/clickbytes/flexLingua/issues/18)** — Utrwalić bazę błędów CI i kolejność ich domykania. P: P0; blokuje: ready / brak formalnych blockerów. AC: 3; pliki: 4.
- [ ] **REL-02 [#19](https://github.com/clickbytes/flexLingua/issues/19)** — Skonfigurować egzekwowanie statusów PR oraz politykę merge. P: P0; blokuje: REL-01 [#18](https://github.com/clickbytes/flexLingua/issues/18). AC: 3; pliki: 3.
- [ ] **REL-03 [#20](https://github.com/clickbytes/flexLingua/issues/20)** — Deterministyczna procedura wydania i wersjonowania. P: P0; blokuje: REL-02 [#19](https://github.com/clickbytes/flexLingua/issues/19). AC: 3; pliki: 5.
- [ ] **REL-04 [#21](https://github.com/clickbytes/flexLingua/issues/21)** — Granice zasobów, bezpieczeństwo wejścia i odporność regresji. P: P0; blokuje: REL-01 [#18](https://github.com/clickbytes/flexLingua/issues/18). AC: 3; pliki: 5.

### VAL — [#5](https://github.com/clickbytes/flexLingua/issues/5)

Zastąpić pozorne procenty rzetelnym, wersjonowanym zbiorem wymagań i wynikami dwóch kierunków.

- [ ] **VAL-01 [#22](https://github.com/clickbytes/flexLingua/issues/22)** — Zamrozić specyfikację docelowego A1 i jednostkę pokrycia. P: P0; blokuje: VAL-05 [#26](https://github.com/clickbytes/flexLingua/issues/26). AC: 3; pliki: 4.
- [ ] **VAL-02 [#23](https://github.com/clickbytes/flexLingua/issues/23)** — Utworzyć prawdziwy zamrożony held-out A1 PL↔EN. P: P0; blokuje: VAL-01 [#22](https://github.com/clickbytes/flexLingua/issues/22); PERS-06 [#32](https://github.com/clickbytes/flexLingua/issues/32); STATE-04 [#36](https://github.com/clickbytes/flexLingua/issues/36). AC: 3; pliki: 4.
- [ ] **VAL-03 [#24](https://github.com/clickbytes/flexLingua/issues/24)** — Połączyć katalog i wykonanie benchmarków bez zawyżania metryk. P: P0; blokuje: VAL-01 [#22](https://github.com/clickbytes/flexLingua/issues/22); VAL-02 [#23](https://github.com/clickbytes/flexLingua/issues/23). AC: 3; pliki: 4.
- [ ] **VAL-04 [#25](https://github.com/clickbytes/flexLingua/issues/25)** — Testy metamorficzne, wieloznaczność i odporność na złe wejście. P: P0; blokuje: VAL-01 [#22](https://github.com/clickbytes/flexLingua/issues/22). AC: 3; pliki: 4.
- [ ] **VAL-05 [#26](https://github.com/clickbytes/flexLingua/issues/26)** — Rejestr pochodzenia leksyki, licencji i danych ewaluacji. P: P0; blokuje: ready / brak formalnych blockerów. AC: 3; pliki: 5.

### PERS — [#6](https://github.com/clickbytes/flexLingua/issues/6)

Wprowadzić neutralną rolę mówcy/adresata i rzeczywistą odmianę ja/ty/my/wy ↔ I/you/we bez zgadywania rodzaju.

- [x] **PERS-01 [#27](https://github.com/clickbytes/flexLingua/issues/27)** — ADR: tożsamość mówcy/adresata i reprezentacja person w CORE. P: P0; VAL-01 [#22](https://github.com/clickbytes/flexLingua/issues/22) scalone; decyzja w [ADR](../adr/person-deixis.md). PERS-02 wdraża podstawowy kontrakt; PERS-03..06 rozszerzają zgodę, fleksję i gold; AC: 3; pliki: 5.
- [x] **PERS-02 [#28](https://github.com/clickbytes/flexLingua/issues/28)** — PL/EN jawne zaimki ja/ty/my/wy oraz I/you/we. P: P0; implementacja, gold i testy scalone w [PR #89](https://github.com/clickbytes/flexLingua/pull/89), commit `21ac04f`; Actions #38631654117 green. PERS-01 [#27](https://github.com/clickbytes/flexLingua/issues/27) spełnione. AC: 3; pliki: 5.
- [x] **PERS-03 [#29](https://github.com/clickbytes/flexLingua/issues/29)** — Uzgodnienie osoby w parserze i realizatorze zdań. P: P0; scalone w [PR #90](https://github.com/clickbytes/flexLingua/pull/90), merge SHA `4c554ca`; Actions #38633750354 green. AC: 3; pliki: 6.
- [x] **PERS-04 [#30](https://github.com/clickbytes/flexLingua/issues/30)** — Polska fleksja czasowników: 1./2. osoba teraźniejsza i bezpieczny przeszły. P: P0; scalone w [PR #91](https://github.com/clickbytes/flexLingua/pull/91), SHA `d355d87`; Actions #38635488680 green. AC: 3; pliki: 6.
- [ ] **PERS-05 [#31](https://github.com/clickbytes/flexLingua/issues/31)** — Angielska odmiana I/you/we, auxiliary do/does i pytania. P: P0; IN PROGRESS na `core/p0-pers05-english-agreement`; zależności PERS-03 [#29](https://github.com/clickbytes/flexLingua/issues/29) i PERS-04 [#30](https://github.com/clickbytes/flexLingua/issues/30) spełnione. AC: 3; pliki: 16.
- [ ] **PERS-06 [#32](https://github.com/clickbytes/flexLingua/issues/32)** — Niezależny gold 1./2. osoby i deiksy; punkt integracji dialogu. P: P0; blokuje: PERS-02 [#28](https://github.com/clickbytes/flexLingua/issues/28); PERS-04 [#30](https://github.com/clickbytes/flexLingua/issues/30); PERS-05 [#31](https://github.com/clickbytes/flexLingua/issues/31). AC: 3; pliki: 4.

### STATE — [#7](https://github.com/clickbytes/flexLingua/issues/7)

Rozróżnić w INTER orzeczenie o stanie od posiadania i tożsamości, z nieregularną fleksją obu języków.

- [ ] **STATE-01 [#33](https://github.com/clickbytes/flexLingua/issues/33)** — ADR i CORE: predykacja, identyczność, posiadanie. P: P0; blokuje: PERS-01 [#27](https://github.com/clickbytes/flexLingua/issues/27). AC: 3; pliki: 4.
- [ ] **STATE-02 [#34](https://github.com/clickbytes/flexLingua/issues/34)** — PL: być/mieć, fleksja i kontrolowane ramy. P: P0; blokuje: STATE-01 [#33](https://github.com/clickbytes/flexLingua/issues/33); PERS-04 [#30](https://github.com/clickbytes/flexLingua/issues/30). AC: 3; pliki: 5.
- [ ] **STATE-03 [#35](https://github.com/clickbytes/flexLingua/issues/35)** — EN: be/have jako predykaty vs auxiliaries. P: P0; blokuje: STATE-01 [#33](https://github.com/clickbytes/flexLingua/issues/33); PERS-05 [#31](https://github.com/clickbytes/flexLingua/issues/31). AC: 3; pliki: 5.
- [ ] **STATE-04 [#36](https://github.com/clickbytes/flexLingua/issues/36)** — Gold PL↔CORE↔EN dla być/mieć i stanów. P: P0; blokuje: STATE-02 [#34](https://github.com/clickbytes/flexLingua/issues/34); STATE-03 [#35](https://github.com/clickbytes/flexLingua/issues/35). AC: 3; pliki: 4.

### SPACE — [#8](https://github.com/clickbytes/flexLingua/issues/8)

Dodać podstawowe okoliczniki miejsca/kierunku/czasu, których obecna rama ruchu `event.movement` nie przechowuje.

- [ ] **SPACE-01 [#37](https://github.com/clickbytes/flexLingua/issues/37)** — CORE: miejsce vs cel ruchu — typowane role. P: P1; blokuje: PERS-03 [#29](https://github.com/clickbytes/flexLingua/issues/29). AC: 3; pliki: 5.
- [ ] **SPACE-02 [#38](https://github.com/clickbytes/flexLingua/issues/38)** — PL/EN: przyimki kierunku i miejsca, przypadki. P: P1; blokuje: SPACE-01 [#37](https://github.com/clickbytes/flexLingua/issues/37); STATE-02 [#34](https://github.com/clickbytes/flexLingua/issues/34). AC: 3; pliki: 5.
- [ ] **SPACE-03 [#39](https://github.com/clickbytes/flexLingua/issues/39)** — WH: gdzie, dokąd, skąd; where/to where. P: P1; blokuje: SPACE-01 [#37](https://github.com/clickbytes/flexLingua/issues/37); SPACE-02 [#38](https://github.com/clickbytes/flexLingua/issues/38). AC: 3; pliki: 5.
- [ ] **SPACE-04 [#40](https://github.com/clickbytes/flexLingua/issues/40)** — Czas zdarzenia vs określenia dziś/jutro/wczoraj. P: P1; blokuje: STATE-01 [#33](https://github.com/clickbytes/flexLingua/issues/33). AC: 3; pliki: 5.
- [ ] **SPACE-05 [#41](https://github.com/clickbytes/flexLingua/issues/41)** — Liczebniki, ilości, godziny i proste daty A1. P: P1; blokuje: SPACE-04 [#40](https://github.com/clickbytes/flexLingua/issues/40). AC: 3; pliki: 5.
- [ ] **SPACE-06 [#42](https://github.com/clickbytes/flexLingua/issues/42)** — Oddzielny gold przestrzenno-czasowy w PL/EN. P: P1; blokuje: SPACE-02 [#38](https://github.com/clickbytes/flexLingua/issues/38); SPACE-03 [#39](https://github.com/clickbytes/flexLingua/issues/39); SPACE-04 [#40](https://github.com/clickbytes/flexLingua/issues/40); SPACE-05 [#41](https://github.com/clickbytes/flexLingua/issues/41). AC: 3; pliki: 3.

### LEX — [#9](https://github.com/clickbytes/flexLingua/issues/9)

Poszerzyć autorski leksem/sens CORE w obu językach, bez dodawania zapamiętanych par zdań.

- [ ] **LEX-01 [#43](https://github.com/clickbytes/flexLingua/issues/43)** — Rodzina, ludzie, miejsca i przedmioty — kontrolowana partia danych. P: P1; blokuje: VAL-05 [#26](https://github.com/clickbytes/flexLingua/issues/26). AC: 3; pliki: 5.
- [ ] **LEX-02 [#44](https://github.com/clickbytes/flexLingua/issues/44)** — Jedzenie, zakupy i codzienne obiekty A1. P: P1; blokuje: VAL-05 [#26](https://github.com/clickbytes/flexLingua/issues/26); LEX-01 [#43](https://github.com/clickbytes/flexLingua/issues/43). AC: 3; pliki: 5.
- [ ] **LEX-03 [#45](https://github.com/clickbytes/flexLingua/issues/45)** — Czasowniki codzienne z walencją i osobnymi sensami. P: P1; blokuje: LEX-01 [#43](https://github.com/clickbytes/flexLingua/issues/43); PERS-03 [#29](https://github.com/clickbytes/flexLingua/issues/29). AC: 3; pliki: 5.
- [ ] **LEX-04 [#46](https://github.com/clickbytes/flexLingua/issues/46)** — Wyjątki morfologiczne i inne klasy odmiany PL/EN. P: P1; blokuje: LEX-01 [#43](https://github.com/clickbytes/flexLingua/issues/43); LEX-03 [#45](https://github.com/clickbytes/flexLingua/issues/45). AC: 3; pliki: 5.
- [ ] **LEX-05 [#47](https://github.com/clickbytes/flexLingua/issues/47)** — Polisemia, homonimia i kontrolowana odmowa zamiast zgadywania. P: P1; blokuje: VAL-05 [#26](https://github.com/clickbytes/flexLingua/issues/26). AC: 3; pliki: 5.

### GRAM — [#10](https://github.com/clickbytes/flexLingua/issues/10)

Doprowadzić do kompozycyjności przypadków, pytań, negacji, opisów i kontrolowanych prostych wypowiedzi.

- [ ] **GRAM-01 [#48](https://github.com/clickbytes/flexLingua/issues/48)** — Zaimki osobowe w przypadkach i dzierżawczość A1. P: P1; blokuje: PERS-06 [#32](https://github.com/clickbytes/flexLingua/issues/32). AC: 3; pliki: 5.
- [ ] **GRAM-02 [#49](https://github.com/clickbytes/flexLingua/issues/49)** — Przymiotniki: zgodność PL (rodzaj/przypadek/liczba) i EN. P: P1; blokuje: STATE-01 [#33](https://github.com/clickbytes/flexLingua/issues/33); LEX-04 [#46](https://github.com/clickbytes/flexLingua/issues/46). AC: 3; pliki: 5.
- [ ] **GRAM-03 [#50](https://github.com/clickbytes/flexLingua/issues/50)** — Negacja, rząd przypadków i zakres operatorów PL/EN. P: P1; blokuje: STATE-02 [#34](https://github.com/clickbytes/flexLingua/issues/34); PERS-05 [#31](https://github.com/clickbytes/flexLingua/issues/31). AC: 3; pliki: 5.
- [ ] **GRAM-04 [#51](https://github.com/clickbytes/flexLingua/issues/51)** — Pytania i prośby: yes/no, WH, wybrane imperatywy. P: P1; blokuje: PERS-06 [#32](https://github.com/clickbytes/flexLingua/issues/32); SPACE-03 [#39](https://github.com/clickbytes/flexLingua/issues/39). AC: 3; pliki: 5.
- [ ] **GRAM-05 [#52](https://github.com/clickbytes/flexLingua/issues/52)** — Odbiór A1: mieszane zdania/anafory i limitowanie parsera. P: P1; blokuje: GRAM-01 [#48](https://github.com/clickbytes/flexLingua/issues/48); GRAM-02 [#49](https://github.com/clickbytes/flexLingua/issues/49); GRAM-03 [#50](https://github.com/clickbytes/flexLingua/issues/50); GRAM-04 [#51](https://github.com/clickbytes/flexLingua/issues/51). AC: 3; pliki: 4.

### DIAL — [#11](https://github.com/clickbytes/flexLingua/issues/11)

Umożliwić prostą odpowiedź na pytania i kontynuację rozmowy PL/EN w granicach CORE.

- [ ] **DIAL-01 [#53](https://github.com/clickbytes/flexLingua/issues/53)** — Schema dialog acts (assert, ask, answer, confirm, clarify, refuse). P: P1; blokuje: PERS-01 [#27](https://github.com/clickbytes/flexLingua/issues/27); STATE-01 [#33](https://github.com/clickbytes/flexLingua/issues/33). AC: 3; pliki: 4.
- [ ] **DIAL-02 [#54](https://github.com/clickbytes/flexLingua/issues/54)** — Session context: speaker, addressee, focus, unresolved questions. P: P1; blokuje: PERS-06 [#32](https://github.com/clickbytes/flexLingua/issues/32); DIAL-01 [#53](https://github.com/clickbytes/flexLingua/issues/53). AC: 3; pliki: 4.
- [ ] **DIAL-03 [#55](https://github.com/clickbytes/flexLingua/issues/55)** — Regułowy Response Planner CORE→CORE. P: P1; blokuje: DIAL-01 [#53](https://github.com/clickbytes/flexLingua/issues/53); DIAL-02 [#54](https://github.com/clickbytes/flexLingua/issues/54). AC: 3; pliki: 4.
- [ ] **DIAL-04 [#56](https://github.com/clickbytes/flexLingua/issues/56)** — Conversation Engine API: wieloturowe tłumaczenie, odpowiedzi i błędy. P: P1; blokuje: DIAL-02 [#54](https://github.com/clickbytes/flexLingua/issues/54); DIAL-03 [#55](https://github.com/clickbytes/flexLingua/issues/55). AC: 3; pliki: 4.
- [ ] **DIAL-05 [#57](https://github.com/clickbytes/flexLingua/issues/57)** — Gold 20+ dwujęzycznych rozmów A1 i regresje bez halucynacji. P: P1; blokuje: DIAL-04 [#56](https://github.com/clickbytes/flexLingua/issues/56); GRAM-05 [#52](https://github.com/clickbytes/flexLingua/issues/52). AC: 3; pliki: 3.

### MEM — [#12](https://github.com/clickbytes/flexLingua/issues/12)

Wdrożyć deklaratywną osobowość i sterowaną przez użytkownika pamięć, nie zmieniając prawdziwości znaczenia CORE.

- [ ] **MEM-01 [#58](https://github.com/clickbytes/flexLingua/issues/58)** — Schemat deklaratywnego Personality Profile. P: P2; blokuje: DIAL-03 [#55](https://github.com/clickbytes/flexLingua/issues/55). AC: 3; pliki: 4.
- [ ] **MEM-02 [#59](https://github.com/clickbytes/flexLingua/issues/59)** — Niezależne PL/EN reguły stylistycznej realizacji odpowiedzi. P: P2; blokuje: MEM-01 [#58](https://github.com/clickbytes/flexLingua/issues/58); DIAL-04 [#56](https://github.com/clickbytes/flexLingua/issues/56). AC: 3; pliki: 5.
- [ ] **MEM-03 [#60](https://github.com/clickbytes/flexLingua/issues/60)** — Pamięć sesyjna: fakty, korekta i źródło wypowiedzi. P: P2; blokuje: DIAL-02 [#54](https://github.com/clickbytes/flexLingua/issues/54). AC: 3; pliki: 4.
- [ ] **MEM-04 [#61](https://github.com/clickbytes/flexLingua/issues/61)** — Opcjonalna trwałość pamięci, import/eksport i usuwanie. P: P2; blokuje: MEM-03 [#60](https://github.com/clickbytes/flexLingua/issues/60). AC: 3; pliki: 4.
- [ ] **MEM-05 [#62](https://github.com/clickbytes/flexLingua/issues/62)** — Registry kontrolowanych akcji i skryptów lokalnych. P: P2; blokuje: DIAL-04 [#56](https://github.com/clickbytes/flexLingua/issues/56); REL-04 [#21](https://github.com/clickbytes/flexLingua/issues/21). AC: 3; pliki: 4.

### A2 — [#13](https://github.com/clickbytes/flexLingua/issues/13)

Rozszerzyć kontrolowany zakres A1 o preferencje, bardziej użyteczne czasy i dialogi sytuacyjne.

- [ ] **A2-01 [#63](https://github.com/clickbytes/flexLingua/issues/63)** — Model zdarzeń przyszłych, aspektu i planów. P: P2; blokuje: STATE-04 [#36](https://github.com/clickbytes/flexLingua/issues/36); SPACE-04 [#40](https://github.com/clickbytes/flexLingua/issues/40). AC: 3; pliki: 5.
- [ ] **A2-02 [#64](https://github.com/clickbytes/flexLingua/issues/64)** — Stopniowanie, preferencje i prośby. P: P2; blokuje: STATE-01 [#33](https://github.com/clickbytes/flexLingua/issues/33); DIAL-01 [#53](https://github.com/clickbytes/flexLingua/issues/53). AC: 3; pliki: 5.
- [ ] **A2-03 [#65](https://github.com/clickbytes/flexLingua/issues/65)** — Domeny usługowe A2: zakupy, podróże, trasa. P: P2; blokuje: A2-02 [#64](https://github.com/clickbytes/flexLingua/issues/64); SPACE-05 [#41](https://github.com/clickbytes/flexLingua/issues/41). AC: 3; pliki: 5.
- [ ] **A2-04 [#66](https://github.com/clickbytes/flexLingua/issues/66)** — Gold A2 i bramka jakości bez certyfikacji CEFR. P: P2; blokuje: A2-01 [#63](https://github.com/clickbytes/flexLingua/issues/63); A2-02 [#64](https://github.com/clickbytes/flexLingua/issues/64); A2-03 [#65](https://github.com/clickbytes/flexLingua/issues/65); VAL-03 [#24](https://github.com/clickbytes/flexLingua/issues/24). AC: 3; pliki: 4.

### B1B2 — [#14](https://github.com/clickbytes/flexLingua/issues/14)

Rozszerzyć INTER o jawne relacje między zdarzeniami, stronę bierną, warunkowość, spójność dyskursu.

- [ ] **B1B2-01 [#67](https://github.com/clickbytes/flexLingua/issues/67)** — B1: relacje wydarzeń, następstwo i przyczynowość. P: P3; blokuje: DIAL-02 [#54](https://github.com/clickbytes/flexLingua/issues/54). AC: 3; pliki: 4.
- [ ] **B1B2-02 [#68](https://github.com/clickbytes/flexLingua/issues/68)** — B1: typowane zdania podrzędne i dłuższe wypowiedzi. P: P3; blokuje: B1B2-01 [#67](https://github.com/clickbytes/flexLingua/issues/67). AC: 3; pliki: 5.
- [ ] **B1B2-03 [#69](https://github.com/clickbytes/flexLingua/issues/69)** — B1: dyskurs, wieloznaczność i kontrola koreferencji. P: P3; blokuje: B1B2-01 [#67](https://github.com/clickbytes/flexLingua/issues/67); MEM-03 [#60](https://github.com/clickbytes/flexLingua/issues/60). AC: 3; pliki: 4.
- [ ] **B1B2-04 [#70](https://github.com/clickbytes/flexLingua/issues/70)** — B2: strona bierna i transformacje ról. P: P3; blokuje: B1B2-02 [#68](https://github.com/clickbytes/flexLingua/issues/68); A2-01 [#63](https://github.com/clickbytes/flexLingua/issues/63). AC: 3; pliki: 5.
- [ ] **B1B2-05 [#71](https://github.com/clickbytes/flexLingua/issues/71)** — B2: warunki realne/hipotetyczne i scope operators. P: P3; blokuje: B1B2-04 [#70](https://github.com/clickbytes/flexLingua/issues/70). AC: 3; pliki: 4.
- [ ] **B1B2-06 [#72](https://github.com/clickbytes/flexLingua/issues/72)** — Oddzielne benchmarki B1 i B2: semantyka, idiomy, pasywa. P: P3; blokuje: B1B2-01 [#67](https://github.com/clickbytes/flexLingua/issues/67); B1B2-02 [#68](https://github.com/clickbytes/flexLingua/issues/68); B1B2-03 [#69](https://github.com/clickbytes/flexLingua/issues/69); B1B2-04 [#70](https://github.com/clickbytes/flexLingua/issues/70); B1B2-05 [#71](https://github.com/clickbytes/flexLingua/issues/71). AC: 3; pliki: 4.

### ADV — [#15](https://github.com/clickbytes/flexLingua/issues/15)

Rozwinąć semantykę do bardzo złożonej frazeologii i rejestrów, tylko po zatwierdzonym A1/B1/B2.

- [ ] **ADV-01 [#73](https://github.com/clickbytes/flexLingua/issues/73)** — C1: zaawansowane sensy i rejestry formalne/nieformalne. P: P3; blokuje: B1B2-06 [#72](https://github.com/clickbytes/flexLingua/issues/72); VAL-05 [#26](https://github.com/clickbytes/flexLingua/issues/26). AC: 3; pliki: 5.
- [ ] **ADV-02 [#74](https://github.com/clickbytes/flexLingua/issues/74)** — C1: parafraza, struktura informacji i argumentacja. P: P3; blokuje: ADV-01 [#73](https://github.com/clickbytes/flexLingua/issues/73). AC: 3; pliki: 4.
- [ ] **ADV-03 [#75](https://github.com/clickbytes/flexLingua/issues/75)** — C2: metafora, idiomy, pragmatyka i granice wiedzy. P: P3; blokuje: ADV-02 [#74](https://github.com/clickbytes/flexLingua/issues/74). AC: 3; pliki: 4.
- [ ] **ADV-04 [#76](https://github.com/clickbytes/flexLingua/issues/76)** — C1/C2: odrębny benchmark jakości i ograniczeń. P: P3; blokuje: ADV-01 [#73](https://github.com/clickbytes/flexLingua/issues/73); ADV-02 [#74](https://github.com/clickbytes/flexLingua/issues/74); ADV-03 [#75](https://github.com/clickbytes/flexLingua/issues/75). AC: 3; pliki: 4.

### MULTI — [#16](https://github.com/clickbytes/flexLingua/issues/16)

Przygotować dodawanie N języków przez INTER bez par sztywnych tłumaczeń i rozszerzać wiedzę z legalnych źródeł.

- [ ] **MULTI-01 [#77](https://github.com/clickbytes/flexLingua/issues/77)** — Kontrakt N-language adapters (analysis/realization/morphology). P: P3; blokuje: REL-04 [#21](https://github.com/clickbytes/flexLingua/issues/21). AC: 3; pliki: 5.
- [ ] **MULTI-02 [#78](https://github.com/clickbytes/flexLingua/issues/78)** — Audyt istniejącego tureckiego adaptera i luki danych. P: P3; blokuje: MULTI-01 [#77](https://github.com/clickbytes/flexLingua/issues/77). AC: 3; pliki: 5.
- [ ] **MULTI-03 [#79](https://github.com/clickbytes/flexLingua/issues/79)** — Trzeci język docelowy: licencje, plugin i gold. P: P3; blokuje: MULTI-01 [#77](https://github.com/clickbytes/flexLingua/issues/77); MULTI-02 [#78](https://github.com/clickbytes/flexLingua/issues/78). AC: 3; pliki: 4.
- [ ] **MULTI-04 [#80](https://github.com/clickbytes/flexLingua/issues/80)** — Knowledge graph z pochodzeniem (Wikidata/Wikipedia) — research spike. P: P3; blokuje: VAL-05 [#26](https://github.com/clickbytes/flexLingua/issues/26); MEM-03 [#60](https://github.com/clickbytes/flexLingua/issues/60). AC: 3; pliki: 4.

### GUI — [#17](https://github.com/clickbytes/flexLingua/issues/17)

Rozwijać Studio, słownik, INTER Explorer i ekran rozmowy. Aplikację uruchamia się przez lokalny HTTP; nie utrzymujemy standalone HTML.

- [x] **GUI-01 [#1](https://github.com/clickbytes/flexLingua/issues/1)** — Wycofano standalone HTML w [PR #89](https://github.com/clickbytes/flexLingua/pull/89); Studio i release gate są zielone w Actions #38631654117.
- [ ] **GUI-02 [#81](https://github.com/clickbytes/flexLingua/issues/81)** — Zakładka słownika: osoba, morfologia i weryfikowalne błędy. P: P0; blokuje: PERS-04 [#30](https://github.com/clickbytes/flexLingua/issues/30). AC: 3; pliki: 4.
- [ ] **GUI-03 [#83](https://github.com/clickbytes/flexLingua/issues/83)** — INTER Explorer: role, modal scope, ambiguity i source diagnostics. P: P0; blokuje: VAL-03 [#24](https://github.com/clickbytes/flexLingua/issues/24). AC: 3; pliki: 4.
- [ ] **GUI-04 [#82](https://github.com/clickbytes/flexLingua/issues/82)** — Ekran rozmowy i osobowości z dostępnością. P: P0; blokuje: DIAL-04 [#56](https://github.com/clickbytes/flexLingua/issues/56); MEM-01 [#58](https://github.com/clickbytes/flexLingua/issues/58). AC: 3; pliki: 5.

## Zarządzanie i akceptacja

- Każde issue TASK ma minimum 3 mierzalne AC, operacje per plik, owner, dowody testowe i zależności numerowane GitHub.
- EPIC zawiera checklistę tych samych numerów i jest otwarty do ukończenia wszystkich kryteriów, nie tylko do napisania kodu.
- Preferowana ścieżka: kod CORE na małej gałęzi → gold PL/EN, testy negatywne → realne Actions run/SHA → README/docs, jeśli wymagane → PR z wynikami i statusem → merge.
- Obszar GUI: `js/ui/**`, `index.html`, `tests/studio-ui.test.js`. UI działa przez loopback HTTP; nie ma standalone bundle ani testu parytetu offline.
- Najnowszy pełny release gate na main jest zielony w Actions #38635488680. Historyczne 398/401 dotyczy awarii sprzed PR #84, nie bieżącego statusu.
- Zadania A1–C2 nie certyfikują poziomu CEFR bez zaakceptowanego reprezentatywnego benchmarku. Oxford tylko z respektowaniem licencji.
- Native sub-issues, custom labels i milestones nie były tworzone: konektor nie udostępnia ich konfiguracji; hierarchię utrzymują checklisty i mapa numerów.
