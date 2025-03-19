import { DateTime } from "luxon";
import { Response } from "express";
import { Model } from 'sequelize-typescript';
import winston from "winston";


export class Utils {
  private static _inst: Utils;
  private readonly logger: winston.Logger;

  private constructor() {
    this.logger = winston.createLogger({
      level: "info",
      format: winston.format.json(),
      levels: {
        emerg: 0,
        alert: 1,
        crit: 2,
        error: 3,
        warning: 4,
        notice: 5,
        info: 6,
        debug: 7
      },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });
  }

  public static get inst(): Utils { return Utils._inst || (Utils._inst = new Utils()); }


  public dateToDateTime<T extends any | Array<any>>(obj: T): T {
    const localObj = obj as any;
    if (localObj instanceof Model) {
      // Limit conversion to dataValues when object is of type Model
      localObj.dataValues = Utils.inst.dateToDateTime(localObj.dataValues);
    } else {
      Object.keys(localObj).forEach((key: any) => {
        if (localObj[key] instanceof Date) {
          localObj[key] = DateTime.fromJSDate(localObj[key]);
        } else if (Array.isArray(localObj[key])) {
          localObj[key].forEach((elem: any, index: number) => {
            if (elem instanceof Date) {
              localObj[key][index] = DateTime.fromJSDate(elem);
            } else if (typeof elem === 'object') {
              Utils.inst.dateToDateTime(elem);
            }
          });
        } else if (localObj[key] !== undefined && localObj[key] !== null && typeof localObj[key] === 'object') {
          Utils.inst.dateToDateTime(localObj[key]);
        }
      });
    }
    return localObj as T;
  }
  public handleCatch(error: Error, res: Response) {
    // TODO: find a way to make the logger work 
    // Server.logger.error(error.message, error);
    this.logger.error(error.message, error);
    res.status(500).send({ error: error.message });
  }
}
