# Manual CLI sentence examples

These commands are examples for human review, not an automated oracle. Inspect the JSON status, CORE meaning, roles, tense, aspect, polarity, information loss and diagnostics. The supported language packages cover bounded subsets.

## Package discovery

```sh
node tools/translate.mjs --languages
```

Expected: PL, EN, FI, TR, IT and AR are listed; TR declares `tr->en`, and AR is `morphology-only`.

## Successful translations

1. ```sh
   node tools/translate.mjs --from en --to pl --text "The girl sees the dog." --json
   ```
   Expected: `Dziewczynka widzi psa.` CORE is `event.visual_perception`; agent `person.girl`, theme `animal.dog`, present positive. Polish does not mark the two English definiteness values, reported as unavoidable information loss. Exit 0.

2. ```sh
   node tools/translate.mjs --from pl --to en --text "Dziewczynka widzi psa." --json
   ```
   Expected: `A girl sees a dog.` CORE is `event.visual_perception`; agent `person.girl`, theme `animal.dog`, present positive, imperfective. The source does not specify definiteness, so the output's display-policy choice is reported as ambiguous. Exit 0.

3. ```sh
   node tools/translate.mjs --from en --to pl --text "This is a simple book." --json
   ```
   Expected: `To jest prosta książka.` CORE is `state.classification`, with a demonstrative subject and category `object.book` modified by `quality.simple`. Exit 0.

4. ```sh
   node tools/translate.mjs --from pl --to en --text "To jest prosta książka." --json
   ```
   Expected: `This is a simple book.` CORE remains `state.classification`, with category `object.book` and modifier `quality.simple`. Category definiteness is unspecified and reported as ambiguous. Exit 0.

5. ```sh
   node tools/translate.mjs --from en --to fi --text "A girl looks at a house." --json
   ```
   Expected: `Tyttö katsoo taloa.` CORE is `event.visual_attention`; agent `person.girl`, theme `structure.house`, present positive. The Finnish output does not mark definiteness; both losses are reported. Exit 0.

6. ```sh
   node tools/translate.mjs --from fi --to en --text "Tyttö katsoo taloa." --json
   ```
   Expected: `A girl looks at a house.` CORE is `event.visual_attention`; agent `person.girl`, theme `structure.house`, present. The source does not specify definiteness, so both English determiner choices are reported as ambiguous. Exit 0.

7. ```sh
   node tools/translate.mjs --from tr --to en --text "Kız köpeği gördü." --json
   ```
   Expected: `A girl saw the dog.` CORE is `event.visual_perception`; agent `person.girl`, theme `animal.dog`, past positive. The agent definiteness choice is reported as ambiguous. Exit 0.

8. ```sh
   node tools/translate.mjs --from it --to en --text "La ragazza vede il cane." --json
   ```
   Expected: `The girl sees the dog.` CORE is `event.visual_perception`; agent `person.girl`, theme `animal.dog`, present positive; both roles are definite. Exit 0.

## Expected refusals

9. ```sh
   node tools/translate.mjs --from tr --to en --text "Kız köpeği gördü mü?" --json
   ```
   Expected: `unsupported`, null text/meaning, `PLUGIN_OPERATION_FAILED` because this Turkish package does not support questions; exit 2.

10. ```sh
    node tools/translate.mjs --from it --to en --text "La ragazza vede il cane?" --json
    ```
    Expected: `unsupported`, null text/meaning, `PLUGIN_OPERATION_FAILED` for the unsupported question construction; exit 2.

11. ```sh
    node tools/translate.mjs --from it --to en --text "La ragazza vide il cane." --json
    ```
    Expected: `unsupported`, null text/meaning, `PLUGIN_OPERATION_FAILED` because the Italian package does not declare this past construction; exit 2.

12. ```sh
    node tools/translate.mjs --from en --to it --text "The girl sees the dog." --json
    ```
    Expected: `unsupported`, null text/meaning, `PLUGIN_CAPABILITY_UNAVAILABLE`; only IT→EN is declared; exit 2.

13. ```sh
    node tools/translate.mjs --from en --to ar --text "The girl sees the dog." --json
    ```
    Expected: `unsupported`, null text/meaning, `PLUGIN_DIRECTION_UNAVAILABLE`; Arabic is morphology-only; exit 2.

14. ```sh
    node tools/translate.mjs --from ar --to en --text "الفتاة ترى الكلب." --json
    ```
    Expected: `unsupported`, null text/meaning, `PLUGIN_DIRECTION_UNAVAILABLE`; Arabic has no sentence translation direction; exit 2.

15. ```sh
    node tools/translate.mjs --from en --to pl --text "I is reading a book." --json
    ```
    Expected: `unsupported`, null text/meaning, `PLUGIN_OPERATION_FAILED` for subject–verb agreement; exit 2.
