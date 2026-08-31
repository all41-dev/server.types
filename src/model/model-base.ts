import { Model, Table as SequelizeTable, TableOptions } from 'sequelize-typescript';
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
export function Table<M extends Model = Model>(options: IExtendedTableOptions<M> = {} as IExtendedTableOptions<M>): Function {
  const { updatedBy = true, ...rest } = options;
  const decorateTable = SequelizeTable(rest as TableOptions<M>);
  return (target: any): void => {
    decorateTable(target);
    if (updatedBy !== false) {
      installAuditHooks(target, typeof updatedBy === 'string' ? updatedBy : 'updatedBy');
    }
  };
}

function installAuditHooks(model: any, field: string): void {
  const hasField = (): boolean => field in ((model.rawAttributes ?? {}) as Record<string, unknown>);

  const stamp = (target: any): void => {
    const userId = RequestContext.userId;
    if (userId === undefined || userId === null) return;
    if (!hasField()) return;
    target[field] = userId;
  };

  model.addHook('beforeCreate', (instance: any) => stamp(instance));
  model.addHook('beforeUpdate', (instance: any) => stamp(instance));
  model.addHook('beforeUpsert', (values: any) => stamp(values));
  model.addHook('beforeBulkCreate', (instances: any[]) => instances.forEach(stamp));

  // Model.update() path — mutate the shared `attributes` bag and register the field for write.
  model.addHook('beforeBulkUpdate', (opts: any) => {
    const userId = RequestContext.userId;
    if (userId === undefined || userId === null) return;
    if (!hasField()) return;
    opts.attributes = opts.attributes ?? {};
    opts.attributes[field] = userId;
    if (Array.isArray(opts.fields) && !opts.fields.includes(field)) opts.fields.push(field);
  });
}
