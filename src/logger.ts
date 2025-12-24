import pino from "pino";
import { config } from "./config";

export const logger = pino({
    level: config.logLevel,
});

export function logRaw(obj: any) { // this is to have logs as task required, without addons from pino
    console.log(JSON.stringify(obj));
}