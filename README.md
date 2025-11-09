# vite-template

> **A Vanilla Vite starter kit with opinionated linting, formatting, and streamlined developer workflows.**

[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Prettier](https://img.shields.io/badge/Prettier-F7B93E?logo=prettier&logoColor=white)](https://prettier.io/)
[![ESLint](https://img.shields.io/badge/ESLint-4B32C3?logo=eslint&logoColor=white)](https://eslint.org/)
[![Stylelint](https://img.shields.io/badge/Stylelint-263238?logo=stylelint&logoColor=white)](https://stylelint.io/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Concurrently](https://img.shields.io/badge/Concurrently-FF5733?logo=javascript&logoColor=white)](https://www.npmjs.com/package/concurrently)

## Dependencies

- **prettier**: Enforces consistent code formatting.

- **eslint** + **@eslint/js**: Lints JavaScript for common mistakes and enforces best practices.

- **eslint-config-prettier**: Turns off ESLint rules that would conflict with Prettier.

- **stylelint** + **sylelint-config-standard**: CSS linting based on standard conventions, improving maintainability of styles.

- **stylelint-order**: Enforces logical property grouping and ordering for cleaner stylesheets.

- **concurrently**: Runs multiple linters in watch mode at once with clean, organized output.

## Config Files

**.eslint.config.mjs**

> Uses the flat ESLint config with @eslint/js as the base. Adds Prettier compatibility and a small set of project-agnostic quality rules (e.g., no-var, prefer-const).

**.stylelintrc.json**

> Extends stylelint-config-standard with custom property groups and ordering logic. Prioritizes CSS readability and visual hierarchy by grouping properties like layout, box model, and typography.

**.prettierrc**

> A concise Prettier setup enforcing single quotes, semi-colons, and a consistent print width (80) for balanced readability and diff clarity.

**.prettierignore**

> Excludes folders like dist, node_modules, and build artifacts from formatting to speed up Prettier runs and avoid unnecessary churn.

## Default Scripts

- `dev`: Start Vite development server.

- `build`: Build the app for production.

- `preview`: Preview the production build locally.

- `lint:js`: Run JS linter.

- `lint:css`: Run CSS linter.

- `lint`: Run both JS and CSS linters.

- `format`: Format all files with Prettier.

- `format:check`: Check formatting without applying changes.

- `fix:all`: Auto-fix lint and formatting issues.

- `watch`: Watching JS and CSS for linting and auto-fixing in real time.
