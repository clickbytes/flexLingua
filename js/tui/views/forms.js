export function createFormsView() {
  const state = {draft: '', cursor: 0, focusIndex: 0, status: ''};
  return {
    id: 'forms',
    label: 'Forms',
    state,
    fieldLabel: 'Lemma or form',
    actionLabel: 'Look up',
    render() {
      return {panels: [
        {title: 'Dictionary', kind: 'input'},
        {title: 'Forms', lines: [{text: 'No dictionary entry selected.', tone: 'muted'}]}
      ]};
    }
  };
}
