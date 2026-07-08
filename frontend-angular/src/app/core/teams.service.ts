import { Injectable, inject, signal } from '@angular/core';
import { TeamsService as TeamsApi } from '../api/services/teams.service';
import { Team } from '../api/models/team';

// Named TeamsStore (not TeamsService) to avoid colliding with the generated
// api/services/teams.service.ts — hand-rolled cached-signal store (ADR-18).
@Injectable({ providedIn: 'root' })
export class TeamsStore {
  private readonly api = inject(TeamsApi);

  readonly teams = signal<Team[] | undefined>(undefined);
  private inflight: Promise<Team[]> | null = null;

  load(): Promise<Team[]> {
    const current = this.teams();
    if (current !== undefined) return Promise.resolve(current);
    if (this.inflight) return this.inflight;
    this.inflight = this.refetch().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  async refetch(): Promise<Team[]> {
    const teams = await this.api.listTeams();
    this.teams.set(teams);
    return teams;
  }

  async create(name: string): Promise<Team> {
    const team = await this.api.createTeam({ body: { name } });
    await this.refetch();
    return team;
  }

  async rename(id: number, name: string): Promise<Team> {
    const team = await this.api.updateTeam({ id, body: { name } });
    await this.refetch();
    return team;
  }

  async remove(id: number): Promise<void> {
    await this.api.deleteTeam({ id });
    await this.refetch();
  }
}
