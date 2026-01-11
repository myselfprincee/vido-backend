import "express";

declare module "express-serve-static-core" {
  interface Request {
    auth?: {
      sub: string;
      [key: string]: any;
    };
  }
}
