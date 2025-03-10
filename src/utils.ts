import { DateTime } from "luxon";
import { Response } from "express";
import { Model } from 'sequelize-typescript';
import { Logger } from "winston";


export class Utils {
  private static _inst: Utils;
  private logger?: Logger;

  private constructor(logger?: Logger) {
    this.logger = logger;
  }

  public static get inst(): Utils { return Utils._inst || (Utils._inst = new Utils()); }


  public dateToDateTime<T extends any | Array<any>>(obj: T): T {
    const localObj = obj as any;
    if (localObj instanceof Model) {
      // limit conversion to datValues when object is of type Model
      localObj.dataValues = Utils.inst.dateToDateTime(localObj.dataValues);
    } else {
      Object.keys(localObj).forEach((key: any) => {
        if (localObj[key] instanceof Date) localObj[key] = DateTime.fromJSDate(localObj[key]);
        else if (Array.isArray(localObj[key])) localObj[key].forEach((elem: any) => {
          if (typeof elem === 'object') Utils.inst.dateToDateTime(elem);
          else if (elem instanceof Date) elem = DateTime.fromJSDate(elem);
        })
        else if (![undefined, null].includes(localObj[key]) && typeof localObj[key] === 'object') Utils.inst.dateToDateTime(localObj[key]);
      });
    }
    return localObj as T;
  }
  public handleCatch(error: Error, res: Response) {
    // TODO: find a way to make the logger work 
    // Server.logger.error(error.message, error);
    if (this.logger) {
      this.logger.error(error.message, { error });
    }
    res.status(500).send({ error: error.message });
  }
}
