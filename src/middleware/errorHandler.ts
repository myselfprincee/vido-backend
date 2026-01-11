import { Request, Response, NextFunction } from 'express';

export interface ApiError {
  statusCode: number;
  message: string;
  data?: unknown;
  stack?: string;
}

export class AppError extends Error implements ApiError {
  statusCode: number;
  data?: unknown;

  constructor(message: string, statusCode: number = 500, data?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.data = data;
    this.name = 'AppError';
  }
}

/**
 * Async route wrapper to catch errors
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Global error handling middleware
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  let statusCode = 500;
  let message = 'Internal Server Error';
  let data: unknown;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    data = err.data;
  } else if (err instanceof Error) {
    message = err.message;
  }

  console.error(isDevelopment ? err : `[${new Date().toISOString()}] ${message}`);

  const errorResponse: Record<string, unknown> = {
    message,
  };

  if (isDevelopment && err instanceof Error) {
    errorResponse.stack = err.stack;
  }

  if (data) {
    errorResponse.details = data;
  }

  res.status(statusCode).json({
    success: false,
    error: errorResponse,
  });
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(
  _req: Request,
  res: Response
) {
  res.status(404).json({
    success: false,
    error: {
      message: 'Not Found',
    },
  });
}
