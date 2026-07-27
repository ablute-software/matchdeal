/**
 * Tipos alinhados com supabase/migrations/0001_matchdeal_core.sql.
 * As tabelas `org_members` / `orgs` / `catalog_entities` são do schema JÁ
 * EXISTENTE do Sherlock Deal (connectB) — aqui só se referenciam por id,
 * nunca se redefinem.
 */

export type ProfileKind = 'startup' | 'investor';

export type CompanyPhase =
  | 'concept'
  | 'prototype'
  | 'pilot'
  | 'launch'
  | 'growth';

export type InvestmentStage =
  | 'pre_seed'
  | 'seed'
  | 'series_a'
  | 'series_b_plus'
  | 'growth';

export type SwipeDirection = 'like' | 'pass';

export type MatchStatus =
  | 'pending_consent'
  | 'declined_by_startup'
  | 'active'
  | 'expired_no_followup'
  | 'closed_by_startup';

export type QueueEntryStatus = 'waiting' | 'active' | 'expired' | 'declined';

export interface MatchDealProfile {
  id: string;
  // Âncora polimórfica: kind='startup' -> orgs.id (via org_members.org_id);
  // kind='investor' -> matchdeal_investor_members.id (vínculo provisório).
  membership_id: string;
  plan_tier: 'A' | 'B' | 'C';
  kind: ProfileKind;
  is_complete: boolean;
  is_visible: boolean;
  photo_url: string | null;
  website: string | null;
  sectors: string[];
  country: string | null;
  description: string | null;
  // startup-only
  target_round_amount: number | null;
  investment_stage_sought: InvestmentStage | null;
  company_phase: CompanyPhase | null;
  founded_year: number | null;
  intellectual_property: string | null;
  revenue: string | null;
  team_summary: string | null;
  pitch_deck_url: string | null;
  gallery_urls: string[];
  contact: string | null;
  // investor-only
  representative_name: string | null;
  entity_name: string | null;
  entity_logo_url: string | null;
  entity_type: string | null;
  representative_linkedin: string | null;
  stages_invested: InvestmentStage[];
  phases_accepted: CompanyPhase[];
  geographies: string[];
  company_types: string[];
  specific_criteria: string | null;
  ticket_min: number | null;
  ticket_max: number | null;
  lead_or_colead: string | null;
  instruments: string[];
  active_fund: string | null;
  portfolio_companies: string | null;
  recent_investments: string | null;
  preferred_contact_channel: string | null; // NUNCA exposto à startup na UI
  created_at: string;
  updated_at: string;
}

export interface MatchDealSwipe {
  id: string;
  actor_profile_id: string;
  target_profile_id: string;
  direction: SwipeDirection;
  created_at: string;
}

export interface MatchDealMatch {
  id: string;
  startup_profile_id: string;
  investor_catalog_entity_id: string; // catalog_entities.id — agrupa por entidade, não por pessoa
  status: MatchStatus;
  active_investor_profile_id: string | null;
  created_at: string;
  updated_at: string;
  cooldown_until: string | null;
}

export interface MatchDealQueueEntry {
  id: string;
  match_id: string;
  investor_profile_id: string;
  position: number;
  status: QueueEntryStatus;
  joined_at: string;
  became_active_at: string | null;
  sla_deadline: string | null;
  used_still_interested_reset: boolean;
}

export interface MatchDealDataroomConsent {
  id: string;
  match_id: string;
  granted: boolean;
  decline_reason: string | null;
  decided_at: string;
}

export interface MatchDealMessage {
  id: string;
  match_id: string;
  sender_profile_id: string | null; // null => mensagem de sistema
  kind: 'system' | 'user' | 'meeting_proposal';
  body: string;
  created_at: string;
}

export interface MatchDealMeetingProposal {
  id: string;
  match_id: string;
  proposed_by_profile_id: string;
  proposed_slots: string[]; // ISO timestamps
  confirmed_slot: string | null;
  created_at: string;
}

export interface MatchDealDeviceLink {
  id: string;
  pairing_token: string;
  membership_id: string | null;
  device_id: string | null;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Database {
  // Placeholder para o tipo gerado pelo Supabase CLI
  // (`supabase gen types typescript`) depois de as migrações serem
  // aplicadas ao projeto real. Manter este ficheiro como fallback de
  // desenvolvimento.
}
