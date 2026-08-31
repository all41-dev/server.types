import { AsyncLocalStorage } from 'node:async_hooks';
import { NextFunction, Request, RequestHandler, Response } from 'express';

export interface IRequestContextStore {
  userId?: unknown;
  [key: string]: unknown;
}

/**
 * Ambient per-request context propagated across async boundaries via
 * `AsyncLocalStorage`. Set once in a middleware, read from anywhere
 * within the same request (repository, service, sequelize hook, ...).
 */
export class RequestContext {
  private static readonly _storage = new AsyncLocalStorage<IRequestContextStore>();

  /** Runs `fn` with `store` as the active context. */
  public static run<T>(store: IRequestContextStore, fn: () => T): T {
    return RequestContext._storage.run(store, fn);
  }

  public static get store(): IRequestContextStore | undefined {
    return RequestContext._storage.getStore();
  }

  public static get userId(): unknown {
    return RequestContext._storage.getStore()?.userId;
  }

  public static set(key: string, value: unknown): void {
    const store = RequestContext._storage.getStore();
    if (store) store[key] = value;
  }

  /**
   * Express middleware that opens a context for the lifetime of the request.
   * `extractUser` typically pulls the user id from the decoded JWT.
   */
  public static middleware(extractUser: (req: Request) => unknown): RequestHandler {
    return (req: Request, _res: Response, next: NextFunction): void => {
      RequestContext._storage.run({ userId: extractUser(req) }, () => next());
    };
  }
}
