export type Member = {
  id: string;
  membership_number: string;
  full_name: string;
  real_email: string;
  phone: string;
  address: string;
  photo_url: string | null;
  must_change_password: boolean;
  joined_at: string;
};

export const MEMBER_COLUMNS =
  'id, membership_number, full_name, real_email, phone, address, photo_url, must_change_password, joined_at';
