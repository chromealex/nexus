// User-facing chat errors. Do not expose raw provider JSON, routes or credentials.
export function chatErrorMessage(error) {
  const text = String(error ?? '');
  if (/NEXUS_RATE_LIMIT|No remaining usable account after quota failures/i.test(text))
    return 'Провайдер временно ограничил запросы. Точное время восстановления неизвестно. Запрос сохранён — выберите другую доступную модель или повторите позже.';
  if (
    /NEXUS_ACCOUNT_UNAVAILABLE|Account unavailable|No authenticated account|Для выбранной модели нет доступного подключённого аккаунта/i.test(
      text
    )
  )
    return 'Для выбранной модели сейчас нет доступного аккаунта. Проверьте подключение и ограничения в разделе «Агенты и подключения». Запрос сохранён.';
  if (/Agent idle timeout/i.test(text))
    return 'Агент не присылал событий 30 минут. Полученная часть ответа сохранена; её можно продолжить. Это тайм-аут соединения, не исчерпание квоты.';
  if (/timed out|timeout/i.test(text))
    return 'Ответ не получен вовремя. Запрос сохранён — попробуйте повторить позже.';
  if (/Agent stream ended|Agent returned no answer/i.test(text))
    return 'Агент завершил соединение без полного ответа. Запрос сохранён.';
  // Existing local validation messages are already readable Russian, unlike provider JSON.
  if (/[А-Яа-я]/.test(text) && !/[{}]/.test(text) && text.length < 400) return text;
  return 'Не удалось получить ответ от агента. Проверьте подключение и попробуйте снова. Запрос сохранён.';
}
