export type User = {
  readonly id: number;
  username: string;
  email: string;
  password: string;
  salt: string;
  public_id: string;
  created_at?: Date;
};
