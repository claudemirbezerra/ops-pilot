export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidCatalogError extends DomainError {}

export class InvalidDatabaseConfigError extends DomainError {}

export class InvalidAlertStatusError extends DomainError {}

export class UnknownServiceError extends DomainError {}

export class UnknownIncidentError extends DomainError {}

export class InvalidIncidentInputError extends DomainError {}

export class RunbookNotFoundError extends DomainError {}

export class MissingModelConfigError extends DomainError {}

export class UnknownStrategyError extends DomainError {}

export class InvalidRouteError extends DomainError {
  constructor(message = "Não foi possível decidir a rota.") {
    super(message);
  }
}

export class EmptyStrategySelectionError extends DomainError {}

export class InvalidMaxReflectionsError extends DomainError {}

export class ConversationNotFoundError extends DomainError {}

export class RequestNotFoundError extends DomainError {
  constructor(message = "Request não encontrado.") {
    super(message);
  }
}

export class InvalidConversationMessageError extends DomainError {}

export class InvalidMemoryInputError extends DomainError {}

export class MemoryNotFoundError extends DomainError {}

export class EmbeddingUnavailableError extends DomainError {}

export class ModelUnavailableError extends DomainError {
  constructor(message = "Modelo indisponível.") {
    super(message);
  }
}

export class UserIdRequiredError extends DomainError {
  constructor(
    message = "userId é obrigatório para esquecer preferências da memória.",
  ) {
    super(message);
  }
}

export class ChatTimeoutError extends DomainError {
  constructor(timeoutMs: number) {
    const seconds = timeoutMs / 1000;
    super(`Tempo esgotado: a resposta não ficou pronta em ${seconds} segundos.`);
  }
}
