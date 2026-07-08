import { Injectable, Signal, WritableSignal, inject, signal } from '@angular/core';
import { EpicsService as EpicsApi } from '../api/services/epics.service';
import { Epic } from '../api/models/epic';

interface EpicWrite {
  title: string;
  description: string;
}

interface Entry {
  epics: WritableSignal<Epic[] | undefined>;
  inflight: Promise<Epic[]> | null;
}

// Named EpicsStore (not EpicsService) to avoid colliding with the generated
// api/services/epics.service.ts — per-team cached-signal store (ADR-18).
@Injectable({ providedIn: 'root' })
export class EpicsStore {
  private readonly api = inject(EpicsApi);
  private readonly cache = new Map<number, Entry>();

  private entry(teamId: number): Entry {
    let e = this.cache.get(teamId);
    if (!e) {
      e = { epics: signal(undefined), inflight: null };
      this.cache.set(teamId, e);
    }
    return e;
  }

  epicsFor(teamId: number): Signal<Epic[] | undefined> {
    const e = this.entry(teamId);
    if (e.epics() === undefined && !e.inflight) {
      e.inflight = this.api
        .listEpics({ teamId })
        .then((list) => {
          e.epics.set(list);
          return list;
        })
        .finally(() => {
          e.inflight = null;
        });
    }
    return e.epics;
  }

  async refetch(teamId: number): Promise<void> {
    const list = await this.api.listEpics({ teamId });
    this.entry(teamId).epics.set(list);
  }

  async create(teamId: number, data: EpicWrite): Promise<Epic> {
    const epic = await this.api.createEpic({ body: { teamId, ...data } });
    await this.refetch(epic.teamId);
    return epic;
  }

  async update(id: number, teamId: number, data: Partial<EpicWrite>): Promise<Epic> {
    const epic = await this.api.updateEpic({ id, body: data });
    await this.refetch(epic.teamId);
    return epic;
  }

  async remove(id: number, teamId: number): Promise<void> {
    await this.api.deleteEpic({ id });
    await this.refetch(teamId);
  }
}
