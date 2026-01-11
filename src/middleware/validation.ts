import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';

/**
 * Validate meeting code format (6 alphanumeric characters)
 */
export function validateMeetingCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code);
}

/**
 * Middleware to validate meeting code in URL params
 */
export function validateMeetingCodeParam(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const code = req.params.code?.toUpperCase();

  if (!code || !validateMeetingCode(code)) {
    throw new AppError('Invalid meeting code format', 400, {
      code: 'INVALID_MEETING_CODE',
      expected: '6 uppercase alphanumeric characters',
    });
  }

  req.params.code = code;
  next();
}

/**
 * Validate user input length
 */
export function validateInputLength(
  input: string | unknown,
  maxLength: number = 1000
): boolean {
  if (typeof input !== 'string') return false;
  return input.length > 0 && input.length <= maxLength;
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Middleware for request body validation
 */
export function validateRequestBody(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  // Content length check
  const contentLength = req.headers['content-length'];
  if (contentLength && parseInt(contentLength) > 1048576) { // 1MB limit
    throw new AppError('Request body too large', 413, {
      maxSize: '1MB',
      received: contentLength,
    });
  }

  next();
}
