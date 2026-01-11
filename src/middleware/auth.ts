import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      auth?: any;
    }
  }
}

export function verifyAuth(req:Request, res:Response, next:NextFunction) {
  const header = req.headers.authorization;
  if (!header) return res.sendStatus(401);

  try {
    const token = header.split(" ")[1];
    if (!token) return res.sendStatus(401);
    
    const secret = process.env.BETTERAUTH_SECRET;
    if (!secret) return res.sendStatus(401);
    
    req.auth = jwt.verify(token, secret as string);
    next();
  } catch {
    res.sendStatus(401);
  }
}
