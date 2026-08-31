import { Model, Table as SequelizeTable, TableOptions, Column, AllowNull, DataType } from 'sequelize-typescript';
import { RequestContext } from '../request-context';

/**
 * Options accepted by the extended `@Table` decorator. All standard
 * sequelize-typescript options are forwarded verbatim; the extra flat
 * options are intercepted to wire model-level features.
 */
export interface IExtendedTableOptions<M extends Model = Model> extends TableOptions<M> {
  /**
   * Same shape as Sequelize's `updatedAt`:
   *   `true`   → stamp the column named `'updatedBy'` (default)
   *   `false`  → disabled
   *   `string` → stamp a column of that name
   *
   * The physical column must exist on the model — the hook silently
   * no-ops when the field isn't declared, mirroring how `updatedAt`
   * behaves without `timestamps`.
   */
  updatedBy?: boolean | string;
}

/**
 * Drop-in replacement for sequelize-typescript's `@Table`.
 *
 * When `updatedBy` is enabled (default), write-time hooks stamp the
 * column from the ambient {@link RequestContext} on every
 * create/update/upsert path. No bootstrap call required.
 *
 * ```ts
 * import { Table } from '@all41-dev/server.types';
 *
 * @Table({ tableName: 'iam_refresh_token', timestamps: true })
 * export class DbRefreshToken extends Model<DbRefreshToken> { ... }
 * ```
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

function toSnakeCase(input: string): string {
  return input.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function declareUpdatedByColumn(target: any, field: string): void {
  const proto = target.prototype;
  const existing = (target.rawAttributes ?? {})[field];
  if (existing) return;

  Column({ type: DataType.UUID, field: toSnakeCase(field) })(proto, field);
  AllowNull(true)(proto, field);
}

function installAuditHooks(model: any, field: string): void {
  const hasField = (): boolean => field in ((model.rawAttributes ?? model.getAttributes?.() ?? {}) as Record<string, unknown>);

  const stamp = (target: any): void => {
    const userId = RequestContext.userId;
    if (userId === undefined || userId === null) return;
    if (!hasField()) return;
    if (typeof target?.setDataValue === 'function') {
      target.setDataValue(field, userId);
    } else {
      target[field] = userId;
    }
  };

  const addHook = (name: string, fn: (...args: any[]) => void): void => {
    if (typeof model.addHook === 'function') {
      try {
        model.addHook(name, fn);
        return;
      } catch {
        /* fallthrough */
      }
    }
    (model._pendingHooks ??= []).push({ name, fn });
    if (!model._initPatched) {
      model._initPatched = true;
      const originalInit = model.init;
      model.init = function (this: any, ...args: any[]): any {
        const res = originalInit.apply(this, args);
        for (const h of this._pendingHooks ?? []) this.addHook(h.name, h.fn);
        this._pendingHooks = [];
        return res;
      };
    }
  };

  addHook('beforeCreate', (instance: any) => stamp(instance));
  addHook('beforeUpdate', (instance: any) => stamp(instance));
  addHook('beforeSave', (instance: any) => stamp(instance));
  addHook('beforeUpsert', (values: any) => stamp(values));
  addHook('beforeBulkCreate', (instances: any[]) => instances.forEach(stamp));

  addHook('beforeBulkUpdate', (opts: any) => {
    const userId = RequestContext.userId;
    if (userId === undefined || userId === null) return;
    if (!hasField()) return;
    opts.attributes = opts.attributes ?? {};
    opts.attributes[field] = userId;
    if (Array.isArray(opts.fields) && !opts.fields.includes(field)) opts.fields.push(field);
  });
}
