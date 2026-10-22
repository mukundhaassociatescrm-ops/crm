# FrontEnd

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 17.3.5.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Deploy To GitHub Pages

This app is configured for GitHub Pages using hash-based routing, which avoids 404 issues on browser refresh.

1. Install dependencies:

```bash
npm install
```

2. Build for GitHub Pages:

```bash
npm run build:gh-pages
```

3. Deploy the generated app:

```bash
npm run deploy:gh-pages
```

4. In your GitHub repository settings:

- Open `Settings`
- Open `Pages`
- Set the source to the `gh-pages` branch

Notes:

- Angular 17 application builds place browser assets in `dist/front-end/browser`.
- The GitHub Pages deploy step must publish `dist/front-end/browser`, not `dist/front-end`.
- Routing is configured with hashes, so URLs will look like `/#/manage-task` and will work on GitHub Pages.
- Production builds use the repo base path `/crm-app/`.
- Update `src/environments/environment.prod.ts` with your deployed backend URL before publishing, for example `https://your-api-host.com`.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Employee navigation and access

Employees use the shared sidebar, with Dashboard linking to `/employee-dashboard`.
Their menu contains the same Communication and Customer Management pages as the
admin menu:

- Communication: Chats, WhatsApp Campaigns, Campaign Tracking, Bulk SMS, Quick SMS.
- Customer Management: Clients and Groups.

Employees can perform the same actions in these pages, including managing shared
clients/groups, sending messages, controlling campaigns, and removing chat messages.
Client access is not limited to assigned clients. Active posters are available for
campaign selection, but Poster Management remains admin-only.

Task Management Payment/Report, employee administration, invoices, work history,
SMS template administration, and campaign limit settings retain their existing
admin restrictions. Deploy the backend permission changes together with the
frontend; showing a menu alone does not grant API access.

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.
