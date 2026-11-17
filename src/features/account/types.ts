import type { MemberRole } from '@/features/membershipCard/model';

export type Member = {
  id: string;
  membership_number: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  real_email: string;
  phone: string;
  address: string;
  photo_url: string | null;
  member_role: MemberRole;
  must_change_password: boolean;
  joined_at: string;
};

export const MEMBER_COLUMNS =
  'id, membership_number, full_name, first_name, last_name, real_email, phone, address, photo_url, member_role, must_change_password, joined_at';
