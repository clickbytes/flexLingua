const FIELDS = Object.freeze([
  {id: 'translate.from', label: 'Translate · źródło'},
  {id: 'translate.to', label: 'Translate · cel'},
  {id: 'chat.from', label: 'Chat · źródło'},
  {id: 'chat.to', label: 'Chat · cel'},
  {id: 'forms.language', label: 'Forms · język'},
  {id: 'automaticDetails', label: 'Automatyczne Details'}
]);

export function settingsSnapshot(workspace) {
  return {
    translate: {from: workspace.modes.translate.from, to: workspace.modes.translate.to},
    chat: {from: workspace.modes.chat.from, to: workspace.modes.chat.to},
    forms: {language: workspace.modes.forms.language},
    automaticDetails: workspace.automaticDetails === true
  };
}

export function createSettingsPanel(workspace) {
  return {type: 'settings', draft: structuredClone(settingsSnapshot(workspace)),
    selected: 0, list: null, listSelected: 0, scrollTop: 0, notice: ''};
}

export function settingsFields() { return FIELDS; }

export function settingsLanguages(catalog) {
  const names = new Intl.DisplayNames(['pl'], {type: 'language'});
  return catalog.listLanguages().map(item => ({code: item.code,
    name: item.name ?? item.label ?? names.of(item.code) ?? item.code, status: item.status}));
}

export function settingsValue(draft, id) {
  if (id === 'automaticDetails') return draft.automaticDetails;
  const [mode, key] = id.split('.');
  return draft[mode][key];
}

export function setSettingsValue(draft, id, value) {
  if (id === 'automaticDetails') draft.automaticDetails = value === true;
  else {
    const [mode, key] = id.split('.');
    draft[mode][key] = value;
  }
}

export function validateSettings(draft, catalog) {
  const known = new Set(settingsLanguages(catalog).map(item => item.code));
  for (const field of FIELDS) {
    if (field.id === 'automaticDetails') continue;
    const value = settingsValue(draft, field.id);
    if (!known.has(value)) return `Nieznany kod języka: ${value ?? '?'}.`;
  }
  if (typeof draft.automaticDetails !== 'boolean') return 'Nieprawidłowa wartość Details.';
  return null;
}

export function settingsLines(panel, catalog) {
  const languages = settingsLanguages(catalog);
  const lines = [
    {text: 'Settings · ustawienia sesji', tone: 'accent'},
    {text: 'Tylko ta sesja; po wyjściu ustawienia wrócą do domyślnych.', tone: 'muted'}
  ];
  if (panel.list) {
    const field = FIELDS[panel.selected];
    lines.push({text: `Wybierz: ${field.label}`, tone: 'accent'});
    const options = field.id === 'automaticDetails' ? [
      {code: false, name: 'Wyłączone'}, {code: true, name: 'Włączone'}
    ] : languages;
    options.forEach((item, index) => {
      const candidate = structuredClone(panel.draft);
      setSettingsValue(candidate, field.id, item.code);
      const status = field.id === 'automaticDetails' ? '' : field.id === 'forms.language' ?
        (catalog.forms({language: item.code}).inspectParadigm?.available ?
          'morfologia dostępna' : 'morfologia niedostępna') :
        (() => {
          const [mode] = field.id.split('.');
          const direction = catalog.translation(candidate[mode]);
          return direction.status === 'available' ? 'kierunek dostępny' :
            `ostrzeżenie: ${direction.code ?? direction.status}`;
        })();
      lines.push({text: `${index === panel.listSelected ? '›' : ' '} ${item.name} (${item.code})${
        status ? ` · ${status}` : ''}`,
      tone: index === panel.listSelected ? 'accent' : status.startsWith('ostrzeżenie') ? 'warning' : 'neutral'});
    });
    lines.push({text: '↑/↓ wybór · Enter ustaw wartość roboczą · Esc wróć', tone: 'muted'});
  } else {
    FIELDS.forEach((field, index) => {
      const value = settingsValue(panel.draft, field.id);
      let status = '';
      if (field.id === 'translate.to' || field.id === 'translate.from') {
        const direction = catalog.translation(panel.draft.translate);
        status = direction.status === 'available' ? 'dostępny' : `ostrzeżenie: ${direction.code ?? direction.status}`;
      } else if (field.id === 'chat.to' || field.id === 'chat.from') {
        const direction = catalog.translation(panel.draft.chat);
        status = direction.status === 'available' ? 'dostępny' : `ostrzeżenie: ${direction.code ?? direction.status}`;
      } else if (field.id === 'forms.language') {
        const forms = catalog.forms({language: value});
        status = forms.inspectParadigm?.available ? 'morfologia dostępna' : 'morfologia niedostępna';
      }
      const display = field.id === 'automaticDetails' ? value ? 'włączone' : 'wyłączone' : value;
      lines.push({text: `${panel.selected === index ? '›' : ' '} ${field.label}: ${display}${status ? ` · ${status}` : ''}`,
        tone: panel.selected === index ? 'accent' : status.startsWith('ostrzeżenie') ? 'warning' : 'neutral'});
    });
    lines.push({text: `${panel.selected === FIELDS.length ? '›' : ' '} [Apply]`,
      tone: panel.selected === FIELDS.length ? 'accent' : 'neutral'});
    lines.push({text: `${panel.selected === FIELDS.length + 1 ? '›' : ' '} [Cancel]`,
      tone: panel.selected === FIELDS.length + 1 ? 'accent' : 'neutral'});
    lines.push({text: `${panel.selected === FIELDS.length + 2 ? '›' : ' '} [Edytor]`,
      tone: panel.selected === FIELDS.length + 2 ? 'accent' : 'neutral'});
    lines.push({text: '↑/↓ lub Tab fokus · Enter wybierz · Esc odrzuć', tone: 'muted'});
  }
  if (panel.notice) lines.push({text: panel.notice, tone: 'warning'});
  return lines;
}
