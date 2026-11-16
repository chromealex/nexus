> Дополнение 14.11.2026: алиасы Claude Code сопоставляются с точными версиями, для кода используется AA Coding Agent Index того же агента, добавлены извлечение данных, инструменты и скорость — см. конец [MODEL_BENCHMARKS.md](MODEL_BENCHMARKS.md).
>
> Дополнение 11.11.2026: опубликованные сравнения и новая логика Авто описаны в [MODEL_BENCHMARKS.md](MODEL_BENCHMARKS.md). Справочные характеристики и тарифы ниже сохранены; прежние утверждения об отсутствии внешнего сравнения заменены этим дополнением.

# Выбор модели в Nexus

Проверено 2026-11-11. Дерево показывает все модели, возвращённые подключениями, включая неподдерживаемые с причиной запрета. Карточки известных версий перечислены ниже; новые ID не теряются, но их характеристики отмечаются неизвестными.

## Как принимается решение

Ручная модель сохраняется без подмены. «Авто внутри агента» ограничивает поиск выбранным подключением. Сначала проверяются текстовый протокол, файлы, изображения, выполнение и ручная глубина. Затем используются предпочтения типа задачи (локальное текстовое обсуждение, Codex для кода, Claude для сложного текста) среди совместимых вариантов. Если предпочтительное подключение недоступно, выбирается совместимое. Внутри него приоритет имеет isDefault, затем runtime default, затем стабильный порядок ID. Этот порядок не является рейтингом качества и не выбирает обязательно самый дешёвый вариант.

Выбор хранится в поле chats[].modelChoice в projects.json, serde default сохраняет старые данные. Старое глобальное значение localStorage не переносится во все чаты автоматически. Нет отдельного модельного вызова для маршрутизации.

## Характеристики моделей

Данные API — справочные Standard-тарифы в USD, вход/выход за миллион текстовых токенов, без кеша, длинного контекста, дополнительных услуг и налогов. Для медиа указаны отдельные единицы. Подписка CLI расходует квоту и не пересчитывается по этим тарифам. Алиасы CLI не наследуют цену конкретной версии. Контекст ниже — спецификация модели, не фактический объём передаваемой истории Nexus.

Назначение — описание производителя, а не независимое сравнение. Для каждого критерия (код/тесты, архитектура/рассуждения, текст/перевод, извлечение данных, изображения, скорость, надёжность инструментов) карточка отдельно показывает заявленную специализацию, ограничение адаптера или отсутствие сравнительных измерений.

