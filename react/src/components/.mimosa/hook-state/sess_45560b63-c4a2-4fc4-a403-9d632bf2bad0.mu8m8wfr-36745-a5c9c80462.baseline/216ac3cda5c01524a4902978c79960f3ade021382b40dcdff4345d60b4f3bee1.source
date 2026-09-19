import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string;
  description?: string;
  trend?: string;
  trendUp?: boolean;
  icon: LucideIcon;
  color: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'amber' | 'slate' | 'emerald';
  /** 集群监控页用大圆角 + 轻阴影 */
  variant?: 'default' | 'soft';
}

const StatCard: React.FC<StatCardProps> = ({ title, value, description, trend, trendUp, icon: Icon, color, variant = 'default' }) => {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    green: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    orange: 'bg-orange-50 text-orange-600 border-orange-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    slate: 'bg-slate-50 text-slate-600 border-slate-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  };

  const shell =
    variant === 'soft'
      ? 'rounded-3xl border border-slate-100/90 bg-white p-5 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.08)] hover:shadow-[0_12px_48px_-12px_rgba(15,23,42,0.1)] dark:border-slate-700/80 dark:bg-slate-950/80'
      : 'rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)]';

  return (
    <div data-cmp="StatCard" className={`flex flex-col justify-between transition-shadow duration-300 ${shell}`}>
      <div className={`flex justify-between items-start ${variant === 'soft' ? 'mb-3' : 'mb-4'}`}>
        <div className={`rounded-2xl border p-3 ${colorMap[color]}`}>
          <Icon size={variant === 'soft' ? 22 : 24} />
        </div>
        {trend && (
          <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${trendUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
            {trendUp ? '+' : '-'}{trend}
          </div>
        )}
      </div>
      <div>
        <h3
          className={cn(
            'mb-1 text-sm font-medium',
            variant === 'soft' ? 'text-slate-500 dark:text-slate-400' : 'text-slate-500'
          )}
        >
          {title}
        </h3>
        <div
          className={cn(
            'text-3xl font-bold tracking-tight',
            variant === 'soft' ? 'text-slate-900 dark:text-slate-50' : 'text-slate-900'
          )}
        >
          {value}
        </div>
        {description && (
          <div
            className={cn(
              'mt-1 text-xs tabular-nums',
              variant === 'soft' ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400'
            )}
          >
            {description}
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;