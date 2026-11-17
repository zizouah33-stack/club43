export type MemberRole = 'enrolled' | 'member' | 'honorary' | 'presidency';

export const MEMBER_ROLE_LABEL: Record<MemberRole, string> = {
  enrolled: 'منخرط',
  member: 'عضو',
  honorary: 'عضو شرفي',
  presidency: 'من رئاسة النادي',
};

export const MEMBER_ROLE_OPTIONS: { value: MemberRole; label: string }[] = [
  { value: 'enrolled', label: 'منخرط' },
  { value: 'member', label: 'عضو' },
  { value: 'honorary', label: 'عضو شرفي' },
  { value: 'presidency', label: 'من رئاسة النادي' },
];

export type CardMemberData = {
  membership_number: string;
  first_name: string | null;
  last_name: string | null;
};

export type MembershipCardRecord = {
  id: string;
  member_id: string;
  status: 'active' | 'revoked';
  current_version: number;
  issued_at: string;
  updated_at: string;
  last_generated_by: string | null;
};

export const CARD_COLUMNS = 'id, member_id, status, current_version, issued_at, updated_at, last_generated_by';
export const CARD_TEMPLATE_PATH = '/templates/بطاقة_الانخراط.jpeg';
export const CARD_TEMPLATE_STORAGE_PATH = 'templates/بطاقة_الانخراط.jpeg';
