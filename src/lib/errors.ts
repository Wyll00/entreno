export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const notFound = (what = "Registro") => new AppError(404, "not_found", `${what} no encontrado.`);
export const badRequest = (message: string) => new AppError(400, "invalid", message);
