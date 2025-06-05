# @all41/server.types

`@all41/server.types` is a foundational TypeScript package that provides **shared types, generic controllers, and base repository logic** for backend services.

---

## Features

* Shared **TypeScript types** and interfaces for DTOs, models, and API responses
* **Generic repository layer** for working with Sequelize
* **Base controller classes** for standardized CRUD operations
* Lightweight and easy to integrate into Node.js/Express-based backends

---

## Installation

Install the package via npm:

```bash
npm install @all41/server.types
```

---

## Usage

### 1. **Extending a Base Repository**

Create a repository by extending the `RepositorySequelize` class:

```ts
import { RepositorySequelize } from "@all41-dev/server.types";
import { ExampleTable } from "../db/example-table";

export class RepositoryExample extends RepositorySequelize<ExampleTable> {
  constructor() {
    super(ExampleTable);
  }

  public async init() {
    return this;
  }
}
```

### 2. **Using a Generic Controller**

Use the provided base controller to quickly expose repository methods as routes:

```ts
import { Router } from "express";
import { RepositoryExample } from "../../repositories/example-repository";
import { ControllerRepositoryReadWrite } from "@all41-dev/server.types";

export class ControllerExample extends ControllerRepositoryReadWrite<RepositoryExample> {
  private repositoryExample: RepositoryExample;

  constructor() {
    const repositoryExample = new RepositoryExample();
    super();
    this.repositoryExample = repositoryExample;
  }

  public static create(): Router {
    const controller = new ControllerExample();
    return controller.create(controller.repositoryExample);
  }
}
```

This pattern provides plug-and-play RESTful controllers with minimal boilerplate.

---

## Testing

To run unit tests:

```bash
npm test
```