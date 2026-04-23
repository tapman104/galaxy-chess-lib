export class InvalidMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMoveError';
  }
}

export class InvalidFENError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFENError';
  }
}
