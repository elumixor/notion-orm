import { tasks } from "../generated/tasks";

export default class NotionORM {
  public tasks: ReturnType<typeof tasks>;

  constructor(config: { auth: string }) {
    this.tasks = tasks(config.auth);
  }
}
