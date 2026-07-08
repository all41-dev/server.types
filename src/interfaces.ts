import { Ui } from './ui';
import AMQP from 'amqplib';
import { WebSocketServer } from 'ws';
import { Api } from './api';

export interface IRouteOptions extends IMuteable {
  baseRoute: string;
}

export interface IApiOptions<T extends Api<any>> extends IRouteOptions {
  type: { new(options: IApiOptions<T>): T };
  config?: any;
  requireAuth?: boolean;
  amqp?: string;
}

export interface IJobOptions extends IMuteable {
  schedule: string;
  function: () => any;
  name: string;
  code: string;
  config?: any;
  executeOnStart: boolean;
  context?: any;
}

export interface IUiOptions<T extends Ui<any>> extends IRouteOptions {
  type: { inst: T; new(options: IUiOptions<T>): T };
  config?: any;
  requireAuth?: boolean;
  requireScope?: string[];
}

export interface IAmqpOptions extends IMuteable {
  params: AMQP.Options.Connect;
  connection?: AMQP.Connection;
  channels: { [key: string]: AMQP.Channel };
}

export interface IStaticRouteOptions extends IRouteOptions {
  ressourcePath: string;
  config?: any;
  requireAuth?: boolean;
  getRoutes?: { path: string, handler: (req: any, res: any) => void }[]
}

export interface IWsOptions {
  server: WebSocketServer;
  requireAuth?: boolean;
  path: string;
}

export interface IMuteable {
  mute?: boolean;
}
