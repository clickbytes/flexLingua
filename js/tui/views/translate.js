export function createTranslateView() {
  const state = {draft: '', cursor: 0, focusIndex: 0, status: ''};
  return {
    id: 'translate',
    label: 'Translate',
    state,
    fieldLabel: 'Source text',
    actionLabel: 'Translate',
    render() {
      return {panels: [
        {title: 'Source', kind: 'input'},
        {title: 'Result', lines: [{text: 'No translation yet.', tone: 'muted'}]}
      ]};
    }
  };
}
