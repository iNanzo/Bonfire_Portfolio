/** An error with an HTTP status the API passes straight to the client (plus any extra fields). */
export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
