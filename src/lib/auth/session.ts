import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getSql } from '../db';
import { createSupabaseServer } from '../supabase/server';
import { PermissionError, type Actor } from './permissions';

/** The signed-in user with role and team assignments, or null for anonymous visitors. Cached per request. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const supabase = await createSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const sql = getSql();
  let [profile] = await sql`select id, display_name, role from profiles where id = ${user.id}`;
  if (!profile) {
    // The on-signup trigger normally creates this; fall back for users created before migrations ran
    [profile] = await sql`insert into profiles (id, display_name) values (${user.id}, ${user.email?.split('@')[0] ?? 'Coach'})
                          on conflict (id) do update set id = excluded.id returning id, display_name, role`;
  }
  const staff = await sql`select team_id, role from team_staff where user_id = ${user.id}`;
  return {
    userId: user.id,
    role: profile.role,
    displayName: profile.displayName,
    ownedTeamIds: staff.filter((s) => s.role === 'owner').map((s) => s.teamId),
    assistantTeamIds: staff.filter((s) => s.role === 'assistant').map((s) => s.teamId),
  };
});

export async function requireActor(): Promise<Actor> {
  const a = await getActor();
  if (!a) redirect('/login');
  return a;
}

export async function requireCommissionerActor(): Promise<Actor> {
  const a = await getActor();
  if (!a || a.role !== 'commissioner') throw new PermissionError('Commissioner access required.');
  return a;
}
