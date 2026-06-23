import type { ActionLog, ActionStatus } from "./types";
import {isMutationType} from "./types";

export class ActionTracker{ // tracks all the changes done by the agent, append only log
    private actions: ActionLog[] = []

    log(
    entry: Omit<ActionLog, "id" | "timestamp"> & { // id and timestamps are optional, 
      id?: string;
      timestamp?: Date;
    },
  ): ActionLog {
    const action: ActionLog = {
      id: entry.id ?? `action_${this.actions.length}`, // if no id is was passed generate your own (action_0)
      timestamp: entry.timestamp ?? new Date(), // if no timestamp was provided take current one 
      type: entry.type,
      path: entry.path,
      details: { ...entry.details }, // spread into new object (shallow copy) so the original lof isn't affected by the mutated one
      status: entry.status,
      userApproved: entry.userApproved,
    };
    this.actions.push(action);
    return action;
  }

    getActions(): readonly ActionLog[] {
        return this.actions;
    }

    getPendingMutations(): ActionLog[] {
        return this.actions.filter(
            (a)=> isMutationType(a.type) && a.status === "pending"
        )
    }

    updateStatus(id: string, status: ActionStatus, userApproved?: boolean): void { // id for action, new status to set, option user approval and void beacuse it doesnt return anything
    const a = this.actions.find((x) => x.id === id); // searches the action array for id matches
    if (!a) return; // if not matches, nothing to update
    a.status = status; // if found mutates into new status
    if (userApproved !== undefined) a.userApproved = userApproved; // only updates userApproved if it was actually passed in
  }
}