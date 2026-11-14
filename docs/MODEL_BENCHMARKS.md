# Публичные сравнения моделей Nexus

Срез проверен 11 ноября 2026. Это опубликованные сторонние измерения, не собственные прогоны Nexus. Покрытие всех 32 записей каталога ниже; отсутствие результата не означает плохое качество. Живой каталог может содержать дополнительные неизвестные версии.

## Методика и ограничения

- AA Intelligence Index v5.0.1 — смешанный набор из 9 оценок. Используется как косвенный ориентир для сложных задач и общего кода, а не отдельный балл исправления ошибок. Скорость выдачи и первый ответ измерены AA; минуты на задачу — расчёт времени инференса, без полного времени выполнения инструментов. API-расход учитывает токены теста и его веса, не стоимость нашей подписки.
- Arena WebDev — предпочтения в веб-разработке, не pass rate. Применяется только при распознавании frontend/React/HTML/CSS/сайта.
- Arena Text Overall — общие предпочтения текстовых ответов, не отдельная оценка перевода или русского языка.
- Arena Vision — понимание изображений, не их генерация. Показанные ± — опубликованные интервалы неопределённости; пересечение не доказывает превосходство.
- Разные режимы указаны у каждой строки. При Авто результаты служат предварительным ориентиром, режимы Max/xHigh не включаются автоматически. Для ручной глубины допускаются только совпадающие low/medium/high; ручная модель всегда сохраняется.
- Точные ID: алиасы Claude, runtime default, preview вместо stable не наследуют результаты. AA Default Fallback исключён из маршрутизации.
- Сначала фильтруются возможности и доступность, затем сравниваются минимум две точные версии внутри одного теста и даты. Незамеренные варианты не получают ноль. Покрытие показано в объяснении.
- Для AA допускается отставание до 3 баллов от лучшего: для полностью API-кандидатов выбирается меньший расход теста, затем расчётное время. Для подписок расход не используется, выбирается время. Порог 3 — продуктовая эвристика, не погрешность теста.
- Для Arena при пересечении интервалов API-кандидатов сравнивается тариф за фиксированные 10 тыс. входных + 2 тыс. выходных токенов; это условный объём, не измеренная цена задачи. Иначе используется опубликованный балл и стабильный ID.
- При недостатке данных или возрасте 90 дней — явно отмеченный резервный выбор. Снимок не обновляется сам; для обновления нужны повторная проверка источников и сборка.
- Надёжность инструментов, извлечение данных и стоимость по каждой отдельной категории пока не измерены. Отдельные точные рейтинги для этих пунктов не выдумываются.

## Источники методик

