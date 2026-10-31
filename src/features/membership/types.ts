export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export type Application = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string;
  birth_date: string | null;
  gender: string | null;
  address: string;
  education_or_job: string;
  interests: string[];
  motivation: string;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_consent: boolean;
  bylaws_accepted: boolean;
  status: ApplicationStatus;
  rejection_reason: string | null;
  reviewed_at: string | null;
  membership_number: string | null;
  created_at: string;
};

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending: 'قيد المراجعة',
  approved: 'مقبولة',
  rejected: 'مرفوضة',
};

export const STATUS_BADGE: Record<ApplicationStatus, string> = {
  pending: 'bg-gold/25 text-navy',
  approved: 'bg-teal/15 text-teal',
  rejected: 'bg-red-500/10 text-red-700',
};
