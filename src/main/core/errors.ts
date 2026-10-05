/** Error con mensaje apto para el usuario final y código estable. El detalle técnico va a logs. */
export class AppError extends Error {
  constructor(
    public code: string,
    public userMessage: string,
    public detail?: unknown,
  ) {
    super(userMessage);
    this.name = 'AppError';
  }
}

export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} no existe o fue eliminado.`);
export const forbidden = () => new AppError('FORBIDDEN', 'No tienes permiso para realizar esta acción.');
export const invalid = (msg: string) => new AppError('VALIDATION', msg);
