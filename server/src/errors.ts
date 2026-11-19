export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
export const bad = (m: string) => new ApiError(400, 'invalid', m);
export const unauthorized = (m = 'Please sign in') => new ApiError(401, 'unauthorized', m);
export const forbidden = (m = 'You do not have access') => new ApiError(403, 'forbidden', m);
export const notFound = (m = 'Not found') => new ApiError(404, 'not_found', m);
