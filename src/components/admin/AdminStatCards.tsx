import { useEffect, useState } from 'react';
import { Mail, ShieldAlert, UserCheck, UserPlus, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Stats = { pending: number; active: number; approvedThisMonth: number; failedEmails: number };

function startOfMonthIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export default function AdminStatCards() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from('membership_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('members').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('membership_applications').select('id', { count: 'exact', head: true }).eq('status', 'approved').gte('approved_at', startOfMonthIso()),
      supabase.from('email_logs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    ]).then((results) => {
      if (!active) return;
      if (results.some((result) => result.error)) {
        setError(true);
        return;
      }
      const [pending, active_, approved, failed] = results;
      setStats({
        pending: pending.count ?? 0,
        active: active_.count ?? 0,
        approvedThisMonth: approved.count ?? 0,
        failedEmails: failed.count ?? 0,
      });
    });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return <p role="alert" className="rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-700">تعذر تحميل الإحصاءات.</p>;
  }

  const cards = [
    { label: 'طلبات قيد المراجعة', value: stats?.pending, icon: Clock, tone: 'text-gold' },
    { label: 'أعضاء نشطون', value: stats?.active, icon: UserCheck, tone: 'text-teal' },
    { label: 'قبول هذا الشهر', value: stats?.approvedThisMonth, icon: UserPlus, tone: 'text-blue' },
    { label: 'بريد فاشل', value: stats?.failedEmails, icon: stats && stats.failedEmails > 0 ? ShieldAlert : Mail, tone: stats && stats.failedEmails > 0 ? 'text-red-700' : 'text-muted' },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, value, icon: Icon, tone }) => (
        <div key={label} className="soft-card p-5">
          <Icon className={tone} size={20} />
          {stats ? (
            <strong className="mt-4 block text-3xl font-black text-navy dark:text-white">{value}</strong>
          ) : (
            <div className="mt-4 h-9 w-16 animate-pulse rounded-lg bg-navy/5 dark:bg-white/5" />
          )}
          <span className="mt-1 block text-sm font-bold text-muted">{label}</span>
        </div>
      ))}
    </div>
  );
}