- [AA Intelligence Index v5.0.1](https://artificialanalysis.ai/methodology/intelligence-benchmarking), срез 2026-11-11. Смешанный набор сложных задач, включая код; не отдельная оценка архитектуры или исправления ошибок.
- [Arena WebDev](https://arena.ai/leaderboard/code/webdev), срез 2026-11-10. Предпочтения в веб-разработке; не доля пройденных тестов и не оценка любого кода.
- [Arena Text Overall](https://arena.ai/leaderboard/chat/text), срез 2026-11-09. Общие предпочтения пользователей; не отдельный тест перевода, русского языка или фактологии.
- [Arena Vision Overall](https://arena.ai/leaderboard/chat/vision), срез 2026-11-08. Понимание изображений, не генерация изображений.

## Данные по каждой модели

### haiku

Быстрые простые задачи. Алиас CLI, точная версия и её цена не закреплены.

[Спецификация и тариф](https://code.claude.com/docs/en/model-config).

Плавающий алиас: точная версия не подтверждена.

### sonnet

Повседневная работа с кодом. Алиас CLI, точная версия и её цена не закреплены.

[Спецификация и тариф](https://code.claude.com/docs/en/model-config).

Плавающий алиас: точная версия не подтверждена.

### opus

Сложные рассуждения. Алиас CLI, точная версия и её цена не закреплены.

[Спецификация и тариф](https://code.claude.com/docs/en/model-config).

Плавающий алиас: точная версия не подтверждена.

### gpt-6-sol

Код и задачи агента; предыдущее поколение Sol.

[Спецификация и тариф](https://developers.openai.com/api/docs/models/gpt-6-sol).

| Тест | Режим | Балл | Первый ответ, с | Выдача, ток/с | Расчёт, мин/задачу | API $/задачу |
|---|---|---:|---:|---:|---:|---:|
| [AA Intelligence Index v5.0.1](https://artificialanalysis.ai/models/gpt-6-sol) (2026-11-11) | max | 44 | 45.04 | 121 | 7.4 | 2.47 |
| [Arena WebDev](https://arena.ai/leaderboard/code/webdev) (2026-11-10) | max | 1673 ± 8 | — | — | — | — |
| [Arena Text Overall](https://arena.ai/leaderboard/chat/text) (2026-11-09) | max | 1457 ± 6 | — | — | — | — |

### gpt-5.6-sol

Сложная профессиональная работа; старое поколение.

[Спецификация и тариф](https://developers.openai.com/api/docs/models/gpt-5.6-sol).

| Тест | Режим | Балл | Первый ответ, с | Выдача, ток/с | Расчёт, мин/задачу | API $/задачу |
|---|---|---:|---:|---:|---:|---:|
| [AA Intelligence Index v5.0.1](https://artificialanalysis.ai/models/gpt-5-6-sol) (2026-11-11) | max | — | 54.26 | 96 | — | — |
| [Arena Text Overall](https://arena.ai/leaderboard/chat/text) (2026-11-09) | xhigh | 1485 ± 4 | — | — | — | — |
| [Arena Vision Overall](https://arena.ai/leaderboard/chat/vision) (2026-11-08) | xhigh | 1288 ± 7 | — | — | — | — |

### gpt-5.6-terra

Баланс стоимости и возможностей в семействе 5.6.

[Спецификация и тариф](https://developers.openai.com/api/docs/models/gpt-5.6-terra).

| Тест | Режим | Балл | Первый ответ, с | Выдача, ток/с | Расчёт, мин/задачу | API $/задачу |
|---|---|---:|---:|---:|---:|---:|
| [AA Intelligence Index v5.0.1](https://artificialanalysis.ai/models/gpt-5-6-terra) (2026-11-11) | max | 32 | 72.23 | 101 | 10.9 | 3.73 |
| [Arena Vision Overall](https://arena.ai/leaderboard/chat/vision) (2026-11-08) | xhigh | 1266 ± 7 | — | — | — | — |

### gpt-5.6-luna

Массовые задачи с ограниченным бюджетом.

[Спецификация и тариф](https://developers.openai.com/api/docs/models/gpt-5.6-luna).

| Тест | Режим | Балл | Первый ответ, с | Выдача, ток/с | Расчёт, мин/задачу | API $/задачу |
|---|---|---:|---:|---:|---:|---:|
| [AA Intelligence Index v5.0.1](https://artificialanalysis.ai/models/gpt-5-6-luna) (2026-11-11) | max | 24 | 51.32 | 114 | 8.6 | 0.33 |

### gpt-reserve

Быстрая недорогая модель для кода — описание локального каталога Codex; публичный тариф не найден.

Источник каталога: Локальный models_cache.json официального CLI, 11.11.2026.

В проверенных публичных источниках нет сопоставимых результатов этой модели.

### codex-auto-review

Служебная модель проверки разрешений Codex; не обычный чат.

Источник каталога: Локальный models_cache.json официального CLI, 11.11.2026.

Служебная модель; не участник сравнения чата.

### grok-4.20-0309-reasoning

Текстовые задачи с рассуждениями.

[Спецификация и тариф](https://docs.x.ai/developers/models/grok-4.20-0309-reasoning).

AA публикует 0309 v2; соответствие этой версии каталогу не подтверждено.

### grok-4.20-0309-non-reasoning

Текстовые задачи без отдельного режима рассуждений.

[Спецификация и тариф](https://docs.x.ai/developers/models/grok-4.20-0309-non-reasoning).

AA публикует 0309 v2; соответствие этой версии каталогу не подтверждено.

### grok-4.20-multi-agent-0309

Глубокое исследование несколькими агентами; нужен отдельный адаптер.

[Спецификация и тариф](https://docs.x.ai/developers/models/grok-4.20-multi-agent-0309).

Многоагентный режим требует отдельного адаптера и отдельного сравнения.

### grok-4.3

Быстрые ответы и следование инструкциям.

[Спецификация и тариф](https://docs.x.ai/developers/models/grok-4.3).

Найденные старые результаты AA v4.3 не смешиваются с v5.0.1.

### grok-4.5

Код, инженерные задачи и работа агента.

[Спецификация и тариф](https://docs.x.ai/developers/models/grok-4.5).

| Тест | Режим | Балл | Первый ответ, с | Выдача, ток/с | Расчёт, мин/задачу | API $/задачу |
|---|---|---:|---:|---:|---:|---:|
| [AA Intelligence Index v5.0.1](https://artificialanalysis.ai/models/grok-4-5) (2026-11-11) | high | — | 8.68 | 72 | — | — |
| [Arena WebDev](https://arena.ai/leaderboard/code/webdev) (2026-11-10) | unspecified | 1552 ± 7 | — | — | — | — |
| [Arena Vision Overall](https://arena.ai/leaderboard/chat/vision) (2026-11-08) | unspecified | 1280 ± 7 | — | — | — | — |

### grok-4.6

Код, задачи агента и работа со знаниями.

[Спецификация и тариф](https://docs.x.ai/developers/models/grok-4.6).

| Тест | Режим | Балл | Первый ответ, с | Выдача, ток/с | Расчёт, мин/задачу | API $/задачу |
|---|---|---:|---:|---:|---:|---:|
| [AA Intelligence Index v5.0.1](https://artificialanalysis.ai/models/grok-4-6) (2026-11-11) | high | — | 26.82 | 68 | — | — |
| [Arena WebDev](https://arena.ai/leaderboard/code/webdev) (2026-11-10) | high | 1618 ± 7 | — | — | — | — |
| [Arena Vision Overall](https://arena.ai/leaderboard/chat/vision) (2026-11-08) | high | 1263 ± 8 | — | — | — | — |

### grok-build-0.1

Код и инженерные задачи.

[Спецификация и тариф](https://docs.x.ai/developers/models/grok-build-0.1).

Есть спецификация производителя; сопоставимый тест точной версии не подтверждён.

### grok-imagine-image

Генерация и редактирование изображений; в Nexus нет адаптера.

[Спецификация и тариф](https://docs.x.ai/developers/models/grok-imagine-image).

Медиа-модель: нет адаптера Nexus; оценки генерации не смешиваются с пониманием изображений.

### grok-imagine-image-2.0

Генерация изображений с выбором разрешения и качества; в Nexus нет адаптера.

[Спецификация и тариф](https://docs.x.ai/developers/models/grok-imagine-image-2.0).

Медиа-модель: нет адаптера Nexus; оценки генерации не смешиваются с пониманием изображений.

### grok-imagine-video

Генерация и редактирование видео; в Nexus нет адаптера.

[Спецификация и тариф](https://docs.x.ai/developers/models/grok-imagine-video).

Медиа-модель: нет адаптера Nexus; оценки генерации не смешиваются с пониманием изображений.

### grok-imagine-video-1.5

Генерация видео, в том числе с аудиовходом; в Nexus нет адаптера.

[Спецификация и тариф](https://docs.x.ai/developers/models/grok-imagine-video-1.5).

Медиа-модель: нет адаптера Nexus; оценки генерации не смешиваются с пониманием изображений.

### grok-imagine-video-1.5-lite

Генерация видео с меньшим базовым тарифом; в Nexus нет адаптера.

[Спецификация и тариф](https://docs.x.ai/developers/models/grok-imagine-video-1.5-lite).

Медиа-модель: нет адаптера Nexus; оценки генерации не смешиваются с пониманием изображений.

### gpt-6-astra

Сложные рассуждения, код, исследования и документы.

[Спецификация и тариф](https://developers.openai.com/api/docs/models/gpt-6-astra).

| Тест | Режим | Балл | Первый ответ, с | Выдача, ток/с | Расчёт, мин/задачу | API $/задачу |
|---|---|---:|---:|---:|---:|---:|
| [AA Intelligence Index v5.0.1](https://artificialanalysis.ai/models/gpt-6-astra) (2026-11-11) | max | 57 | 249.02 | 38 | 23 | 6.24 |
| [Arena WebDev](https://arena.ai/leaderboard/code/webdev) (2026-11-10) | max | 1764 ± 9 | — | — | — | — |
| [Arena Text Overall](https://arena.ai/leaderboard/chat/text) (2026-11-09) | max | 1474 ± 6 | — | — | — | — |
| [Arena Vision Overall](https://arena.ai/leaderboard/chat/vision) (2026-11-08) | max | 1283 ± 9 | — | — | — | — |

### gpt-6.1-sol

Универсальная работа с текстом, кодом и инструментами.

[Спецификация и тариф](https://developers.openai.com/api/docs/models/gpt-6.1-sol).

| Тест | Режим | Балл | Первый ответ, с | Выдача, ток/с | Расчёт, мин/задачу | API $/задачу |
|---|---|---:|---:|---:|---:|---:|
| [AA Intelligence Index v5.0.1](https://artificialanalysis.ai/models/gpt-6-1-sol) (2026-11-11) | max | 55 | 156.46 | 55 | 20.4 | 1.27 |
| [Arena WebDev](https://arena.ai/leaderboard/code/webdev) (2026-11-10) | max | 1743 ± 10 | — | — | — | — |
| [Arena Text Overall](https://arena.ai/leaderboard/chat/text) (2026-11-09) | max | 1482 ± 6 | — | — | — | — |
| [Arena Vision Overall](https://arena.ai/leaderboard/chat/vision) (2026-11-08) | max | 1293 ± 11 | — | — | — | — |

### gpt-6.1-terra

Визуальный анализ, работа с экраном и редактирование текстов.

[Спецификация и тариф](https://developers.openai.com/api/docs/models/gpt-6.1-terra).

| Тест | Режим | Балл | Первый ответ, с | Выдача, ток/с | Расчёт, мин/задачу | API $/задачу |
|---|---|---:|---:|---:|---:|---:|
| [AA Intelligence Index v5.0.1](https://artificialanalysis.ai/models/gpt-6-1-terra) (2026-11-11) | max | 51 | 157.72 | 74 | 13.5 | 0.96 |
| [Arena WebDev](https://arena.ai/leaderboard/code/webdev) (2026-11-10) | max | 1679 ± 11 | — | — | — | — |

### gpt-6-luna

Недорогие задачи; требуется проверка качества на своих примерах.

[Спецификация и тариф](https://developers.openai.com/api/docs/models/gpt-6-luna).

| Тест | Режим | Балл | Первый ответ, с | Выдача, ток/с | Расчёт, мин/задачу | API $/задачу |
|---|---|---:|---:|---:|---:|---:|
| [AA Intelligence Index v5.0.1](https://artificialanalysis.ai/models/gpt-6-luna) (2026-11-11) | max | 28 | 81.37 | 109 | 11.5 | 0.15 |
| [Arena WebDev](https://arena.ai/leaderboard/code/webdev) (2026-11-10) | max | 1577 ± 6 | — | — | — | — |
| [Arena Text Overall](https://arena.ai/leaderboard/chat/text) (2026-11-09) | max | 1441 ± 4 | — | — | — | — |

### claude-fable-5-2

Сложные рассуждения и длительные задачи агента.

[Спецификация и тариф](https://platform.claude.com/docs/en/models/overview).

| Тест | Режим | Балл | Первый ответ, с | Выдача, ток/с | Расчёт, мин/задачу | API $/задачу |
|---|---|---:|---:|---:|---:|---:|
| [Arena WebDev](https://arena.ai/leaderboard/code/webdev) (2026-11-10) | xhigh | 1836 ± 22 | — | — | — | — |

### claude-opus-5-5

Длительная работа с кодом и знаниями.

[Спецификация и тариф](https://platform.claude.com/docs/en/models/overview).

| Тест | Режим | Балл | Первый ответ, с | Выдача, ток/с | Расчёт, мин/задачу | API $/задачу |
|---|---|---:|---:|---:|---:|---:|
| [AA Intelligence Index v5.0.1](https://artificialanalysis.ai/models/claude-opus-5-5) (2026-11-11) | max + Default Fallback, исключён из Авто | 59 | 353.75 | 115 | 25 | 10.04 |
| [Arena WebDev](https://arena.ai/leaderboard/code/webdev) (2026-11-10) | max | 1814 ± 12 | — | — | — | — |
| [Arena Text Overall](https://arena.ai/leaderboard/chat/text) (2026-11-09) | high | 1506 ± 6 | — | — | — | — |
| [Arena Vision Overall](https://arena.ai/leaderboard/chat/vision) (2026-11-08) | high | 1295 ± 10 | — | — | — | — |

### claude-sonnet-5-5

Баланс скорости и возможностей.

[Спецификация и тариф](https://platform.claude.com/docs/en/models/overview).

| Тест | Режим | Балл | Первый ответ, с | Выдача, ток/с | Расчёт, мин/задачу | API $/задачу |
|---|---|---:|---:|---:|---:|---:|
| [AA Intelligence Index v5.0.1](https://artificialanalysis.ai/models/claude-sonnet-5-5) (2026-11-11) | max + Default Fallback, исключён из Авто | 55 | 254.92 | 145 | 32.7 | 10.02 |
| [Arena WebDev](https://arena.ai/leaderboard/code/webdev) (2026-11-10) | xhigh | 1773 ± 10 | — | — | — | — |
| [Arena Vision Overall](https://arena.ai/leaderboard/chat/vision) (2026-11-08) | xhigh | 1263 ± 10 | — | — | — | — |

### claude-haiku-5-5

Классификация, извлечение данных, маршрутизация.

[Спецификация и тариф](https://platform.claude.com/docs/en/models/overview).

| Тест | Режим | Балл | Первый ответ, с | Выдача, ток/с | Расчёт, мин/задачу | API $/задачу |
|---|---|---:|---:|---:|---:|---:|
| [Arena WebDev](https://arena.ai/leaderboard/code/webdev) (2026-11-10) | high | 1594 ± 9 | — | — | — | — |

### gemini-3.1-flash-lite

Перевод, простая обработка данных, большой поток запросов.

[Спецификация и тариф](https://ai.google.dev/gemini-api/docs/pricing).

Страница AA относится к preview; соответствие стабильной версии не подтверждено.

### grok-4.7

Код и универсальные задачи; в Nexus API доступен только текст.

[Спецификация и тариф](https://docs.x.ai/developers/models).

| Тест | Режим | Балл | Первый ответ, с | Выдача, ток/с | Расчёт, мин/задачу | API $/задачу |
|---|---|---:|---:|---:|---:|---:|
| [AA Intelligence Index v5.0.1](https://artificialanalysis.ai/models/grok-4-7) (2026-11-11) | xhigh | 35 | 57.56 | 63 | 27.4 | 7.77 |
| [Arena WebDev](https://arena.ai/leaderboard/code/webdev) (2026-11-10) | xhigh | 1641 ± 8 | — | — | — | — |

### qwen3:4b

Локальная обработка текста и дополнительная проверка ответа.

[Спецификация и тариф](https://huggingface.co/Qwen/Qwen3-4B).

Есть model card Qwen3-4B; квантование Ollama и скорость на этом Mac отдельно не измерены.

## Дополнительные материалы, не перенесённые в общий рейтинг

- [Grok 4.20 0309 v2, AA](https://artificialanalysis.ai/models/releases/grok-4-20): точное соответствие версии не подтверждено.
- [Grok 4.3, старый срез AA](https://artificialanalysis.ai/models/releases/grok-4-3): другой состав индекса.
- [Gemini Flash-Lite, AA preview](https://artificialanalysis.ai/models/gemini-3-1-flash-lite-preview): не присваиваем результат стабильному ID.
- [Генерация изображений AA](https://artificialanalysis.ai/image/leaderboard/text-to-image), [генерация видео AA](https://artificialanalysis.ai/video/leaderboard/text-to-video): отдельные модели и настройки, не Vision. Nexus пока не имеет медиа-адаптера.
- [Qwen3-4B model card](https://huggingface.co/Qwen/Qwen3-4B): тесты производителя не измеряют локальный Ollama runtime и квантование на этом Mac.

## Обновление политики: четыре приоритета

Текущая реализация заменяет описанный выше выбор максимального балла при пересечении интервалов. В таком случае преимущество качества не считается доказанным: используются известные сопоставимые цена/время, затем стабильный ID. «Баланс» сохраняет допуск 3 балла AA; «Качество» — 0 баллов AA. Для Arena оба учитывают интервалы. «Экономия» и «Скорость» допускают снижение качества и выбирают минимум метрики среди оценённых вариантов только при её полном покрытии; иначе показывается причина резервного выбора. Неизвестные стоимость подписки и время отдельных категорий не становятся нулями. Приоритет сохраняется для каждого чата.
