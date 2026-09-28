# React + TypeScript + Vite

## Запуск

```sh
npm install
cp .env.example .env
npm run dev
```

Адреса сервисов и флаги моков задаются в `.env`, описание каждого — в `.env.example`. Мок включается
только строкой `true`; без неё запрос идёт на бэкенд.

### Демо-режим для видео

`VITE_DEMO=true` включает разом все моки, нужные для показа кабинета без живого стенда: монитор занятия,
назначения, обучаемых, справочник служб, сценарии, разбор попыток и генерацию ИИ.

```sh
VITE_DEMO=true npm run dev
```

Отдельные флаги `VITE_MOCK_*` продолжают работать: без демо-режима можно замокать только нужное,
например `VITE_MOCK_AI=true`, пока на бэкенде нет ручек генерации.

## Архитектура FSD

Зависимости направлены вниз: app → pages → widgets → features → entities → shared.

- `app` — запуск приложения, провайдеры, маршрутизация, глобальные стили и интеграция HTTP-клиента с сессией (обработка 401).
- `pages/login-page` — оформление страницы входа и её фон; сама форма находится в feature.
- `pages/workspace-page` — композиция рабочего места, выбор происшествия, список и просмотр карточки. Эти два компонента специфичны для страницы и остаются в её `ui`.
- `pages/error-page` — экран непредвиденной ошибки.
- `widgets/workspace-header` — шапка рабочих мест всех ролей, включая часы и действия профиля.
- `features/auth` — форма входа, проверка демонстрационной учётной записи и кнопка выхода.
- `entities/session` — текущая роль и хранение сессии.
- `entities/incident` — типы происшествий и демонстрационный источник данных.
- `shared/ui` — базовые компоненты без бизнес-логики; `shared/api` — HTTP-клиент и обработчик ошибок; `shared/config` — конфигурация окружения.

Внутри слайса используются сегменты по назначению: `ui`, `model`, `api`, `assets`. Не нужно создавать пустые сегменты или выносить каждый компонент в отдельный слайс.

Внешние импорты идут через публичный `index.ts`: например, `@/entities/session` или `@/shared/ui`. Внутренние импорты слайса — относительные; выходить ими за границы слайса нельзя. Слайсы одного слоя не импортируют друг друга. В `app` и `shared` слайсов нет, их сегменты могут взаимодействовать.

ESLint проверяет алиасные импорты: запрещает зависимости вверх, между слайсами одного слоя и обход публичного API. Относительные пути и импорты в SCSS дополнительно проверяются при ревью.

Проверки без сборки и запуска сервера:

```sh
npm run lint
node node_modules/typescript/bin/tsc --noEmit --project tsconfig.app.json
node node_modules/typescript/bin/tsc --noEmit --project tsconfig.node.json
```

Основа: [слои FSD](https://fsd.how/docs/reference/layers/) и [публичный API](https://fsd.how/docs/reference/public-api/).

## Исходный шаблон

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default tseslint.config({
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

- Replace `tseslint.configs.recommended` to `tseslint.configs.recommendedTypeChecked` or `tseslint.configs.strictTypeChecked`
- Optionally add `...tseslint.configs.stylisticTypeChecked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and update the config:

```js
// eslint.config.js
import react from 'eslint-plugin-react'

export default tseslint.config({
  // Set the react version
  settings: { react: { version: '18.3' } },
  plugins: {
    // Add the react plugin
    react,
  },
  rules: {
    // other rules...
    // Enable its recommended rules
    ...react.configs.recommended.rules,
    ...react.configs['jsx-runtime'].rules,
  },
})
```