| Модель | Назначение | API: вход / выход или медиа | Контекст по спецификации | Источник |
|---|---|---|---|---|
| haiku | Быстрые простые задачи. Алиас CLI, точная версия и её цена не закреплены | Не установлен | Не установлен | [Официальная документация](https://code.claude.com/docs/en/model-config) |
| sonnet | Повседневная работа с кодом. Алиас CLI, точная версия и её цена не закреплены | Не установлен | Не установлен | [Официальная документация](https://code.claude.com/docs/en/model-config) |
| opus | Сложные рассуждения. Алиас CLI, точная версия и её цена не закреплены | Не установлен | Не установлен | [Официальная документация](https://code.claude.com/docs/en/model-config) |
| gpt-6-sol | Код и задачи агента; предыдущее поколение Sol | $2 / $10 | 1050000 | [Официальная документация](https://developers.openai.com/api/docs/models/gpt-6-sol) |
| gpt-5.6-sol | Сложная профессиональная работа; старое поколение | $4 / $20 · Промотариф до 30.11.2026 | 1050000 | [Официальная документация](https://developers.openai.com/api/docs/models/gpt-5.6-sol) |
| gpt-5.6-terra | Баланс стоимости и возможностей в семействе 5.6 | $2 / $12 | 1050000 | [Официальная документация](https://developers.openai.com/api/docs/models/gpt-5.6-terra) |
| gpt-5.6-luna | Массовые задачи с ограниченным бюджетом | $0.2 / $1.2 | 1050000 | [Официальная документация](https://developers.openai.com/api/docs/models/gpt-5.6-luna) |
| gpt-reserve | Быстрая недорогая модель для кода — описание локального каталога Codex; публичный тариф не найден | Не установлен | Не установлен | Локальный models_cache.json официального CLI, 11.11.2026 |
| codex-auto-review | Служебная модель проверки разрешений Codex; не обычный чат | Не установлен | Не установлен | Локальный models_cache.json официального CLI, 11.11.2026 |
| grok-4.20-0309-reasoning | Текстовые задачи с рассуждениями | $1.25 / $2.5 | 1000000 | [Официальная документация](https://docs.x.ai/developers/models/grok-4.20-0309-reasoning) |
| grok-4.20-0309-non-reasoning | Текстовые задачи без отдельного режима рассуждений | $1.25 / $2.5 | 1000000 | [Официальная документация](https://docs.x.ai/developers/models/grok-4.20-0309-non-reasoning) |
| grok-4.20-multi-agent-0309 | Глубокое исследование несколькими агентами; нужен отдельный адаптер | $1.25 / $2.5 | 1000000 | [Официальная документация](https://docs.x.ai/developers/models/grok-4.20-multi-agent-0309) |
| grok-4.3 | Быстрые ответы и следование инструкциям | $1.25 / $2.5 | 1000000 | [Официальная документация](https://docs.x.ai/developers/models/grok-4.3) |
| grok-4.5 | Код, инженерные задачи и работа агента | $2 / $6 | 500000 | [Официальная документация](https://docs.x.ai/developers/models/grok-4.5) |
| grok-4.6 | Код, задачи агента и работа со знаниями | $2 / $6 | 500000 | [Официальная документация](https://docs.x.ai/developers/models/grok-4.6) |
| grok-build-0.1 | Код и инженерные задачи | $1 / $2 | 256000 | [Официальная документация](https://docs.x.ai/developers/models/grok-build-0.1) |
| grok-imagine-image | Генерация и редактирование изображений; в Nexus нет адаптера | $0.02 за изображение; входное изображение $0.002 | Не установлен | [Официальная документация](https://docs.x.ai/developers/models/grok-imagine-image) |
| grok-imagine-image-2.0 | Генерация изображений с выбором разрешения и качества; в Nexus нет адаптера | От $0.04 за изображение (1K Low); входное $0.01 | Не установлен | [Официальная документация](https://docs.x.ai/developers/models/grok-imagine-image-2.0) |
| grok-imagine-video | Генерация и редактирование видео; в Nexus нет адаптера | От $0.05/с (480p); $0.07/с (720p); вход оплачивается отдельно | Не установлен | [Официальная документация](https://docs.x.ai/developers/models/grok-imagine-video) |
| grok-imagine-video-1.5 | Генерация видео, в том числе с аудиовходом; в Nexus нет адаптера | От $0.08/с (480p), $0.14 (720p), $0.25 (1080p); вход отдельно | Не установлен | [Официальная документация](https://docs.x.ai/developers/models/grok-imagine-video-1.5) |
| grok-imagine-video-1.5-lite | Генерация видео с меньшим базовым тарифом; в Nexus нет адаптера | От $0.02/с (480p), $0.03 (720p), $0.14 (1080p); вход отдельно | Не установлен | [Официальная документация](https://docs.x.ai/developers/models/grok-imagine-video-1.5-lite) |
| gpt-6-astra | Сложные рассуждения, код, исследования и документы | $10 / $50 | 1050000 | [Официальная документация](https://developers.openai.com/api/docs/models/gpt-6-astra) |
| gpt-6.1-sol | Универсальная работа с текстом, кодом и инструментами | $2 / $10 | 1050000 | [Официальная документация](https://developers.openai.com/api/docs/models/gpt-6.1-sol) |
| gpt-6.1-terra | Визуальный анализ, работа с экраном и редактирование текстов | $1 / $5 | 1050000 | [Официальная документация](https://developers.openai.com/api/docs/models/gpt-6.1-terra) |
| gpt-6-luna | Недорогие задачи; требуется проверка качества на своих примерах | $0.1 / $0.5 | 1050000 | [Официальная документация](https://developers.openai.com/api/docs/models/gpt-6-luna) |
| claude-fable-5-2 | Сложные рассуждения и длительные задачи агента | $8 / $40 | 1000000 | [Официальная документация](https://platform.claude.com/docs/en/models/overview) |
| claude-opus-5-5 | Длительная работа с кодом и знаниями | $4 / $20 | 1000000 | [Официальная документация](https://platform.claude.com/docs/en/models/overview) |
| claude-sonnet-5-5 | Баланс скорости и возможностей | $2 / $10 | 1000000 | [Официальная документация](https://platform.claude.com/docs/en/models/overview) |
| claude-haiku-5-5 | Классификация, извлечение данных, маршрутизация | $0.1 / $0.5 · Цена от; зависит от режима | 1000000 | [Официальная документация](https://platform.claude.com/docs/en/models/overview) |
| gemini-3.1-flash-lite | Перевод, простая обработка данных, большой поток запросов | $0.25 / $1.5 | Не установлен | [Официальная документация](https://ai.google.dev/gemini-api/docs/pricing) |
| grok-4.7 | Код и универсальные задачи; в Nexus API доступен только текст | $2 / $6 | 500000 | [Официальная документация](https://docs.x.ai/developers/models) |
| qwen3:4b | Локальная обработка текста и дополнительная проверка ответа | Не установлен | 32768 | [Официальная документация](https://huggingface.co/Qwen/Qwen3-4B) |

## Все подключения каталога

Агент не равен модели: цена, скорость и качество ACP зависят от модели и настроенного провайдера. Классификация ниже описывает реализацию Nexus, а не обещает все возможности внешнего продукта.

| Подключение | Реализация в Nexus | Как определяются цена и качество |
|---|---|---|
| OpenAI Codex | Код, терминал, файлы и проверка результата. Вход с ChatGPT. | Квота аккаунта; характеристики точной версии отдельно |
| Claude Code | Работа с проектом, сложные изменения и тексты. Вход Anthropic. | Квота аккаунта; характеристики точной версии отдельно |
| Google Antigravity | Официальный ACP Google для личного входа. Отдельный runtime вместо старого Gemini CLI. | Модель выбирает runtime; требуется проверенное подключение ACP |
| Gemini CLI | Личные подписки переведены в Antigravity. Здесь доступны Gemini API и существующие корпоративные профили. | Модель выбирает runtime; требуется проверенное подключение ACP |
| Grok | Текстовый чат через официальный xAI API. Подписка Grok и API оплачиваются отдельно. | По точному ID; текущий API-адаптер только текстовый |
| Qwen · локально | Локальный Qwen через Ollama. Простые вопросы и дополнительная проверка текста без облачных токенов. | По точному ID; текущий API-адаптер только текстовый |
| Qwen Code | ACP-агент для кода на локальном qwen3:4b через Ollama. Настройки изолированы в Nexus. | Модель выбирает runtime; требуется проверенное подключение ACP |
| Goose | Установка официального бинарника и ACP. В Nexus использует локальный qwen3:4b через Ollama. | Модель выбирает runtime; требуется проверенное подключение ACP |
| OpenCode | Открытый агент с ACP. Для чата нужен настроенный провайдер. | Модель выбирает runtime; требуется проверенное подключение ACP |
| Aider | Доступен установщик через uv. ACP-адаптер в Nexus пока не реализован. | Нет адаптера чата |
| GitHub Copilot CLI | Подключается через ACP; доступ зависит от вашего плана GitHub. | Модель выбирает runtime; требуется проверенное подключение ACP |
| Kimi CLI | Установленный Kimi CLI подключается через ACP. | Модель выбирает runtime; требуется проверенное подключение ACP |
| Cline | Нужен установленный CLI с поддержкой ACP и настроенный провайдер. | Модель выбирает runtime; требуется проверенное подключение ACP |
| Amp | Нужны официальный CLI, аккаунт и совместимый ACP-адаптер. | Модель выбирает runtime; требуется проверенное подключение ACP |
| Свой API / LM Studio | OpenAI-совместимый сервер, свой endpoint и список моделей от сервера. | По точному ID; текущий API-адаптер только текстовый |

## Границы проверки

- Список моделей не подтверждает доступ к генерации или остаток средств.
- ACP сейчас предоставляет в дереве runtime-default. Отдельный выбор моделей через session/set_config_option не реализован; не показываем выдуманные модели. Для поддержки изображений сохраняется ответ initialize; старые подключения с неизвестным значением требуют переподключения.
- Grok Imagine, multi-agent, embedding/audio и служебная codex-auto-review не выбираются для обычного текстового адаптера. Медиа-тарифы остаются доступны для ознакомления.
- Точная стоимость успешного результата и победитель по качеству не установлены. Нужны одинаковые задания, версии и режимы, фактические токены, длительность, число повторов и доля пройденных проверок.
- Полезные критерии будущих измерений: прохождение тестов для кода; соблюдение требований для архитектуры; слепая оценка текста/перевода; точность извлечения по эталону; точность ответов по изображениям; время первого токена и всего ответа; доля успешно выполненных разрешённых инструментов. Стоимость делится на число успешных результатов, а не на число запросов.
- В рамках этой правки платные модельные прогоны не проводились.

## Проверки реализации

Автоматические проверки маршрутизации, стоимости, неизвестных версий, сохранения при переключении чата и ошибки записи — npm test. Rust проверяет обратную совместимость сериализации, выбор default и исключение неподдерживаемых моделей. Браузерный стенд tests/model-picker.html проверен отдельно от подключённых аккаунтов.

## Flowchart: how Auto picks a model (2026-11-15)

```mermaid
flowchart TD
  A[Message] --> B{Model chosen manually?}
  B -- yes --> M[Use it as is; incompatibility is an error, never a substitution]
  B -- no --> C[Classify the request: kind, files, images, needs actions?]
  C --> D[Candidates: Auto or “Auto inside agent”; drop custom ACP, incompatible models,\nFable unless priority = Quality]
  D --> E{Needs actions?\nexecution mode AND the text asks to do something, or files / project inspection}
  E -- yes --> E1[Only agents with tools: Claude Code, Codex, ACP]
  E -- no --> E2[All models incl. text-only API: Grok, local Qwen]
  E1 --> F
  E2 --> F{Short plain request?\nno code, files, translation, editing, < 160 chars, not Quality}
  F -- yes --> T[No benchmarks: local Qwen if connected, else the agent default]
  F -- no --> G[Pick the benchmark for the task type that rates the most candidates:\ncode → Coding Agent Index, tools → AutomationBench, text → Arena, reasoning → AA Intelligence]
  G --> H{Two or more rated models?}
  H -- no --> T
  H -- yes --> X[Drop agents whose limit is used up, unless all are]
  X --> I[Close group: within 0 points for Quality, 5 for Balance, 3 for Economy/Speed; Elo by intervals]
  I --> J{Priority}
  J -- Quality --> J1[Highest score; equal scores → faster]
  J -- Economy --> J2[Cheapest tariff among all rated]
  J -- Speed --> J3[Fastest among all rated]
  J -- Balance --> J4[Close group ordered by tariff × 100 / remaining limit %\nunknown limit counts as 50 %]
  J1 --> K[Ties: higher score → more limit left → ID]
  J2 --> K
  J3 --> K
  J4 --> K
  K --> R{At send: shortlist of 2+ and not a short plain request?}
  R -- yes --> S[Arbiter: local Qwen, else the cheapest cloud model\n(Claude Haiku / Codex Luna) on the account with most limit left.\nReturns kind, needsActions, pick + why]
  S --> S1{Same kind and needsActions as the rules?}
  S1 -- yes --> S2[Take its pick from the shortlist]
  S1 -- no --> S3[Re-run the tree with its kind/needsActions; take the tree's top]
  R -- no --> L
  S2 --> L
  S3 --> L
  L[Backend runs it on the first ready account of that agent;\na usage-limit error retries another account]
```

The arbiter never sees anything the tree did not compute: it gets the request (as untrusted data) and up
to four candidates with score, relative tariff and limit left, answers in a fixed JSON schema, and any
invalid answer, timeout (local 6 s, cloud 40 s) or missing model keeps the tree's choice. The live
preview under the composer stays rule-based; the arbiter runs only at send time.

## User feedback and catalog agents (2026-11-16)

- Every answer is remembered with the model and the kind of task (`note_answer_route`).
- Explicit rating (👍/👎) counts 2 and always wins. Without it, the next user message is judged
  (`answer-reaction.js`): moving on or thanks → +1; a correction → −1; a clarifying question → nothing;
  “what you did earlier does not work” → the success of one of the recent answers is taken back (−1).
- Inside the close group the satisfaction s = (up+1)/(up+down+2) multiplies the Balance metric by
  (1.5 − s) and breaks ties before the remaining limit. At send time s is sampled from Beta(up+1, down+1)
  (Thompson sampling), so a poorly rated model still gets an occasional second chance and a barely tried
  one is explored; the live preview uses the mean.
- Verified catalog agents without published scores (Copilot, Kimi, Cline, Amp, OpenCode, Goose, Aider,
  Qwen Code, …) join the close group as equals at its lower bound, except for the Quality priority and
  deep reasoning; their ratings then decide how often they are used.

## Team ratings

With “Share ratings with the team” on in project settings, each user's counts for the project go to `.nexus/model-ratings/<install id>.json` in the working folder. Commit it; Nexus merges the other files found there into the feedback stats for that project (own file excluded, files over 512 KB and beyond 200 files ignored).
