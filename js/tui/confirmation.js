export function createConfirmation(pending) {
  return {...pending, selected: 1, running: false};
}

export function confirmationLines(pending) {
  if (!pending) return [];
  const descriptions = {
    clear_history: ['Wyczyścić historię prezentacji?', 'Wyczyść historię', 'Zachowaj historię',
      'Wpisy prezentacji znikną. Draft i sesja Engine pozostaną.'],
    chat_direction: ['Potwierdź zmianę kierunku Chat', 'Zresetuj i zmień kierunek', 'Anuluj zmianę',
      `Sesja ${pending.previousFrom ?? '?'}→${pending.previousTo ?? '?'} zmieni się na ${
        pending.from}→${pending.to}; jej kontekst i historia zostaną usunięte.`],
    settings_chat_direction: ['Zastosować ustawienia i zresetować Chat?', 'Resetuj i zastosuj',
      'Anuluj wszystkie zmiany', 'Zmiana kierunku Chat wyczyści jej kontekst i historię. Draft zostanie.'],
    reset_chat: ['Rozpocząć nową lokalną sesję?', 'Rozpocznij nową sesję', 'Zachowaj sesję',
      'Reset wyczyści kontekst Engine, historię i draft tej sesji.']
  };
  const [title, yes, no, message] = descriptions[pending.type] ?? descriptions.reset_chat;
  return [
    {text: title, tone: 'accent'},
    {text: message, tone: 'warning'},
    {text: `${pending.selected === 0 ? '›' : ' '} [${yes}]`, tone: pending.selected === 0 ? 'accent' : 'neutral'},
    {text: `${pending.selected === 1 ? '›' : ' '} [${no}]`, tone: pending.selected === 1 ? 'accent' : 'neutral'},
    {text: '←/→ lub Tab wybór · Enter zatwierdź · Esc anuluj', tone: 'muted'}
  ];
}
