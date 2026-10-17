import {appendOperation, setFollowLatest, updateOperation} from '../state.js';

function nextValue(values, current, step) {
  if (!values.length) return current;
  const index = values.indexOf(current);
  return values[(index + step + values.length) % values.length];
}

function errorResult(message, diagnostics = []) {
  return {status: 'error', message: message ?? 'Forms service failed.', diagnostics};
}

export function createFormsView({runtime, formsService, state: modeState, workspaceState} = {}) {
  if (!runtime?.plugins || typeof formsService?.lookupLexemes !== 'function' ||
      typeof formsService?.analyzeForm !== 'function' ||
      typeof formsService?.morphology !== 'function' ||
      typeof formsService?.inspectParadigm !== 'function') {
    throw new Error('Forms view requires the application runtime and Forms service.');
  }

  const languages = runtime.plugins.list();
  const state = modeState ?? {draft: '', cursor: 0, status: '', settings: {},
    language: languages.includes('en') ? 'en' : languages[0] ?? null,
    result: null, matches: [], selectedIndex: 0, selectedEntryId: null, entries: []};
  state.settings ??= {};
  if (state.language === undefined) state.language = state.settings.language ??
    (languages.includes('en') ? 'en' : languages[0] ?? null);
  state.settings.language = state.language;
  state.result ??= null;
  state.matches ??= [];
  state.selectedIndex ??= 0;
  state.selectedEntryId ??= null;
  state.searchEntryId ??= null;
  state.entries ??= [];

  function focusTargets() {
    const items = [
      {id: 'query', type: 'input', label: 'Lemma or form'},
      {id: 'language', type: 'selector', label: 'Language'}
    ];
    if (state.result?.status === 'ambiguous' && state.matches.length > 1) {
      items.push({id: 'candidate', type: 'selector', label: 'Dictionary match'});
    }
    if (state.entries.length) items.push({id: 'details', type: 'action', label: 'Details'});
    return items;
  }

  function clearSearch() {
    state.result = null;
    state.matches = [];
    state.selectedIndex = 0;
    state.status = '';
    state.selectedEntryId = null;
    state.searchEntryId = null;
  }

  function addCandidate(matches, lexeme, analysis) {
    if (!lexeme || typeof lexeme.id !== 'string') return;
    let candidate = matches.get(lexeme.id);
    if (!candidate) {
      candidate = {lexeme, analyses: []};
      matches.set(lexeme.id, candidate);
    }
    if (analysis && !candidate.analyses.some(item => JSON.stringify(item) === JSON.stringify(analysis))) {
      candidate.analyses.push(analysis);
    }
  }

  function showCandidates(candidates) {
    state.matches = [...candidates.values()].sort((left, right) => left.lexeme.id.localeCompare(right.lexeme.id));
    state.selectedIndex = 0;
    if (state.matches.length > 1) {
      state.result = {status: 'ambiguous', message: 'Several dictionary entries match. Select one.'};
      state.status = 'ambiguous';
      return;
    }
    if (state.matches.length === 1) {
      selectCandidate(state.matches[0]);
      return;
    }
    state.result = {status: 'not_found', message: 'Not found in dictionary'};
    state.status = 'not_found';
  }

  function updateSelectedOperation() {
    if (!workspaceState || !state.searchEntryId) return;
    const result = state.result;
    updateOperation(workspaceState, 'forms', state.searchEntryId, {
      status: result?.status ?? 'error',
      accepted: !['error', 'unsupported', 'morphology_unsupported',
        'dictionary_unsupported'].includes(result?.status),
      output: result?.forms?.map(form => form.text).filter(Boolean).join(', ') ?? result?.message ?? null,
      rawResult: {...(result ?? {}), matches: state.matches}
    });
  }

  function selectCandidate(candidate) {
    state.result = null;
    state.status = '';
    try {
      const morphology = formsService.morphology({language: state.language,
        lexemeId: candidate.lexeme.id});
      if (morphology.status === 'unsupported') {
        state.result = {status: 'morphology_unsupported', lexeme: candidate.lexeme,
          providerStatus: morphology.providerStatus, hasProvider: morphology.hasProvider,
          diagnostics: morphology.diagnostics ?? []};
        state.status = state.result.status;
        return;
      }
      if (morphology.status === 'error') {
        state.result = {status: 'error', lexeme: candidate.lexeme, message: morphology.message,
          diagnostics: morphology.diagnostics ?? []};
        state.status = 'error';
        return;
      }

      const paradigm = formsService.inspectParadigm({language: state.language, lexemeId: candidate.lexeme.id});
      if (paradigm.status !== 'ok') {
        if (morphology.status === 'no_paradigm') {
          state.result = {status: 'no_paradigm', lexeme: candidate.lexeme,
            providerStatus: morphology.providerStatus, hasProvider: morphology.hasProvider,
            hasParadigm: morphology.hasParadigm, paradigmStatus: morphology.paradigmStatus,
            availability: morphology.availability, description: morphology.description,
            forms: [], analyses: candidate.analyses,
            diagnostics: morphology.diagnostics ?? []};
          state.status = 'no_paradigm';
          return;
        }
        state.result = {status: 'error', lexeme: candidate.lexeme, message: paradigm.message,
          diagnostics: paradigm.diagnostics ?? []};
        state.status = 'error';
        return;
      }
      const forms = Array.isArray(paradigm.forms) ? paradigm.forms : [];
      const status = forms.length ? 'found' : morphology.status === 'no_paradigm' ?
        'no_paradigm' : morphology.status === 'unknown_availability' ?
          'unknown_availability' : 'empty_paradigm';
      state.result = {status, lexeme: candidate.lexeme,
        providerStatus: morphology.providerStatus, hasProvider: morphology.hasProvider,
        availability: morphology.availability, description: morphology.description, forms,
        hasParadigm: morphology.hasParadigm, paradigmStatus: morphology.paradigmStatus,
        analyses: candidate.analyses};
      state.status = status;
    } catch (error) {
      state.result = errorResult(error?.message ?? 'Forms service failed.',
        [{code: error?.code ?? 'FORMS_SERVICE_ERROR', message: error?.message ?? 'Forms service failed.'}]);
      state.result.lexeme = candidate.lexeme;
      state.status = 'error';
    } finally {
      updateSelectedOperation();
    }
  }

  function finishCandidates(candidates) {
    if (candidates.size > 1) {
      showCandidates(candidates);
      return;
    }
    showCandidates(candidates);
  }

  function search() {
    clearSearch();
    const query = state.draft.trim();
    if (!query) {
      state.result = errorResult('Enter a lemma or form.');
      state.status = 'error';
      return;
    }
    if (!state.language) {
      state.result = errorResult('No language plugin is available.');
      state.status = 'error';
      return;
    }

    try {
      const lemmaLookup = formsService.lookupLexemes({language: state.language, lemma: query});
      if (lemmaLookup.status === 'error') {
        state.result = {status: 'error', message: lemmaLookup.message,
          diagnostics: lemmaLookup.diagnostics ?? []};
        state.status = 'error';
        return;
      }
      if (lemmaLookup.status === 'unsupported') {
        state.result = {status: 'dictionary_unsupported',
          message: 'Dictionary lookup is not supported for this language',
          diagnostics: lemmaLookup.diagnostics ?? []};
        state.status = 'dictionary_unsupported';
        return;
      }
      const candidates = new Map();
      for (const lexeme of lemmaLookup.lexemes ?? []) addCandidate(candidates, lexeme);

      const morphology = formsService.morphology({language: state.language});
      if (morphology.status === 'unsupported') {
        if (candidates.size) {
          finishCandidates(candidates);
          return;
        }
        state.result = {status: 'morphology_unsupported', message: 'Morphology not supported for this language',
          providerStatus: morphology.providerStatus, hasProvider: morphology.hasProvider,
          diagnostics: morphology.diagnostics ?? []};
        state.status = state.result.status;
        return;
      }
      if (morphology.status === 'error') {
        state.result = {status: 'error', message: morphology.message,
          diagnostics: morphology.diagnostics ?? []};
        state.status = 'error';
        return;
      }
      const analysis = formsService.analyzeForm({language: state.language, text: query});
      if (analysis.status === 'error' || analysis.status === 'unsupported') {
        state.result = {status: analysis.status, message: analysis.message,
          diagnostics: analysis.diagnostics ?? []};
        state.status = analysis.status;
        return;
      }
      for (const form of analysis.analyses ?? []) {
        let lexeme = candidates.get(form.lexemeId)?.lexeme;
        if (!lexeme && typeof form.lemma === 'string') {
          const byLemma = formsService.lookupLexemes({language: state.language, lemma: form.lemma});
          if (byLemma.status === 'error' || byLemma.status === 'unsupported') {
            state.result = {status: byLemma.status, message: byLemma.message,
              diagnostics: byLemma.diagnostics ?? []};
            state.status = byLemma.status;
            return;
          }
          lexeme = (byLemma.lexemes ?? []).find(item => item.id === form.lexemeId);
        }
        addCandidate(candidates, lexeme, form);
      }
      finishCandidates(candidates);
    } catch (error) {
      state.result = errorResult(error?.message ?? 'Forms service failed.',
        [{code: error?.code ?? 'FORMS_SERVICE_ERROR', message: error?.message ?? 'Forms service failed.'}]);
      state.status = 'error';
    }
  }

  function changeLanguage(step) {
    const next = nextValue(languages, state.language, step);
    if (next === state.language) return;
    state.language = next;
    state.settings.language = next;
    clearSearch();
  }

  function chooseCandidate(step = 0) {
    if (!state.matches.length) return;
    state.selectedIndex = (state.selectedIndex + step + state.matches.length) % state.matches.length;
    if (step === 0) selectCandidate(state.matches[state.selectedIndex]);
  }

  function openDetails() {
    if (!workspaceState || !state.entries.length) return false;
    const entry = state.entries.find(item => item.id === state.selectedEntryId) ?? state.entries.at(-1);
    workspaceState.overlay = {type: 'details', mode: 'forms', entryId: entry.id,
      sectionIndex: 0, scrollTop: 0};
    workspaceState.overlayScrollTop = 0;
    return true;
  }

  function emptyStateLines() {
    const capabilities = runtime.capabilityCatalog?.forms({language: state.language});
    const lookup = capabilities?.lookup?.available ? 'dostępny' : 'niedostępny';
    const morphology = capabilities?.inspectParadigm?.available ? 'dostępna' : 'niedostępna';
    return [
      {text: `Słownik ${lookup} · morfologia ${morphology} · ${state.language ?? '?'}`,
        tone: 'muted'},
      {text: 'Formy pokazuję wyłącznie z odpowiedzi providera.', tone: 'muted'},
      {text: 'Generowanie nieznanych form: niedostępne.', tone: 'muted'}
    ];
  }

  return {
    id: 'forms',
    label: 'Forms',
    state,
    fieldLabel: 'Lemma or form',
    composerPrompt: 'Wpisz lemat lub formę…',
    actionLabel: 'Search',
    focusTargets,
    emptyStateLines,
    onDraftChange() {
      clearSearch();
    },
    handleAction(action, {focus, requestToken, setFocus} = {}) {
      if (focus?.id === 'language' &&
          ['cursor_left', 'cursor_right', 'submit'].includes(action.type)) {
        changeLanguage(action.type === 'cursor_left' ? -1 : 1);
        return true;
      }
      if (focus?.id === 'candidate' && action.type === 'cursor_left') {
        chooseCandidate(-1);
        return true;
      }
      if (focus?.id === 'candidate' && action.type === 'cursor_right') {
        chooseCandidate(1);
        return true;
      }
      if (focus?.id === 'candidate' && action.type === 'cursor_up') {
        chooseCandidate(-1);
        return true;
      }
      if (focus?.id === 'candidate' && action.type === 'cursor_down') {
        chooseCandidate(1);
        return true;
      }
      if (focus?.id === 'candidate' && action.type === 'escape') {
        state.selectedIndex = 0;
        setFocus?.('query');
        return true;
      }
      if (focus?.id === 'details' && action.type === 'submit') return openDetails();
      if (focus?.id === 'candidate' && action.type === 'submit') {
        const input = state.draft;
        chooseCandidate();
        if (state.result?.status === 'found' && state.draft === input) {
          state.draft = '';
          state.cursor = 0;
          if (workspaceState) setFollowLatest(workspaceState, 'forms', true);
        }
        return true;
      }
      if ((focus?.id === 'query' || focus?.id === 'search') && action.type === 'submit') {
        const input = state.draft;
        search();
        if (workspaceState) {
          const result = state.result ?? {status: 'error'};
          const output = result.forms?.map(form => form.text).filter(Boolean).join(', ') ??
            (result.status === 'ambiguous' ? state.matches.map(item => item.lexeme.id).join(', ') :
              result.message ?? null);
          const entry = appendOperation(workspaceState, 'forms', {input,
            language: state.language, status: result.status,
            accepted: !['error', 'unsupported', 'morphology_unsupported',
              'dictionary_unsupported'].includes(result.status),
            output, rawResult: {...result, matches: state.matches}}, requestToken);
          if (entry) {
            state.selectedEntryId = entry.id;
            state.searchEntryId = entry.id;
          }
        }
        if (state.result?.status === 'found' && state.draft === input) {
          state.draft = '';
          state.cursor = 0;
        }
        return true;
      }
      return false;
    },
  };
}
