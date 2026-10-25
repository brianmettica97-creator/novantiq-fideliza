import type { Role } from './permissions';

export type ProgramType = 'stamps' | 'visits' | 'points' | 'milestones';
export type ProgramStatus = 'draft' | 'active' | 'paused' | 'archived';

export interface Membership {
  membership_id: string;
  merchant_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_color: string;
  category: string;
  role: Role;
  all_branches: boolean;
  branch_ids: string[];
  merchant_status: 'active' | 'suspended' | 'closed';
  operational_status: 'ok' | 'suspended' | 'closed' | 'trial_expired' | 'subscription_inactive' | 'no_subscription';
  onboarding_step: number;
  onboarding_completed_at: string | null;
  plan_id: string;
  subscription_status: string;
  trial_ends_at: string | null;
  features: Record<string, boolean>;
}

export interface Merchant {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  logo_url: string | null;
  brand_color: string;
  brand_text_color: string;
  contact_email: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  status: string;
  onboarding_step: number;
  onboarding_data: Record<string, any>;
  onboarding_completed_at: string | null;
}

export interface Program {
  id: string;
  merchant_id: string;
  type: ProgramType;
  name: string;
  description: string;
  status: ProgramStatus;
  version: number;
  stamps_required: number | null;
  max_units_per_tx: number;
  earn_points: number | null;
  earn_amount: number | null;
  max_points_per_tx: number | null;
  max_amount_per_tx: number | null;
  daily_limit_per_card: number;
  min_minutes_between: number;
  welcome_bonus: number;
  terms: string;
  bg_color: string;
  text_color: string;
  accent_color: string;
  logo_url: string | null;
  stamp_icon: string;
  starts_at: string | null;
  ends_at: string | null;
  all_branches: boolean;
  join_code: string;
  join_enabled: boolean;
  published_at: string | null;
  created_at: string;
}

export interface Reward {
  id: string;
  merchant_id: string;
  program_id: string;
  name: string;
  description: string;
  image_url: string | null;
  cost: number;
  terms: string;
  valid_from: string | null;
  valid_until: string | null;
  stock: number | null;
  redeemed_count: number;
  max_per_card: number | null;
  status: 'active' | 'paused' | 'archived';
  all_branches: boolean;
  sort_order: number;
}

export interface Branch {
  id: string;
  merchant_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  active: boolean;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  price_ars: number;
  max_branches: number | null;
  max_staff: number | null;
  max_programs: number | null;
  max_cards: number | null;
  features: Record<string, boolean>;
  sort_order: number;
  is_public: boolean;
  active: boolean;
}

export interface CardReward {
  id: string;
  name: string;
  description: string;
  cost: number;
  terms: string;
  image_url: string | null;
  valid_until: string | null;
  block_reason: string | null;
}

/** Datos mínimos para dibujar una tarjeta. */
export interface CardLook {
  type: ProgramType;
  name: string;
  merchantName: string;
  logoUrl?: string | null;
  bgColor: string;
  textColor: string;
  accentColor: string;
  stampIcon: string;
  stampsRequired?: number | null;
  balance: number;
  rewardName?: string;
  code?: string;
}
