import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminStatCards from '@/components/admin/AdminStatCards';
import MembersManager from '@/components/admin/MembersManager';
import LogsPanel from '@/components/admin/LogsPanel';

type Tab = 'members' | 'email' | 'audit';
const TABS: { key: Tab; label: string }[] = [
  { key: 'members', label: 'الأعضاء' },
  { key: 'email', label: 'سجل البريد' },
  { key: 'audit', label: 'سجل الإجراءات' },
];

export default function MembersPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('members');

  return (
    <main className="min-h-screen bg-sand px-4 py-8 dark:bg-navy sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <button type="button" onClick={() => navigate('/admin/dashboard')} className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-blue">
            <ArrowRight size={16} /> العودة إلى لوحة الإدارة
          </button>
          <h1 className="text-2xl font-black text-navy dark:text-white">الأعضاء والسجلات</h1>
        </header>

        <AdminStatCards />

        <div role="tablist" aria-label="أقسام الأعضاء" className="flex flex-wrap gap-2">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={`min-h-11 rounded-full px-4 text-sm font-bold transition ${tab === item.key ? 'bg-navy text-white' : 'bg-white text-navy hover:bg-blue/10 dark:bg-white/10 dark:text-white'}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'members' && <MembersManager />}
        {tab === 'email' && <LogsPanel kind="email" />}
        {tab === 'audit' && <LogsPanel kind="audit" />}
      </div>
    </main>
  );
}
