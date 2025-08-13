import { Model, ModelStatic, Repository as SequelizeNativeRepository, } from "sequelize-typescript";
import { FindOptions, SaveOptions, Includeable, } from "sequelize";
import { IPkName, Repository, IRepositoryReadable, IRepositoryWritableDb, } from "./repository";
import { Utils } from "../utils";

export class RepositorySequelize<T extends Model<T> & IPkName<T>> implements Repository<T>, IRepositoryReadable<T>, IRepositoryWritableDb<T> {
  public readonly modelType: ModelStatic<T>;

  constructor(type: ModelStatic<T>) {
    this.modelType = type;
  }

  protected get _sequelizeRepository(): SequelizeNativeRepository<T> {
    if (!this.modelType)
      throw new Error(
        `Repository for '${this.modelType}' not found`
      );
    return this.modelType as SequelizeNativeRepository<T>;
  }

  public async post(object: T): Promise<T> {
    return await this._sequelizeRepository.create(object as any);
  }
  public async delete(key: any): Promise<void> {
    const recordToDelete = await this.getByKey(key);
    if (recordToDelete) {
      await recordToDelete.destroy();
    } else {
      throw new Error(`No record found with key '${key}'`);
    }
  }

  public async getByKey(key: any, options?: FindOptions<T>): Promise<T> {
    if ([undefined, null].includes(key))
      throw new Error("getByKey invoked without key value");

    if (options?.include)
      options.include = this._generateIncludes(options?.include);
    const localOptions = {
      [this._sequelizeRepository.primaryKeyAttribute]: key,
    };
    Object.assign(localOptions, options);

    const result = await this._sequelizeRepository.findByPk(key, options);
    if (result === null)
      throw new Error(
        `No record found with key '${key} on repository '${this.modelType.constructor.name}`
      );
    Utils.inst.dateToDateTime(result);
    return result;
  }
  public async get(options: FindOptions<T>): Promise<T[]> {
    // in case repository mode has limitations
    // const result = await this.modelType.findAll(options);

    // const foo: Includeable = {
    //   isAliased: true,
    // };

    if (options?.include)
      options.include = this._generateIncludes(options.include);
    const result = await this._sequelizeRepository.findAll(options);
    Utils.inst.dateToDateTime(result);
    return result;
  }
  public async patch(
    key: any,
    object: Partial<T>,
    options?: SaveOptions<T>
  ): Promise<T> {
    const foundRecord = await this.getByKey(key);
    const rawAttributes = (this.modelType as any).rawAttributes;
    if (rawAttributes) {
      const virtualAttrs = Object.entries(rawAttributes)
        .filter(([_, attr]: any) => attr.type?.key === 'VIRTUAL')
        .map(([name]) => name as keyof T);

      for (const v of virtualAttrs) {
        if (v in object) {
          delete object[v];
        }
      }
    }
    let result = await foundRecord.set(object).save();
    if (options) {
      result = await this.getByKey(options);
    }
    return result as any;
  }

  protected _generateIncludes(include: any): Includeable[] {
    if (!include) return [];
    if (typeof include === "string") {
      include = [include];
    }
    if (Array.isArray(include)) {
      for (const i in include) {
        if (typeof include[i] === 'string') {
          const splited = include[i].split("/");
          if (splited.length > 1) {
            const nested: Includeable = { association: splited[0] };
            let currentNested = nested;
            for (let j = 1; j < splited.length; j++) {
              const subNested: Includeable = { association: splited[j] };
              currentNested.include = [subNested];
              currentNested = subNested;
            }
            include[i] = nested;
          }
        }
      }
    }
    return include;
  }
}
