// How the user's next message reacts to the previous answer, for Auto routing feedback.
// 'correction'  — asks to fix or redo the previous answer            → −1 for that answer
// 'regression'  — says something done earlier does not work (any of the recent answers) → takes back a success
// 'success'     — thanks, confirms, or simply moves on (“дальше”, “предложи”, a new topic) → +1
// 'neutral'     — a clarifying question about the answer (“почему так?”)  → no signal
const CORRECTION =
  /^(нет[,.! ]|не так|не то|неправ|неверн|ошиб|исправ|поправ|переделай|перепиши|ты не |ты забыл|забыл|а где|где же|почему не|опять|снова не|всё ещё не|все еще не|это не то|не работает|не сработал|не компил|не запуска|no[,.! ]|wrong|fix |redo|that's not|doesn't work|still not)/i;
const BROKEN =
  /(не работает|не работают|сломал|сломалось|перестал[аио]? работать|падает|крашит|ошибка|баг|не компилир|не запускает|не открывает|doesn't work|broken|crash|fails)/i;
const EARLIER =
  /(раньше|ранее|до этого|в прошлый раз|прошл|после твоих|после тво|которое ты|который ты|которую ты|что ты сделал|что ты добавил|что ты исправил|ты делал|ты добавлял|твой фикс|твои правки|вот это|то,? что)/i;
const SUCCESS =
  /(спасибо|благодар|отлично|супер|класс|круто|идеально|работает|получилось|заработал|норм|ок\b|окей|хорошо|давай дальше|дальше|предложи|следующ|теперь |продолж|go on|next|thanks|thank you|great|perfect|works|nice)/i;
const QUESTION =
  /^(почему|зачем|как так|а почему|а зачем|что значит|что это|объясни|why|what does|how come)/i;

export function answerReaction(text) {
  const t = String(text || '')
    .trim()
    .toLowerCase();
  if (!t) return 'neutral';
  if (BROKEN.test(t) && EARLIER.test(t)) return 'regression';
  if (CORRECTION.test(t) || /не работает|не сработал/.test(t)) return 'correction';
  if (QUESTION.test(t) && !SUCCESS.test(t)) return 'neutral';
  // Anything else, including a new unrelated request, means the previous answer was good enough.
  return 'success';
}

/**
 * Feedback calls for the user's new message: the previous answer gets a signal; a regression goes to the
 * most recent earlier answer that was counted as a success (within the last few answers).
 */
export function reactionSignals(text, answers) {
  const kind = answerReaction(text);
  const [last, ...earlier] = [...answers].reverse();
  if (!last) return [];
  if (kind === 'success') return [{messageId: last.id, signal: 1}];
  if (kind === 'correction') return [{messageId: last.id, signal: -1}];
  if (kind === 'regression') {
    const target = earlier.slice(0, 6).find(a => a.signal !== -1) || last;
    return [{messageId: target.id, signal: -1, regression: true}];
  }
  return [];
}
