import { Model, Table as SequelizeTable, TableOptions, Column, AllowNull, DataType, getAttributes } from 'sequelize-typescript';
import { RequestContext } from '../request-context';

export type ModelClass<M extends Model = Model> = (new () => M) & typeof Model;

let _userModel: ModelClass | null = null;

export function setUserTable(model: ModelClass): void {
  _userModel = model;
}

export function getUserTable(): ModelClass {
  if (!_userModel) {
    throw new Error('[model-base] User table is not registered. ' + 'Call setUserTable(UserTable) before sequelize.addModels() / DB init.');
  }
  return _userModel;
}

interface IAuditedModelStatic {
  rawAttributes?: Record<string, unknown>;
  getAttributes?: () => Record<string, unknown>;
  initialize?: (...args: any[]) => any;
  name: string;
  addHook: (name: string, fn: (...args: any[]) => void) => void;
  upsert?: (values: any, options?: any) => any;
  prototype: any;
  __auditPatched?: boolean;
  __auditHooksInstalled?: boolean;
}

export interface IExtendedTableOptions<M extends Model = Model> extends TableOptions<M> {
  updatedBy?: boolean | string;
}

/**
 * Drop-in replacement for sequelize-typescript's `@Table`.
 *
 * When `updatedBy` is enabled (default), write-time hooks stamp the
 * column from the ambient {@link RequestContext} on every
 * create/update/upsert path. No bootstrap call required.
 */
export function Table<M extends Model = Model>(options: IExtendedTableOptions<M> = {} as IExtendedTableOptions<M>): (target: any) => void {
  const { updatedBy = true, ...rest } = options;
  const decorateTable = SequelizeTable(rest as TableOptions<M>);

  return (target: any): void => {
    if (updatedBy !== false) {
      const field = typeof updatedBy === 'string' ? updatedBy : 'updatedBy';
      declareUpdatedByColumn(target, field);
      decorateTable(target);
      installAuditHooks(target, field);
    } else {
      decorateTable(target);
    }
  };
}

function declareUpdatedByColumn(target: any, field: string): void {
  const proto = target.prototype;
  // Before `Model.init` runs, declared columns live in reflect metadata
  // (`rawAttributes` is only populated during initialization), so both
  // locations must be checked to avoid clobbering a user-declared column.
  const existing = (target.rawAttributes ?? {})[field] ?? (getAttributes(proto) ?? {})[field];
  if (existing) return;

  Column({ type: DataType.UUID })(proto, field);
  AllowNull(true)(proto, field);
}

function installAuditHooks(model: IAuditedModelStatic, field: string): void {
  const hasField = (cls: IAuditedModelStatic): boolean => field in (cls.rawAttributes ?? cls.getAttributes?.() ?? getAttributes(cls.prototype) ?? {});

  const stamp = (cls: IAuditedModelStatic, target: any, options?: { fields?: string[] }): void => {
    const userId = RequestContext.userId;

    if (userId === undefined || userId === null) return;
    if (!hasField(cls)) return;

    if (typeof target?.setDataValue === 'function') {
      target.setDataValue(field, userId);
    } else if (target) {
      target[field] = userId;
    }

    if (options && Array.isArray(options.fields) && !options.fields.includes(field)) {
      options.fields.push(field);
    }
  };

  const registerHooks = (cls: IAuditedModelStatic): void => {
    if (cls.__auditHooksInstalled) return;
    cls.__auditHooksInstalled = true;

    cls.addHook('beforeCreate', (instance: any, options: any) => stamp(cls, instance, options));
    cls.addHook('beforeUpdate', (instance: any, options: any) => stamp(cls, instance, options));
    cls.addHook('beforeSave', (instance: any, options: any) => stamp(cls, instance, options));
    cls.addHook('beforeBulkCreate', (instances: any[], options: any) => instances.forEach((i) => stamp(cls, i, options)));

    cls.addHook('beforeBulkUpdate', (opts: any) => {
      const userId = RequestContext.userId;
      if (userId === undefined || userId === null) return;
      if (!hasField(cls)) return;

      opts.attributes = opts.attributes ?? {};
      opts.attributes[field] = userId;

      if (Array.isArray(opts.fields) && !opts.fields.includes(field)) {
        opts.fields.push(field);
      }
    });

    if (typeof cls.upsert === 'function') {
      const originalUpsert = cls.upsert;
      cls.upsert = function (this: IAuditedModelStatic, values: any, options: any): any {
        const userId = RequestContext.userId;
        const target = this ?? cls;
        if (userId !== undefined && userId !== null && hasField(target) && values !== null && typeof values === 'object') {
          values = { ...values, [field]: userId };
        }
        return originalUpsert.call(target, values, options);
      };
    }
  };

  if (typeof model.initialize === 'function' && !model.__auditPatched) {
    model.__auditPatched = true;
    const baseInitialize = model.initialize;
    model.initialize = function (this: IAuditedModelStatic, ...args: any[]): any {
      const res = baseInitialize.apply(this, args);
      registerHooks(this);
      return res;
    };
  } else if (typeof model.addHook === 'function') {
    try {
      registerHooks(model);
    } catch {
      /* not initialisable at decoration time; nothing else to do */
    }
  }
}
