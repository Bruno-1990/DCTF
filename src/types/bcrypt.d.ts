declare module 'bcrypt' {
  export function compare(data: string, hash: string): Promise<boolean>;
  export function hash(data: string, rounds: number): Promise<string>;
}
