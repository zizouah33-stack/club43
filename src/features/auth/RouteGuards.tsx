import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

type GuardState = 'checking' | 'allowed' | 'denied';

function useGuard(check: () => Promise<boolean>) {
  const [state, setState] = useState<GuardState>('checking');
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        if (active) setState('denied');
        return;
      }
      const allowed = await check().catch(() => false);
      if (active) setState(allowed ? 'allowed' : 'denied');
    })();
    return () => {
      active = false;
    };
  }, [check]);
  return state;
}

const checkAdmin = async () => {
  const { data, error } = await supabase.from('admin_users').select('role').maybeSingle();
  return !error && data !== null;
};

const checkSuperAdmin = async () => {
  const { data, error } = await supabase.rpc('is_super_admin');
  return !error && data === true;
};

const checkMember = async () => {
  const { data, error } = await supabase.from('members').select('id').maybeSingle();
  return !error && data !== null;
};

function Guarded({ check, children, deniedTo = '/login' }: { check: () => Promise<boolean>; children: ReactNode; deniedTo?: string }) {
  const state = useGuard(check);
  if (state === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-sand dark:bg-navy">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-navy/15 border-t-blue" role="status" aria-label="جارٍ التحقق" />
      </main>
    );
  }
  if (state === 'denied') return <Navigate to={deniedTo} replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  return <Guarded check={checkAdmin}>{children}</Guarded>;
}

export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  return <Guarded check={checkSuperAdmin} deniedTo="/admin/dashboard">{children}</Guarded>;
}

export function RequireMember({ children }: { children: ReactNode }) {
  return <Guarded check={checkMember}>{children}</Guarded>;
}
