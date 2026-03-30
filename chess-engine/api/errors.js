export class InvalidMoveError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidMoveError';
  }
}

export class InvalidFENError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidFENError';
  }
}
