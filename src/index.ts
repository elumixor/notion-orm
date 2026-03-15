import { people } from "../generated/people";

export default class NotionORM {
  public people: ReturnType<typeof people>;

  constructor(config: { auth: string }) {
    this.people = people(config.auth);
  }
}
