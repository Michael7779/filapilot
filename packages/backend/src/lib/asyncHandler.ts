import type { Request, RequestHandler, Response } from "express";

// Express 4 faengt abgelehnte Promises in async-Handlern nicht selbst ab - ohne diese Huelle wuerde
// ein Datenbankfehler zu einer unbehandelten Rejection fuehren und den ganzen Prozess beenden.
export function asyncHandler(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}
